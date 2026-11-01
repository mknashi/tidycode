/**
 * Entry point: reads the environment, wires the pieces together, and runs
 * the HTTP server plus background jobs (email retries, cleanup).
 */

import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { Store } from './store.js';
import { createMailer } from './mailer.js';
import { RateLimiter } from './rateLimit.js';
import { createApp } from './app.js';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[forms] Missing required environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

const env = process.env;
const config = loadConfig(env.FORMS_CONFIG || new URL('../sites.yaml', import.meta.url).pathname);
const store = new Store(env.DB_PATH || '/data/forms.db');
const mailer = createMailer({
  host: required('SMTP_HOST'),
  port: Number(env.SMTP_PORT || 587),
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
  from: required('MAIL_FROM'),
});
const rateLimiter = new RateLimiter();

const { handler, retryPendingDeliveries } = createApp({
  config,
  store,
  mailer,
  rateLimiter,
  options: {
    hmacKey: required('HMAC_KEY'),
    ipSalt: required('IP_SALT'),
    adminToken: env.ADMIN_TOKEN,
    trustProxy: env.TRUST_PROXY !== 'false',
    clientIpHeader: env.CLIENT_IP_HEADER ? env.CLIENT_IP_HEADER.toLowerCase() : undefined,
    challengeTtlMs: 60 * 60 * 1000,
    minFormMs: Number(env.MIN_FORM_MS || 3000),
    powMaxNumber: Number(env.POW_MAX_NUMBER || 50000),
  },
});

const server = createServer(handler);
const port = Number(env.PORT || 8080);
server.listen(port, () => {
  console.log(`[forms] Listening on :${port} for sites: ${[...config.sites.keys()].join(', ')}`);
});

mailer.verify().then(
  () => console.log('[forms] SMTP connection verified'),
  error => console.error('[forms] SMTP check failed (messages will be stored and retried):', error.message),
);

const timers = [
  setInterval(() => retryPendingDeliveries().catch(error => console.error('[forms] Retry failed:', error)), 5 * 60 * 1000),
  setInterval(() => {
    store.pruneChallenges();
    rateLimiter.prune(24 * 60 * 60 * 1000);
  }, 60 * 60 * 1000),
];

function shutdown() {
  timers.forEach(clearInterval);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
