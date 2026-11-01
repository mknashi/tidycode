import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildConfig, loadConfig } from '../src/config.js';
import { RateLimiter } from '../src/rateLimit.js';

test('the committed sites.yaml is valid', () => {
  const config = loadConfig(fileURLToPath(new URL('../sites.yaml', import.meta.url)));
  assert.ok(config.sites.has('tidycode'));
  assert.ok(config.sites.get('tidycode').origins.includes('tauri://localhost'));
});

test('fills in defaults', () => {
  const site = buildConfig({ sites: { a: { origins: ['https://a.example'], to: 'x@a.example' } } }).sites.get('a');
  assert.equal(site.name, 'a');
  assert.equal(site.maxMessageLength, 5000);
  assert.deepEqual(site.to, ['x@a.example']);
  assert.equal(site.limits[0].max, 5);
});

test('rejects invalid sites', () => {
  assert.throws(() => buildConfig({ sites: { a: { origins: ['https://a.example/path'], to: 'x@a.example' } } }), /not an origin/);
  assert.throws(() => buildConfig({ sites: { a: { origins: ['https://a.example'], to: 'nope' } } }), /email/);
  assert.throws(() => buildConfig({ sites: { 'Bad Id': { origins: ['https://a.example'], to: 'x@a.example' } } }), /lowercase/);
  assert.throws(() => buildConfig({ sites: {} }), /no sites/);
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
