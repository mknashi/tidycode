import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildConfig, loadConfig } from '../src/config.js';
import { RateLimiter } from '../src/rateLimit.js';

test('the committed sites.yaml is valid', () => {
  const config = loadConfig(fileURLToPath(new URL('../sites.yaml', import.meta.url)));
  assert.ok(config.sites.has('tidycode'));
  assert.ok(config.sites.get('tidycode').origins.includes('tauri://localhost'));
  assert.equal(config.sites.get('tidycode').ratings, true);
});

test('fills in defaults', () => {
  const site = buildConfig({ sites: { a: { origins: ['https://a.example'], to: 'x@a.example' } } }).sites.get('a');
  assert.equal(site.name, 'a');
  assert.equal(site.maxMessageLength, 5000);
  assert.deepEqual(site.to, ['x@a.example']);
  assert.equal(site.limits[0].max, 5);
  assert.equal(site.ratings, false);
});

test('rejects invalid sites', () => {
  assert.throws(() => buildConfig({ sites: { a: { origins: ['https://a.example/path'], to: 'x@a.example' } } }), /not an origin/);
  assert.throws(() => buildConfig({ sites: { a: { origins: ['https://a.example'], to: 'nope' } } }), /email/);
  assert.throws(() => buildConfig({ sites: { 'Bad Id': { origins: ['https://a.example'], to: 'x@a.example' } } }), /lowercase/);
  assert.throws(() => buildConfig({ sites: {} }), /no sites/);
  assert.throws(() => buildConfig({ sites: { a: { origins: ['https://a.example'], to: 'x@a.example', ratings: 'yes' } } }), /ratings/);
});

test('rate limiter enforces every window', () => {
  const limiter = new RateLimiter();
  const limits = [{ windowMs: 1000, max: 2 }, { windowMs: 10_000, max: 3 }];
  assert.ok(limiter.allow('k', limits, 0));
  assert.ok(limiter.allow('k', limits, 10));
  assert.ok(!limiter.allow('k', limits, 20), 'short window full');
  assert.ok(limiter.allow('k', limits, 1500), 'short window has passed');
  assert.ok(!limiter.allow('k', limits, 3000), 'long window full');
  assert.ok(limiter.allow('k', limits, 11_000));
});

test('adds the handled_at column to a database from before it existed', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const { Store } = await import('../src/store.js');

  const dir = mkdtempSync(join(tmpdir(), 'forms-'));
  const path = join(dir, 'old.db');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, site TEXT NOT NULL, created_at TEXT NOT NULL,
    name TEXT, email TEXT, message TEXT NOT NULL, page TEXT, meta TEXT, ip_hash TEXT, status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, sent_at TEXT);
    INSERT INTO submissions (site, created_at, message) VALUES ('a', '2026-01-01T00:00:00.000Z', 'kept');`);
  old.close();

  const store = new Store(path);
  const [row] = store.listSubmissions({ handled: false });
  assert.equal(row.message, 'kept');
  assert.ok(store.setHandled(row.id, true));
  store.close();
  new Store(path).close(); // opening again doesn't try to add it twice
  rmSync(dir, { recursive: true, force: true });
});
