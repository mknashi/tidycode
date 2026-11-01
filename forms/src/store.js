/**
 * SQLite archive of every accepted submission, so nothing is lost when email
 * delivery fails, plus the record of used challenges (replay protection).
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
    `);
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

  /** Newest first; `beforeId` pages backwards */
  listSubmissions({ site, limit = 50, beforeId } = {}) {
    const where = [];
    const params = [];
    if (site) { where.push('site = ?'); params.push(site); }
    if (beforeId) { where.push('id < ?'); params.push(beforeId); }
    const sql = `SELECT * FROM submissions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    return this.db.prepare(sql).all(...params, Math.min(limit, 200)).map(parseRow);
  }

  close() {
    this.db.close();
  }
}

function parseRow(row) {
  return { ...row, meta: row.meta ? JSON.parse(row.meta) : {} };
}
