import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { buildConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { RateLimiter } from '../src/rateLimit.js';
import { createApp } from '../src/app.js';
import { buildEmail } from '../src/mailer.js';

const ORIGIN = 'https://www.example.com';
const HMAC_KEY = 'test-hmac-key';
const TTL = 60 * 60 * 1000;

let clock;
let server;
let baseUrl;
let store;
let sent;
let mailerFails;
let app;

function solve(challenge) {
  for (let n = 0; n <= challenge.maxnumber; n++) {
    if (createHash('sha256').update(challenge.salt + n).digest('hex') === challenge.challenge) {
      return { ...challenge, number: n };
    }
  }
  throw new Error('unsolvable');
}

async function getChallenge(origin = ORIGIN, site = 'example') {
  return fetch(`${baseUrl}/v1/challenge?site=${site}`, { headers: { Origin: origin } });
}

async function solvedChallenge() {
  const challenge = await (await getChallenge()).json();
  const { maxnumber, ...rest } = solve(challenge);
  clock += 5000; // someone spent a few seconds writing
  return { ...rest };
}

async function submit(body, origin = ORIGIN, headers = {}) {
  return fetch(`${baseUrl}/v1/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
    body: JSON.stringify(body),
  });
}

async function validSubmission(overrides = {}) {
  return { site: 'example', name: 'Ada', email: 'ada@example.org', message: 'Hello there', altcha: await solvedChallenge(), ...overrides };
}

beforeEach(async () => {
  clock = Date.UTC(2026, 9, 27, 12, 0, 0);
  sent = [];
  mailerFails = false;
  store = new Store(':memory:');
  const config = buildConfig({
    sites: {
      example: { name: 'Example', origins: [ORIGIN], to: 'inbox@example.com', perHour: 2 },
    },
  });
  app = createApp({
    config,
    store,
    mailer: {
      async send(site, submission) {
        if (mailerFails) throw new Error('SMTP down');
        sent.push(buildEmail(site, submission, 'Forms <forms@example.com>'));
      },
    },
    rateLimiter: new RateLimiter(),
    options: {
      hmacKey: HMAC_KEY,
      ipSalt: 'salt',
      adminToken: 'admin-secret',
      trustProxy: true,
      challengeTtlMs: TTL,
      minFormMs: 3000,
      powMaxNumber: 2000,
    },
    now: () => clock,
  });
  server = createServer(app.handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  store.close();
});

test('accepts a valid submission, stores it and emails the site', async () => {
  const response = await submit(await validSubmission());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['inbox@example.com']);
  assert.equal(sent[0].replyTo, 'ada@example.org');
  assert.match(sent[0].subject, /^\[Example\] Message from Ada/);
  assert.match(sent[0].text, /Hello there/);

  const [row] = store.listSubmissions();
  assert.equal(row.status, 'sent');
  assert.notEqual(row.ip_hash, '127.0.0.1', 'IP is stored hashed');
});

test('rejects challenges and submissions from other origins', async () => {
  assert.equal((await getChallenge('https://evil.example')).status, 403);
  const response = await submit(await validSubmission(), 'https://evil.example');
  assert.equal(response.status, 403);
  assert.equal(sent.length, 0);
});

test('rejects unknown sites', async () => {
  assert.equal((await getChallenge(ORIGIN, 'nope')).status, 404);
});

test('pretends to accept honeypot submissions but drops them', async () => {
  const response = await submit(await validSubmission({ website: 'http://spam.example' }));
  assert.equal(response.status, 200);
  assert.equal(sent.length, 0);
  assert.equal(store.listSubmissions().length, 0);
});

test('rejects a missing or wrong proof of work', async () => {
  const missing = await submit({ site: 'example', message: 'Hello there' });
  assert.equal((await missing.json()).error, 'challenge_failed');

  const altcha = await solvedChallenge();
  const wrong = await submit({ site: 'example', message: 'Hello there', altcha: { ...altcha, number: altcha.number + 1 } });
  assert.equal((await wrong.json()).error, 'challenge_failed');
});

test('rejects a forged challenge signed with another key', async () => {
  const altcha = await solvedChallenge();
  const forged = await submit({ site: 'example', message: 'Hello there', altcha: { ...altcha, signature: '00'.repeat(32) } });
  assert.equal((await forged.json()).error, 'challenge_failed');
});

test('rejects submissions sent too quickly after the form opened', async () => {
  const challenge = await (await getChallenge()).json();
  const { maxnumber, ...altcha } = solve(challenge);
  clock += 1000;
  const response = await submit({ site: 'example', message: 'Hello there', altcha });
  assert.equal((await response.json()).error, 'too_fast');
});

test('rejects expired challenges', async () => {
  const altcha = await solvedChallenge();
  clock += TTL;
  const response = await submit({ site: 'example', message: 'Hello there', altcha });
  assert.equal((await response.json()).error, 'challenge_expired');
});

test('does not accept the same solved challenge twice', async () => {
  const body = await validSubmission();
  assert.equal((await submit(body)).status, 200);
  const replay = await submit(body);
  assert.equal((await replay.json()).error, 'challenge_used');
  assert.equal(sent.length, 1);
});

test('rate limits per IP and site', async () => {
  assert.equal((await submit(await validSubmission())).status, 200);
  assert.equal((await submit(await validSubmission())).status, 200);
  const third = await submit(await validSubmission());
  assert.equal(third.status, 429);

  // A different client IP (as forwarded by the proxy) is unaffected
  const other = await submit(await validSubmission(), ORIGIN, { 'X-Forwarded-For': '203.0.113.9' });
  assert.equal(other.status, 200);
});

test('uses the configured client IP header for rate limits', async () => {
  // Rebuild the app as if behind Cloudflare
  await new Promise(resolve => server.close(resolve));
  const config = buildConfig({ sites: { example: { origins: [ORIGIN], to: 'inbox@example.com', perHour: 1 } } });
  app = createApp({
    config,
    store,
    mailer: { async send() {} },
    rateLimiter: new RateLimiter(),
    options: { hmacKey: HMAC_KEY, ipSalt: 'salt', trustProxy: true, clientIpHeader: 'cf-connecting-ip', challengeTtlMs: TTL, minFormMs: 3000, powMaxNumber: 2000 },
    now: () => clock,
  });
  server = createServer(app.handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const edge = { 'X-Forwarded-For': '198.51.100.1' }; // same Cloudflare edge for both visitors
  assert.equal((await submit(await validSubmission(), ORIGIN, { ...edge, 'CF-Connecting-IP': '203.0.113.1' })).status, 200);
  assert.equal((await submit(await validSubmission(), ORIGIN, { ...edge, 'CF-Connecting-IP': '203.0.113.2' })).status, 200);
  assert.equal((await submit(await validSubmission(), ORIGIN, { ...edge, 'CF-Connecting-IP': '203.0.113.1' })).status, 429);
});

test('validates fields', async () => {
  const response = await submit(await validSubmission({ message: 'x', email: 'not-an-email' }));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.deepEqual(body.fields.sort(), ['invalid_email', 'message_required']);
});

test('rejects messages with too many links', async () => {
  const response = await submit(await validSubmission({ message: 'see http://a.example http://b.example http://c.example' }));
  assert.deepEqual((await response.json()).fields, ['too_many_links']);
});

test('keeps the message when email fails and retries it later', async () => {
  mailerFails = true;
  assert.equal((await submit(await validSubmission())).status, 200);
  assert.equal(store.listSubmissions()[0].status, 'failed');

  mailerFails = false;
  await app.retryPendingDeliveries();
  assert.equal(sent.length, 1);
  assert.equal(store.listSubmissions()[0].status, 'sent');
});

test('answers CORS preflight only for configured origins', async () => {
  const ok = await fetch(`${baseUrl}/v1/submit`, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);

  const denied = await fetch(`${baseUrl}/v1/submit`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(denied.status, 403);
});

test('protects the admin endpoint with the token', async () => {
  await submit(await validSubmission());
  assert.equal((await fetch(`${baseUrl}/admin/submissions`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/admin/submissions`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);

  const response = await fetch(`${baseUrl}/admin/submissions?site=example`, { headers: { Authorization: 'Bearer admin-secret' } });
  const body = await response.json();
  assert.equal(body.submissions.length, 1);
  assert.equal(body.submissions[0].message, 'Hello there');
});

test('serves the widget script to any site', async () => {
  const response = await fetch(`${baseUrl}/v1/widget.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.match(await response.text(), /data-forms-site/);
});
