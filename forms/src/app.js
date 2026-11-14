/**
 * HTTP routes.
 *
 *   GET  /health                 liveness check
 *   GET  /v1/challenge?site=ID   proof-of-work challenge for a form
 *   POST /v1/submit              submit a message (JSON)
 *   POST /v1/rate                1-5 star rating (JSON), for sites with `ratings: true`
 *   GET  /v1/ratings/summary?site=ID   public count, average and distribution
 *   GET  /v1/widget.js           embeddable form for any configured site
 *   /admin...                    admin page and API, see admin.js
 *
 * Spam defenses on submit, cheapest first: allowed origin, honeypot field,
 * proof of work (also enforces a minimum time on the form and is single
 * use), per-IP rate limits, and content rules. Ratings get the same
 * defenses except the honeypot, and count once per client id.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createChallenge, verifySolution } from './pow.js';
import { validateRating, validateSubmission } from './validate.js';
import { HttpError, readJson, sendJson } from './http.js';
import { createAdmin } from './admin.js';

const CHALLENGE_LIMITS = [{ windowMs: 60 * 60 * 1000, max: 60 }];
// Per IP and site. Changing your rating counts too.
const RATING_LIMITS = [
  { windowMs: 60 * 60 * 1000, max: 5 },
  { windowMs: 24 * 60 * 60 * 1000, max: 10 },
];
const SUMMARY_CACHE_SECONDS = 300;
const WIDGET_SOURCE = readFileSync(new URL('../public/widget.js', import.meta.url), 'utf8');

// Why a message or rating was turned away, for the admin page's health view.
// Expired, reused and too-fast challenges aren't counted: real clients get
// those too and retry.
const BLOCK_REASONS = {
  origin_not_allowed: 'origin',
  challenge_failed: 'proofOfWork',
  rate_limited: 'rateLimited',
  invalid_fields: 'invalid',
};

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

  // In memory, so it resets on restart; the admin page says "since <startedAt>"
  const activity = {
    startedAt: new Date(now()).toISOString(),
    blocked: { honeypot: 0, origin: 0, proofOfWork: 0, rateLimited: 0, invalid: 0 },
    smtp: null,          // { ok, checkedAt, error? } from the last SMTP check
    lastDelivery: null,  // { ok, at, submissionId, error? }
  };

  function countBlocked(code) {
    const reason = BLOCK_REASONS[code];
    if (reason) activity.blocked[reason] += 1;
  }

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
      activity.lastDelivery = { ok: true, at: new Date(now()).toISOString(), submissionId };
    } catch (error) {
      store.markFailed(submissionId, error.message || error);
      activity.lastDelivery = { ok: false, at: new Date(now()).toISOString(), submissionId, error: String(error.message || error).slice(0, 300) };
      console.error(`[forms] Email for submission #${submissionId} failed:`, error.message || error);
    }
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

  async function handleSubmit(req, res, origin) {
    const body = await readJson(req);
    const site = siteForRequest(body.site, origin);
    const cors = corsHeaders(origin);

    // Honeypot: people never see this field. Pretend success so bots learn nothing.
    if (body.website) {
      activity.blocked.honeypot += 1;
      return sendJson(res, 200, { ok: true }, cors);
    }

    const expiresAt = checkProofOfWork(body.altcha);

    const validation = validateSubmission(body, site);
    if (!validation.ok) {
      countBlocked('invalid_fields');
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
      countBlocked('invalid_fields');
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

  const admin = createAdmin({ config, store, options, activity, deliver, now });

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

      if (req.method === 'GET' && url.pathname === '/v1/widget.js') {
        res.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        });
        return res.end(WIDGET_SOURCE);
      }

      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
        return await admin.handle(req, res, url);
      }

      throw new HttpError(404, 'not_found');
    } catch (error) {
      if (error instanceof HttpError) {
        if (url.pathname === '/v1/submit' || url.pathname === '/v1/rate') countBlocked(error.code);
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

  /** Result of mailer.verify(), shown on the admin page */
  function recordSmtpCheck(ok, error) {
    activity.smtp = { ok, checkedAt: new Date(now()).toISOString(), ...(error ? { error: String(error).slice(0, 300) } : {}) };
  }

  return { handler, retryPendingDeliveries, recordSmtpCheck };
}
