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
      example: { name: 'Example', origins: [ORIGIN], to: 'inbox@example.com', perHour: 2, ratings: true },
      plain: { name: 'Plain', origins: [ORIGIN], to: 'inbox@example.com' },
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

const CLIENT_A = 'client-aaaaaaaaaaaaaaaa';
const CLIENT_B = 'client-bbbbbbbbbbbbbbbb';

async function rate(body, origin = ORIGIN, headers = {}) {
  return fetch(`${baseUrl}/v1/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
    body: JSON.stringify(body),
  });
}

async function validRating(overrides = {}) {
  return { site: 'example', stars: 5, clientId: CLIENT_A, page: '/json-editor/', altcha: await solvedChallenge(), ...overrides };
}

async function summary(site = 'example') {
  return fetch(`${baseUrl}/v1/ratings/summary?site=${site}`);
}

test('stores a rating and includes it in the public summary', async () => {
  const response = await rate(await validRating({ stars: 4 }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, created: true });

  const res = await summary();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('cache-control'), /public/);
  assert.deepEqual(await res.json(), {
    ok: true, site: 'example', count: 1, average: 4, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 },
  });
  assert.equal(sent.length, 0, 'ratings are not emailed');
});

test('a client rating again replaces its earlier rating', async () => {
  await rate(await validRating({ stars: 2 }));
  const again = await rate(await validRating({ stars: 5 }));
  assert.deepEqual(await again.json(), { ok: true, created: false });
  await rate(await validRating({ stars: 4, clientId: CLIENT_B }));

  const body = await (await summary()).json();
  assert.equal(body.count, 2);
  assert.equal(body.average, 4.5);
  assert.deepEqual(body.distribution, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
});

test('counts low ratings like any other', async () => {
  await rate(await validRating({ stars: 1 }));
  await rate(await validRating({ stars: 5, clientId: CLIENT_B }));
  const body = await (await summary()).json();
  assert.equal(body.count, 2);
  assert.equal(body.average, 3);
});

test('summary of a site with no ratings yet', async () => {
  const body = await (await summary()).json();
  assert.equal(body.count, 0);
  assert.equal(body.average, null);
});

test('rejects ratings for sites without ratings enabled', async () => {
  const response = await rate(await validRating({ site: 'plain' }));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'ratings_disabled');
  assert.equal((await summary('plain')).status, 404);
  assert.equal((await summary('nope')).status, 404);
});

test('rejects ratings from other origins or without proof of work', async () => {
  assert.equal((await rate(await validRating(), 'https://evil.example')).status, 403);
  const noPow = await rate({ site: 'example', stars: 5, clientId: CLIENT_A });
  assert.equal((await noPow.json()).error, 'challenge_failed');
  assert.equal((await (await summary()).json()).count, 0);
});

test('validates stars and client id', async () => {
  for (const [overrides, field] of [
    [{ stars: 0 }, 'invalid_stars'],
    [{ stars: 6 }, 'invalid_stars'],
    [{ stars: 4.5 }, 'invalid_stars'],
    [{ stars: '5' }, 'invalid_stars'],
    [{ clientId: 'short' }, 'invalid_client_id'],
    [{ clientId: 'has spaces in it, sixteen+' }, 'invalid_client_id'],
  ]) {
    const response = await rate(await validRating(overrides));
    assert.equal(response.status, 400);
    assert.deepEqual((await response.json()).fields, [field], JSON.stringify(overrides));
  }
});

test('does not accept the same solved challenge for two ratings', async () => {
  const altcha = await solvedChallenge();
  assert.equal((await rate(await validRating({ altcha }))).status, 200);
  const replay = await rate(await validRating({ altcha, clientId: CLIENT_B }));
  assert.equal((await replay.json()).error, 'challenge_used');
});

test('rate limits ratings per IP', async () => {
  for (let i = 0; i < 5; i++) {
    const clientId = `client-${String(i).repeat(16)}`;
    assert.equal((await rate(await validRating({ clientId }), ORIGIN, { 'X-Forwarded-For': '203.0.113.9' })).status, 200);
  }
  const limited = await rate(await validRating({ clientId: CLIENT_B }), ORIGIN, { 'X-Forwarded-For': '203.0.113.9' });
  assert.equal(limited.status, 429);
  const other = await rate(await validRating({ clientId: CLIENT_B }), ORIGIN, { 'X-Forwarded-For': '203.0.113.10' });
  assert.equal(other.status, 200);
});

test('admin can list and delete ratings', async () => {
  await rate(await validRating({ stars: 1 }));
  await rate(await validRating({ stars: 5, clientId: CLIENT_B }));
  const auth = { Authorization: 'Bearer admin-secret' };

  assert.equal((await fetch(`${baseUrl}/admin/ratings`)).status, 401);
  const list = await (await fetch(`${baseUrl}/admin/ratings?site=example`, { headers: auth })).json();
  assert.equal(list.ratings.length, 2);
  assert.equal(list.ratings[0].stars, 5);
  assert.equal(list.ratings[0].page, '/json-editor/');
  assert.ok(!('client_hash' in list.ratings[0]));

  assert.equal((await fetch(`${baseUrl}/admin/ratings/${list.ratings[0].id}`, { method: 'DELETE' })).status, 401);
  assert.equal((await fetch(`${baseUrl}/admin/ratings/${list.ratings[0].id}`, { method: 'DELETE', headers: auth })).status, 200);
  assert.equal((await fetch(`${baseUrl}/admin/ratings/${list.ratings[0].id}`, { method: 'DELETE', headers: auth })).status, 404);
  assert.equal((await (await summary()).json()).average, 1);
});

// ---------- admin page and API ----------

const ADMIN = { Authorization: 'Bearer admin-secret' };

async function adminApi(path, { method = 'GET', body } = {}) {
  const headers = { ...ADMIN };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}/admin/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

test('serves the admin page without a token, with a strict CSP', async () => {
  const response = await fetch(`${baseUrl}/admin`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(await response.text(), /Forms admin/);
  assert.equal((await fetch(`${baseUrl}/admin/app.js`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/admin/app.css`)).status, 200);
});

test('every admin API route needs the token', async () => {
  for (const [method, path] of [
    ['GET', '/overview'], ['GET', '/messages'], ['POST', '/messages/1/retry'], ['DELETE', '/messages/1'],
    ['GET', '/ratings'], ['GET', '/ratings/insights?site=example'], ['DELETE', '/ratings/1'], ['GET', '/export?type=messages'],
  ]) {
    const response = await fetch(`${baseUrl}/admin/api${path}`, { method });
    assert.equal(response.status, 401, `${method} ${path}`);
  }
});

test('overview counts messages and ratings per site and blocked requests', async () => {
  await submit(await validSubmission());
  mailerFails = true;
  await submit(await validSubmission({ message: 'Second one' }));
  await submit(await validSubmission({ website: 'bot' })); // honeypot
  await rate(await validRating({ stars: 4 }));

  const body = await (await adminApi('/overview')).json();
  const example = body.sites.find(site => site.id === 'example');
  assert.deepEqual(example.messages, { total: 2, last7: 2, last30: 2, unhandled: 2, pending: 0, retrying: 1, failed: 0 });
  assert.equal(example.ratings.count, 1);
  assert.equal(example.ratings.last7, 1);
  assert.equal(body.sites.find(site => site.id === 'plain').ratings, null);
  assert.equal(body.health.blocked.honeypot, 1);
  assert.equal(body.health.lastDelivery.ok, false);
});

test('counts blocked messages and ratings by reason, but not challenge retries', async () => {
  await submit(await validSubmission(), 'https://evil.example');
  await submit({ site: 'example', message: 'No proof of work' });
  await submit(await validSubmission({ message: '' }));
  const altcha = await solvedChallenge();
  await rate(await validRating({ altcha }));
  await rate(await validRating({ altcha })); // reused challenge: real clients retry these

  const { health } = await (await adminApi('/overview')).json();
  assert.deepEqual(health.blocked, { honeypot: 0, origin: 1, proofOfWork: 1, rateLimited: 0, invalid: 1 });
});

test('lists messages with filters and search', async () => {
  await submit(await validSubmission({ message: 'About 100% coverage' }));
  mailerFails = true;
  await submit(await validSubmission({ message: 'Email will fail' }));

  const all = await (await adminApi('/messages?site=example')).json();
  assert.equal(all.messages.length, 2);
  const failed = await (await adminApi('/messages?status=failed')).json();
  assert.deepEqual(failed.messages.map(m => m.message), ['Email will fail']);
  const search = await (await adminApi(`/messages?q=${encodeURIComponent('100%')}`)).json();
  assert.deepEqual(search.messages.map(m => m.message), ['About 100% coverage']);
  const wildcard = await (await adminApi(`/messages?q=${encodeURIComponent('%')}`)).json();
  assert.equal(wildcard.messages.length, 1, '% is matched literally');
  assert.equal((await adminApi('/messages?status=bogus')).status, 400);
  assert.equal((await adminApi('/messages?site=nope')).status, 404);
});

test('marks messages handled, retries email and deletes', async () => {
  mailerFails = true;
  await submit(await validSubmission());
  const [message] = (await (await adminApi('/messages')).json()).messages;
  assert.equal(message.status, 'failed');

  const handled = await (await adminApi(`/messages/${message.id}/handled`, { method: 'POST', body: { handled: true } })).json();
  assert.equal(handled.message.handled_at, new Date(clock).toISOString());
  assert.equal((await (await adminApi('/messages?handled=false')).json()).messages.length, 0);
  const unhandled = await (await adminApi(`/messages/${message.id}/handled`, { method: 'POST', body: { handled: false } })).json();
  assert.equal(unhandled.message.handled_at, null);
  assert.equal((await adminApi(`/messages/${message.id}/handled`, { method: 'POST', body: {} })).status, 400);

  mailerFails = false;
  const retried = await (await adminApi(`/messages/${message.id}/retry`, { method: 'POST' })).json();
  assert.equal(retried.message.status, 'sent');
  assert.equal(sent.length, 1);

  assert.equal((await adminApi(`/messages/${message.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await adminApi(`/messages/${message.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await adminApi('/messages/abc/retry', { method: 'POST' })).status, 404);
});

test('rating insights, and deleting every rating from one IP hash', async () => {
  for (let i = 0; i < 3; i++) {
    await rate(await validRating({ clientId: `client-${String(i).repeat(16)}`, stars: 5 }), ORIGIN, { 'X-Forwarded-For': '203.0.113.9' });
  }
  await rate(await validRating({ stars: 2, page: '/' }), ORIGIN, { 'X-Forwarded-For': '203.0.113.10' });

  const insights = await (await adminApi('/ratings/insights?site=example')).json();
  assert.equal(insights.summary.count, 4);
  assert.deepEqual(insights.byDay, [{ day: '2026-10-27', count: 4, average: 4.25 }]);
  assert.deepEqual(insights.byPage.map(row => [row.page, row.count]), [['/json-editor/', 3], ['/', 1]]);
  assert.equal(insights.bursts.length, 1);
  assert.equal(insights.bursts[0].count, 3);
  assert.equal((await adminApi('/ratings/insights')).status, 400);
  assert.equal((await adminApi('/ratings/insights?site=plain')).status, 404);

  const ipHash = insights.bursts[0].ip_hash;
  const fromIp = await (await adminApi(`/ratings?site=example&ip_hash=${ipHash}`)).json();
  assert.equal(fromIp.ratings.length, 3);
  const deleted = await (await adminApi(`/ratings?site=example&ip_hash=${ipHash}`, { method: 'DELETE' })).json();
  assert.equal(deleted.deleted, 3);
  assert.equal((await (await summary()).json()).count, 1);
  assert.equal((await adminApi('/ratings?site=example', { method: 'DELETE' })).status, 400);
});

test('exports CSV with formula-looking cells neutralised', async () => {
  await submit(await validSubmission({ name: '=HYPERLINK("http://x")', message: 'Line one\nsaid "hi", then left' }));
  await rate(await validRating({ stars: 3 }));

  const response = await adminApi('/export?site=example&type=messages');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/csv/);
  assert.match(response.headers.get('content-disposition'), /example-messages-2026-10-27\.csv/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM for Excel');
  const csv = bytes.subarray(3).toString('utf8');
  assert.ok(csv.startsWith('id,site,created_at,name,email,message'));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`), 'formula gets a leading quote');
  assert.ok(csv.includes('"Line one\nsaid ""hi"", then left"'));

  const ratings = await (await adminApi('/export?type=ratings')).text();
  assert.equal(ratings.trim().split('\r\n').length, 2);
  assert.equal((await adminApi('/export?type=other')).status, 400);
});

test('old admin URLs still work', async () => {
  await rate(await validRating());
  const list = await (await fetch(`${baseUrl}/admin/ratings`, { headers: ADMIN })).json();
  assert.equal(list.ratings.length, 1);
  assert.equal((await fetch(`${baseUrl}/admin/ratings/${list.ratings[0].id}`, { method: 'DELETE', headers: ADMIN })).status, 200);
});
