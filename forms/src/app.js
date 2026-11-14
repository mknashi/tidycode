/**
 * HTTP routes.
 *
 *   GET  /health                 liveness check
 *   GET  /v1/challenge?site=ID   proof-of-work challenge for a form
 *   POST /v1/submit              submit a message (JSON)
 *   POST /v1/rate                1-5 star rating (JSON), for sites with `ratings: true`
 *   GET  /v1/ratings/summary?site=ID   public count, average and distribution
 *   GET  /v1/widget.js           embeddable form for any configured site
 *   GET  /admin/submissions      archive (Authorization: Bearer ADMIN_TOKEN)
 *   GET  /admin/ratings          ratings, newest first (same token)
 *   DELETE /admin/ratings/ID     remove a rating, e.g. one of a spam burst (same token)
 *
 * Spam defenses on submit, cheapest first: allowed origin, honeypot field,
 * proof of work (also enforces a minimum time on the form and is single
 * use), per-IP rate limits, and content rules. Ratings get the same
 * defenses except the honeypot, and count once per client id.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createChallenge, verifySolution } from './pow.js';
import { validateRating, validateSubmission } from './validate.js';

const MAX_BODY_BYTES = 32 * 1024;
const CHALLENGE_LIMITS = [{ windowMs: 60 * 60 * 1000, max: 60 }];
// Per IP and site. Changing your rating counts too.
const RATING_LIMITS = [
  { windowMs: 60 * 60 * 1000, max: 5 },
  { windowMs: 24 * 60 * 60 * 1000, max: 10 },
];
const SUMMARY_CACHE_SECONDS = 300;
const WIDGET_SOURCE = readFileSync(new URL('../public/widget.js', import.meta.url), 'utf8');

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * @param {Object} deps
 * @param {{ sites: Map<string, Object> }} deps.config
 * @param {import('./store.js').Store} deps.store
 * @param {{ send: Function }} deps.mailer
 * @param {import('./rateLimit.js').RateLimiter} deps.rateLimiter
 * @param {Object} deps.options - hmacKey, adminToken, ipSalt, trustProxy, clientIpHeader, challengeTtlMs, minFormMs, powMaxNumber
 * @param {() => number} [deps.now]
 */
export function createApp({ config, store, mailer, rateLimiter, options, now = Date.now }) {
  const allOrigins = new Set([...config.sites.values()].flatMap(site => site.origins));

  function clientIp(req) {
    // Behind Cloudflare, Traefik sees Cloudflare's address; the visitor's is in CF-Connecting-IP
    if (options.clientIpHeader && req.headers[options.clientIpHeader]) {
      return String(req.headers[options.clientIpHeader]).trim();
    }
    if (options.trustProxy) {
      // Traefik appends the address it saw; earlier entries can be forged by the client
      const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
      if (forwarded.length > 0) return forwarded[forwarded.length - 1];
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function hashIp(ip) {
    return createHash('sha256').update(options.ipSalt + ip).digest('hex').slice(0, 32);
  }

  function corsHeaders(origin) {
    return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  }

  /** The site, provided the request comes from one of its origins */
  function siteForRequest(siteId, origin) {
    const site = config.sites.get(siteId);
    if (!site) throw new HttpError(404, 'unknown_site');
    if (!origin || !site.origins.includes(origin)) throw new HttpError(403, 'origin_not_allowed');
    return site;
  }

  async function deliver(submissionId) {
    const submission = store.getSubmission(submissionId);
    const site = config.sites.get(submission.site);
    if (!site) return;
    try {
      await mailer.send(site, submission);
      store.markSent(submissionId);
    } catch (error) {
      store.markFailed(submissionId, error.message || error);
      console.error(`[forms] Email for submission #${submissionId} failed:`, error.message || error);
    }
  }

  async function readJson(req) {
    if (!String(req.headers['content-type'] || '').includes('application/json')) {
      throw new HttpError(415, 'json_required');
    }
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, 'invalid_json');
    }
    if (!body || typeof body !== 'object') throw new HttpError(400, 'invalid_json');
    return body;
  }

  /** @returns {number} When the challenge expires, for marking it used */
  function checkProofOfWork(altcha) {
    const pow = verifySolution(altcha, {
      hmacKey: options.hmacKey,
      ttlMs: options.challengeTtlMs,
      minAgeMs: options.minFormMs,
      now: now(),
    });
    if (!pow.ok) {
      const code = pow.reason === 'expired' ? 'challenge_expired' : pow.reason === 'too_fast' ? 'too_fast' : 'challenge_failed';
      throw new HttpError(400, code);
    }
    return pow.expiresAt;
  }

  function requireAdmin(req) {
    const auth = String(req.headers.authorization || '');
    if (!options.adminToken || !safeEqual(auth, `Bearer ${options.adminToken}`)) {
      throw new HttpError(401, 'unauthorized');
    }
  }

  async function handleSubmit(req, res, origin) {
    const body = await readJson(req);
    const site = siteForRequest(body.site, origin);
    const cors = corsHeaders(origin);

    // Honeypot: people never see this field. Pretend success so bots learn nothing.
    if (body.website) return sendJson(res, 200, { ok: true }, cors);

    const expiresAt = checkProofOfWork(body.altcha);

    const validation = validateSubmission(body, site);
    if (!validation.ok) {
      return sendJson(res, 400, { ok: false, error: 'invalid_fields', fields: validation.errors }, cors);
    }

    const ip = clientIp(req);
    if (!rateLimiter.allow(`submit:${site.id}:${ip}`, site.limits, now())) {
      throw new HttpError(429, 'rate_limited');
    }
    // Checked last so a rejected submission doesn't burn the solved challenge
    if (!store.useChallenge(body.altcha.signature, expiresAt)) throw new HttpError(400, 'challenge_used');

    const id = store.insertSubmission({ site: site.id, ...validation.value, ipHash: hashIp(ip) });
    // The message is safely stored; email failures are retried in the background
    await deliver(id);
    return sendJson(res, 200, { ok: true }, cors);
  }

  async function handleRate(req, res, origin) {
    const body = await readJson(req);
    const site = siteForRequest(body.site, origin);
    if (!site.ratings) throw new HttpError(404, 'ratings_disabled');
    const cors = corsHeaders(origin);

    const expiresAt = checkProofOfWork(body.altcha);

    const validation = validateRating(body);
    if (!validation.ok) {
      return sendJson(res, 400, { ok: false, error: 'invalid_fields', fields: validation.errors }, cors);
    }

    const ip = clientIp(req);
    if (!rateLimiter.allow(`rate:${site.id}:${ip}`, RATING_LIMITS, now())) {
      throw new HttpError(429, 'rate_limited');
    }
    if (!store.useChallenge(body.altcha.signature, expiresAt)) throw new HttpError(400, 'challenge_used');

    const { stars, clientId, page } = validation.value;
    const created = store.upsertRating(
      { site: site.id, clientHash: hashIp(`client:${clientId}`), stars, page, ipHash: hashIp(ip) },
      new Date(now()),
    );
    return sendJson(res, 200, { ok: true, created }, cors);
  }

  /** Public, so the site's build can read it; no origin check */
  function handleRatingSummary(res, url) {
    const site = config.sites.get(url.searchParams.get('site'));
    if (!site || !site.ratings) throw new HttpError(404, 'unknown_site');
    return sendJson(res, 200, { ok: true, site: site.id, ...store.ratingSummary(site.id) }, {
      'Cache-Control': `public, max-age=${SUMMARY_CACHE_SECONDS}`,
      'Access-Control-Allow-Origin': '*',
    });
  }

  function handleAdminRatings(req, res, url) {
    requireAdmin(req);
    if (req.method === 'DELETE') {
      const id = Number(url.pathname.slice('/admin/ratings/'.length));
      if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'not_found');
      if (!store.deleteRating(id)) throw new HttpError(404, 'not_found');
      return sendJson(res, 200, { ok: true });
    }
    const ratings = store.listRatings({
      site: url.searchParams.get('site') || undefined,
      limit: Number(url.searchParams.get('limit')) || 50,
      beforeId: Number(url.searchParams.get('before')) || undefined,
    });
    return sendJson(res, 200, { ok: true, ratings });
  }

  function handleAdmin(req, res, url) {
    requireAdmin(req);
    const submissions = store.listSubmissions({
      site: url.searchParams.get('site') || undefined,
      limit: Number(url.searchParams.get('limit')) || 50,
      beforeId: Number(url.searchParams.get('before')) || undefined,
    });
    return sendJson(res, 200, { ok: true, submissions });
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin ? String(req.headers.origin).toLowerCase() : null;
    const allowedOrigin = origin && allOrigins.has(origin) ? origin : null;

    try {
      if (req.method === 'OPTIONS' && url.pathname.startsWith('/v1/')) {
        if (!allowedOrigin) throw new HttpError(403, 'origin_not_allowed');
        res.writeHead(204, {
          ...corsHeaders(allowedOrigin),
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        });
        return res.end();
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && url.pathname === '/v1/challenge') {
        siteForRequest(url.searchParams.get('site'), origin);
        if (!rateLimiter.allow(`challenge:${clientIp(req)}`, CHALLENGE_LIMITS, now())) {
          throw new HttpError(429, 'rate_limited');
        }
        const challenge = createChallenge({
          hmacKey: options.hmacKey,
          maxNumber: options.powMaxNumber,
          ttlMs: options.challengeTtlMs,
          now: now(),
        });
        return sendJson(res, 200, challenge, corsHeaders(origin));
      }

      if (req.method === 'POST' && url.pathname === '/v1/submit') {
        return await handleSubmit(req, res, origin);
      }

      if (req.method === 'POST' && url.pathname === '/v1/rate') {
        return await handleRate(req, res, origin);
      }

      if (req.method === 'GET' && url.pathname === '/v1/ratings/summary') {
        return handleRatingSummary(res, url);
      }

      if ((req.method === 'GET' && url.pathname === '/admin/ratings')
        || (req.method === 'DELETE' && url.pathname.startsWith('/admin/ratings/'))) {
        return handleAdminRatings(req, res, url);
      }

      if (req.method === 'GET' && url.pathname === '/v1/widget.js') {
        res.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        });
        return res.end(WIDGET_SOURCE);
      }

      if (req.method === 'GET' && url.pathname === '/admin/submissions') {
        return handleAdmin(req, res, url);
      }

      throw new HttpError(404, 'not_found');
    } catch (error) {
      if (error instanceof HttpError) {
        return sendJson(res, error.status, { ok: false, error: error.code }, corsHeaders(allowedOrigin));
      }
      console.error('[forms] Unexpected error:', error);
      return sendJson(res, 500, { ok: false, error: 'server_error' }, corsHeaders(allowedOrigin));
    }
  };

  /** Retry emails that failed, e.g. while SES was unreachable */
  async function retryPendingDeliveries() {
    for (const submission of store.pendingDeliveries()) {
      await deliver(submission.id);
    }
  }

  return { handler, retryPendingDeliveries };
}
