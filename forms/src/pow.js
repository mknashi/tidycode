/**
 * Proof-of-work challenges in the ALTCHA format.
 *
 * The server picks a secret number n and publishes sha256(salt + n) with an
 * HMAC signature. The browser finds n by brute force (about a second), which
 * is negligible for a person sending one message and expensive for a bot
 * sending thousands. Nothing is stored per challenge: the signature proves
 * the server issued it, and the expiry in the salt bounds its lifetime.
 */

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const ALGORITHM = 'SHA-256';

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

function hmacHex(key, text) {
  return createHmac('sha256', key).update(text).digest('hex');
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * @param {Object} options
 * @param {string} options.hmacKey - Server secret
 * @param {number} options.maxNumber - Upper bound of the secret number (difficulty)
 * @param {number} options.ttlMs - How long the challenge stays valid
 * @param {number} [options.now]
 */
export function createChallenge({ hmacKey, maxNumber, ttlMs, now = Date.now() }) {
  const expires = Math.floor((now + ttlMs) / 1000);
  const salt = `${randomBytes(12).toString('hex')}?expires=${expires}`;
  const number = randomInt(0, maxNumber + 1);
  const challenge = sha256Hex(salt + number);
  return {
    algorithm: ALGORITHM,
    challenge,
    maxnumber: maxNumber,
    salt,
    signature: hmacHex(hmacKey, challenge),
  };
}

/**
 * Check a solved challenge.
 * @param {Object} payload - { algorithm, challenge, number, salt, signature }
 * @param {Object} options
 * @param {string} options.hmacKey
 * @param {number} options.ttlMs - Must match the value used to create challenges
 * @param {number} options.minAgeMs - Reject submissions sent sooner than this after the challenge was issued
 * @param {number} [options.now]
 * @returns {{ ok: true, expiresAt: number } | { ok: false, reason: string }}
 */
export function verifySolution(payload, { hmacKey, ttlMs, minAgeMs, now = Date.now() }) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'missing' };
  const { algorithm, challenge, number, salt, signature } = payload;
  if (algorithm !== ALGORITHM || typeof salt !== 'string' || !Number.isInteger(number) || number < 0) {
    return { ok: false, reason: 'malformed' };
  }

  // Signature first, so the expiry in the salt can be trusted
  if (!safeEqualHex(signature, hmacHex(hmacKey, challenge))) return { ok: false, reason: 'bad_signature' };
  if (!safeEqualHex(challenge, sha256Hex(salt + number))) return { ok: false, reason: 'wrong_answer' };

  const expires = Number(new URLSearchParams(salt.split('?')[1] || '').get('expires'));
  if (!expires) return { ok: false, reason: 'malformed' };
  const expiresAt = expires * 1000;
  if (now > expiresAt) return { ok: false, reason: 'expired' };

  const issuedAt = expiresAt - ttlMs;
  if (now - issuedAt < minAgeMs) return { ok: false, reason: 'too_fast' };

  return { ok: true, expiresAt };
}
