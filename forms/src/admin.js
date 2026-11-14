/**
 * Admin page and API. The page (public/admin/) is static and needs no token
 * to load; every /admin/api route needs `Authorization: Bearer ADMIN_TOKEN`.
 *
 *   GET    /admin                          the admin page
 *   GET    /admin/api/overview             counts per site, ratings summaries, service health
 *   GET    /admin/api/messages             ?site&status&handled=true|false&q&limit&before
 *   POST   /admin/api/messages/ID/handled  JSON { handled: true|false }
 *   POST   /admin/api/messages/ID/retry    send the email again now
 *   DELETE /admin/api/messages/ID
 *   GET    /admin/api/ratings              ?site&ip_hash&limit&before
 *   GET    /admin/api/ratings/insights     ?site: per day (90 days), per page, IP hashes with several ratings
 *   DELETE /admin/api/ratings/ID
 *   DELETE /admin/api/ratings              ?site&ip_hash: every rating from one IP hash
 *   GET    /admin/api/export               ?site&type=messages|ratings, CSV
 *
 * The older /admin/submissions and /admin/ratings URLs keep working.
 *
 * Messages are written by the public, so the page only ever inserts them as
 * text, and the strict Content-Security-Policy below blocks any script that
 * isn't the page's own.
 */

import { readFileSync } from 'node:fs';
import { HttpError, readJson, safeEqual, sendJson } from './http.js';

const PAGE_FILES = {
  '/admin': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/admin/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/admin/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/admin/app.css': { file: 'app.css', type: 'text/css; charset=utf-8' },
};
const PAGE_SOURCES = Object.fromEntries(
  [...new Set(Object.values(PAGE_FILES).map(entry => entry.file))].map(file => [
    file,
    readFileSync(new URL(`../public/admin/${file}`, import.meta.url), 'utf8'),
  ]),
);

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

const STATUSES = new Set(['pending', 'sent', 'failed']);

/** One CSV cell. Cells a spreadsheet would run as a formula get a leading quote. */
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const lines = [columns.map(column => csvCell(column.label)).join(',')];
  for (const row of rows) lines.push(columns.map(column => csvCell(column.value(row))).join(','));
  // BOM so Excel reads UTF-8
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

const MESSAGE_COLUMNS = [
  { label: 'id', value: row => row.id },
  { label: 'site', value: row => row.site },
  { label: 'created_at', value: row => row.created_at },
  { label: 'name', value: row => row.name },
  { label: 'email', value: row => row.email },
  { label: 'message', value: row => row.message },
  { label: 'page', value: row => row.page },
  { label: 'meta', value: row => Object.entries(row.meta || {}).map(([key, value]) => `${key}: ${value}`).join('; ') },
  { label: 'email_status', value: row => row.status },
  { label: 'attempts', value: row => row.attempts },
  { label: 'last_error', value: row => row.last_error },
  { label: 'handled_at', value: row => row.handled_at },
];

const RATING_COLUMNS = [
  { label: 'id', value: row => row.id },
  { label: 'site', value: row => row.site },
  { label: 'stars', value: row => row.stars },
  { label: 'page', value: row => row.page },
  { label: 'ip_hash', value: row => row.ip_hash },
  { label: 'created_at', value: row => row.created_at },
  { label: 'updated_at', value: row => row.updated_at },
];

function positiveId(text) {
  const id = Number(text);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'not_found');
  return id;
}

/**
 * @param {Object} deps
 * @param {{ sites: Map<string, Object> }} deps.config
 * @param {import('./store.js').Store} deps.store
 * @param {{ adminToken?: string }} deps.options
 * @param {Object} deps.activity - Counters and last SMTP results kept by app.js
 * @param {(id: number) => Promise<void>} deps.deliver
 * @param {() => number} deps.now
 */
export function createAdmin({ config, store, options, activity, deliver, now }) {
  function requireAdmin(req) {
    const auth = String(req.headers.authorization || '');
    if (!options.adminToken || !safeEqual(auth, `Bearer ${options.adminToken}`)) {
      throw new HttpError(401, 'unauthorized');
    }
  }

  function json(res, body) {
    return sendJson(res, 200, { ok: true, ...body }, SECURITY_HEADERS);
  }

  /** Site id from the query: a configured site, or undefined for all */
  function siteParam(url, { required = false, ratings = false } = {}) {
    const id = url.searchParams.get('site') || undefined;
    if (!id) {
      if (required) throw new HttpError(400, 'site_required');
      return undefined;
    }
    const site = config.sites.get(id);
    if (!site || (ratings && !site.ratings)) throw new HttpError(404, 'unknown_site');
    return site.id;
  }

  function listParams(url) {
    return {
      limit: Number(url.searchParams.get('limit')) || 50,
      beforeId: Number(url.searchParams.get('before')) || undefined,
    };
  }

  function overview() {
    const messages = new Map(store.messageStats(now()).map(row => [row.site, row]));
    const recentRatings = new Map(store.recentRatingCounts(now()).map(row => [row.site, row.last7]));
    const sites = [...config.sites.values()].map(site => {
      const stats = messages.get(site.id) || {};
      return {
        id: site.id,
        name: site.name,
        ratingsEnabled: site.ratings,
        messages: {
          total: stats.total || 0,
          last7: stats.last7 || 0,
          last30: stats.last30 || 0,
          unhandled: stats.unhandled || 0,
          pending: stats.pending || 0,
          retrying: stats.retrying || 0,
          failed: stats.failed || 0,
        },
        ratings: site.ratings ? { ...store.ratingSummary(site.id), last7: recentRatings.get(site.id) || 0 } : null,
      };
    });
    return {
      sites,
      health: {
        startedAt: activity.startedAt,
        now: new Date(now()).toISOString(),
        smtp: activity.smtp,
        lastDelivery: activity.lastDelivery,
        blocked: activity.blocked,
      },
    };
  }

  async function handleApi(req, res, url) {
    requireAdmin(req);
    const path = url.pathname.slice('/admin/api'.length);
    const method = req.method;

    if (method === 'GET' && path === '/overview') return json(res, overview());

    if (method === 'GET' && path === '/messages') {
      const status = url.searchParams.get('status') || undefined;
      if (status && !STATUSES.has(status)) throw new HttpError(400, 'invalid_status');
      const handled = url.searchParams.get('handled');
      const messages = store.listSubmissions({
        site: siteParam(url),
        status,
        handled: handled === 'true' ? true : handled === 'false' ? false : undefined,
        q: (url.searchParams.get('q') || '').trim().slice(0, 200) || undefined,
        ...listParams(url),
      });
      return json(res, { messages });
    }

    let match = path.match(/^\/messages\/([^/]+)\/(handled|retry)$/);
    if (method === 'POST' && match) {
      const id = positiveId(match[1]);
      if (!store.getSubmission(id)) throw new HttpError(404, 'not_found');
      if (match[2] === 'handled') {
        const body = await readJson(req);
        if (typeof body.handled !== 'boolean') throw new HttpError(400, 'handled_required');
        store.setHandled(id, body.handled, new Date(now()));
      } else {
        await deliver(id);
      }
      return json(res, { message: store.getSubmission(id) });
    }

    match = path.match(/^\/messages\/([^/]+)$/);
    if (method === 'DELETE' && match) {
      if (!store.deleteSubmission(positiveId(match[1]))) throw new HttpError(404, 'not_found');
      return json(res, {});
    }

    if (method === 'GET' && path === '/ratings') {
      const ratings = store.listRatings({
        site: siteParam(url),
        ipHash: url.searchParams.get('ip_hash') || undefined,
        ...listParams(url),
      });
      return json(res, { ratings });
    }

    if (method === 'GET' && path === '/ratings/insights') {
      const site = siteParam(url, { required: true, ratings: true });
      return json(res, {
        summary: store.ratingSummary(site),
        byDay: store.ratingsByDay(site, 90, now()),
        byPage: store.ratingsByPage(site),
        bursts: store.ratingBursts(site),
      });
    }

    if (method === 'DELETE' && path === '/ratings') {
      const site = siteParam(url, { required: true, ratings: true });
      const ipHash = url.searchParams.get('ip_hash');
      if (!ipHash) throw new HttpError(400, 'ip_hash_required');
      return json(res, { deleted: store.deleteRatingsByIp(site, ipHash) });
    }

    match = path.match(/^\/ratings\/([^/]+)$/);
    if (method === 'DELETE' && match) {
      if (!store.deleteRating(positiveId(match[1]))) throw new HttpError(404, 'not_found');
      return json(res, {});
    }

    if (method === 'GET' && path === '/export') {
      const site = siteParam(url);
      const type = url.searchParams.get('type');
      if (type !== 'messages' && type !== 'ratings') throw new HttpError(400, 'invalid_type');
      const csv = type === 'messages'
        ? toCsv(MESSAGE_COLUMNS, store.listSubmissions({ site, limit: null }))
        : toCsv(RATING_COLUMNS, store.listRatings({ site, limit: null }));
      const date = new Date(now()).toISOString().slice(0, 10);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${site || 'all-sites'}-${type}-${date}.csv"`,
        'Cache-Control': 'no-store',
      });
      return res.end(csv);
    }

    throw new HttpError(404, 'not_found');
  }

  /** Earlier admin URLs, kept for scripts that use them */
  function handleLegacy(req, res, url) {
    requireAdmin(req);
    if (req.method === 'GET' && url.pathname === '/admin/submissions') {
      return json(res, { submissions: store.listSubmissions({ site: siteParam(url), ...listParams(url) }) });
    }
    if (req.method === 'GET' && url.pathname === '/admin/ratings') {
      return json(res, { ratings: store.listRatings({ site: siteParam(url), ...listParams(url) }) });
    }
    const match = url.pathname.match(/^\/admin\/ratings\/([^/]+)$/);
    if (req.method === 'DELETE' && match) {
      if (!store.deleteRating(positiveId(match[1]))) throw new HttpError(404, 'not_found');
      return json(res, {});
    }
    throw new HttpError(404, 'not_found');
  }

  async function handle(req, res, url) {
    const page = PAGE_FILES[url.pathname];
    if (page && req.method === 'GET') {
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': page.type, 'Cache-Control': 'no-cache' });
      return res.end(PAGE_SOURCES[page.file]);
    }
    if (url.pathname.startsWith('/admin/api/')) return handleApi(req, res, url);
    return handleLegacy(req, res, url);
  }

  return { handle };
}
