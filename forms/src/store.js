/**
 * SQLite archive of every accepted submission, so nothing is lost when email
 * delivery fails, the record of used challenges (replay protection), and
 * star ratings (one per site and client; rating again replaces it).
 */

import { DatabaseSync } from 'node:sqlite';

export const MAX_DELIVERY_ATTEMPTS = 5;

export class Store {
  /** @param {string} path - Database file, or ':memory:' */
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site TEXT NOT NULL,
        created_at TEXT NOT NULL,
        name TEXT,
        email TEXT,
        message TEXT NOT NULL,
        page TEXT,
        meta TEXT,
        ip_hash TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS submissions_site_created ON submissions (site, created_at);
      CREATE INDEX IF NOT EXISTS submissions_status ON submissions (status);
      CREATE TABLE IF NOT EXISTS used_challenges (
        signature TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site TEXT NOT NULL,
        client_hash TEXT NOT NULL,
        stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
        page TEXT,
        ip_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (site, client_hash)
      );
      CREATE INDEX IF NOT EXISTS ratings_site_created ON ratings (site, created_at);
    `);
    // Added after the first release; existing databases get the column on start
    const columns = this.db.prepare('PRAGMA table_info(submissions)').all().map(column => column.name);
    if (!columns.includes('handled_at')) this.db.exec('ALTER TABLE submissions ADD COLUMN handled_at TEXT');
  }

  /**
   * Record a challenge as used.
   * @returns {boolean} false if it had already been used
   */
  useChallenge(signature, expiresAt) {
    const result = this.db
      .prepare('INSERT OR IGNORE INTO used_challenges (signature, expires_at) VALUES (?, ?)')
      .run(signature, expiresAt);
    return result.changes === 1;
  }

  pruneChallenges(now = Date.now()) {
    this.db.prepare('DELETE FROM used_challenges WHERE expires_at < ?').run(now);
  }

  /** @returns {number} New submission id */
  insertSubmission({ site, name, email, message, page, meta, ipHash }, now = new Date()) {
    const result = this.db
      .prepare(`INSERT INTO submissions (site, created_at, name, email, message, page, meta, ip_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(site, now.toISOString(), name || null, email || null, message, page || null, JSON.stringify(meta || {}), ipHash);
    return Number(result.lastInsertRowid);
  }

  markSent(id, now = new Date()) {
    this.db
      .prepare(`UPDATE submissions SET status = 'sent', attempts = attempts + 1, sent_at = ?, last_error = NULL WHERE id = ?`)
      .run(now.toISOString(), id);
  }

  markFailed(id, error) {
    this.db
      .prepare(`UPDATE submissions SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?`)
      .run(String(error).slice(0, 500), id);
  }

  /**
   * Submissions to retry: failed ones with attempts left, and pending ones
   * old enough that their first send can't still be in flight (e.g. the
   * service restarted mid-send).
   */
  pendingDeliveries({ limit = 20, staleAfterMs = 5 * 60 * 1000, now = Date.now() } = {}) {
    const staleBefore = new Date(now - staleAfterMs).toISOString();
    return this.db
      .prepare(`SELECT * FROM submissions
                WHERE attempts < ? AND (status = 'failed' OR (status = 'pending' AND created_at < ?))
                ORDER BY id LIMIT ?`)
      .all(MAX_DELIVERY_ATTEMPTS, staleBefore, limit)
      .map(parseRow);
  }

  getSubmission(id) {
    const row = this.db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
    return row ? parseRow(row) : null;
  }

  /**
   * Newest first; `beforeId` pages backwards.
   * @param {Object} [filters]
   * @param {string} [filters.status] - pending, sent or failed
   * @param {boolean} [filters.handled]
   * @param {string} [filters.q] - Text in the name, email, message or page
   * @param {number|null} [filters.limit] - null for all (exports)
   */
  listSubmissions({ site, limit = 50, beforeId, status, handled, q } = {}) {
    const where = [];
    const params = [];
    if (site) { where.push('site = ?'); params.push(site); }
    if (beforeId) { where.push('id < ?'); params.push(beforeId); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (handled === true) where.push('handled_at IS NOT NULL');
    if (handled === false) where.push('handled_at IS NULL');
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, char => `\\${char}`)}%`;
      where.push(`(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\' OR page LIKE ? ESCAPE '\\')`);
      params.push(like, like, like, like);
    }
    const sql = `SELECT * FROM submissions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC`;
    if (limit === null) return this.db.prepare(sql).all(...params).map(parseRow);
    return this.db.prepare(`${sql} LIMIT ?`).all(...params, Math.min(limit, 200)).map(parseRow);
  }

  /** @returns {boolean} false if there was no such submission */
  setHandled(id, handled, now = new Date()) {
    return this.db
      .prepare('UPDATE submissions SET handled_at = ? WHERE id = ?')
      .run(handled ? now.toISOString() : null, id).changes === 1;
  }

  /** @returns {boolean} false if there was no such submission */
  deleteSubmission(id) {
    return this.db.prepare('DELETE FROM submissions WHERE id = ?').run(id).changes === 1;
  }

  /** Message counts per site */
  messageStats(now = Date.now()) {
    const since = days => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    return this.db
      .prepare(`SELECT site,
                  COUNT(*) AS total,
                  SUM(created_at >= ?) AS last7,
                  SUM(created_at >= ?) AS last30,
                  SUM(handled_at IS NULL) AS unhandled,
                  SUM(status = 'pending') AS pending,
                  SUM(status = 'failed' AND attempts < ?) AS retrying,
                  SUM(status = 'failed' AND attempts >= ?) AS failed
                FROM submissions GROUP BY site`)
      .all(since(7), since(30), MAX_DELIVERY_ATTEMPTS, MAX_DELIVERY_ATTEMPTS);
  }

  /** Ratings first given in the last 7 days, per site */
  recentRatingCounts(now = Date.now()) {
    const since = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    return this.db
      .prepare('SELECT site, COUNT(*) AS last7 FROM ratings WHERE created_at >= ? GROUP BY site')
      .all(since);
  }

  /**
   * Save a client's rating, replacing any earlier one from the same client.
   * @returns {boolean} true if this is the client's first rating
   */
  upsertRating({ site, clientHash, stars, page, ipHash }, now = new Date()) {
    const existing = this.db
      .prepare('SELECT id FROM ratings WHERE site = ? AND client_hash = ?')
      .get(site, clientHash);
    this.db
      .prepare(`INSERT INTO ratings (site, client_hash, stars, page, ip_hash, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (site, client_hash) DO UPDATE SET
                  stars = excluded.stars, page = excluded.page, ip_hash = excluded.ip_hash, updated_at = excluded.updated_at`)
      .run(site, clientHash, stars, page || null, ipHash, now.toISOString(), now.toISOString());
    return !existing;
  }

  /** @returns {{ count: number, average: number|null, distribution: Object<string, number> }} */
  ratingSummary(site) {
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const rows = this.db
      .prepare('SELECT stars, COUNT(*) AS n FROM ratings WHERE site = ? GROUP BY stars')
      .all(site);
    let count = 0;
    let total = 0;
    for (const { stars, n } of rows) {
      distribution[stars] = n;
      count += n;
      total += stars * n;
    }
    return { count, average: count ? Math.round((total / count) * 100) / 100 : null, distribution };
  }

  /** Newest first; `beforeId` pages backwards; `limit: null` for all. Client ids stay hidden. */
  listRatings({ site, limit = 50, beforeId, ipHash } = {}) {
    const where = [];
    const params = [];
    if (site) { where.push('site = ?'); params.push(site); }
    if (beforeId) { where.push('id < ?'); params.push(beforeId); }
    if (ipHash) { where.push('ip_hash = ?'); params.push(ipHash); }
    const sql = `SELECT id, site, stars, page, ip_hash, created_at, updated_at FROM ratings
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC`;
    if (limit === null) return this.db.prepare(sql).all(...params);
    return this.db.prepare(`${sql} LIMIT ?`).all(...params, Math.min(limit, 200));
  }

  /** New ratings per day (by when first given) over the last `days` days */
  ratingsByDay(site, days = 90, now = Date.now()) {
    const since = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    return this.db
      .prepare(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count, ROUND(AVG(stars), 2) AS average
                FROM ratings WHERE site = ? AND created_at >= ? GROUP BY day ORDER BY day`)
      .all(site, since);
  }

  ratingsByPage(site) {
    return this.db
      .prepare(`SELECT COALESCE(page, '') AS page, COUNT(*) AS count, ROUND(AVG(stars), 2) AS average
                FROM ratings WHERE site = ? GROUP BY page ORDER BY count DESC LIMIT 50`)
      .all(site);
  }

  /**
   * IP hashes with several ratings: possibly one person rating from many
   * browsers, possibly an office or school sharing an address.
   */
  ratingBursts(site, minCount = 3) {
    return this.db
      .prepare(`SELECT ip_hash, COUNT(*) AS count, ROUND(AVG(stars), 2) AS average,
                       MIN(created_at) AS first_at, MAX(updated_at) AS last_at
                FROM ratings WHERE site = ? AND ip_hash IS NOT NULL
                GROUP BY ip_hash HAVING COUNT(*) >= ? ORDER BY count DESC LIMIT 20`)
      .all(site, minCount);
  }

  /** @returns {number} How many were deleted */
  deleteRatingsByIp(site, ipHash) {
    return Number(this.db.prepare('DELETE FROM ratings WHERE site = ? AND ip_hash = ?').run(site, ipHash).changes);
  }

  /** @returns {boolean} false if there was no such rating */
  deleteRating(id) {
    return this.db.prepare('DELETE FROM ratings WHERE id = ?').run(id).changes === 1;
  }

  close() {
    this.db.close();
  }
}

function parseRow(row) {
  return { ...row, meta: row.meta ? JSON.parse(row.meta) : {} };
}
