/**
 * Validation of submitted form fields.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_PATTERN = /(https?:\/\/|www\.)/gi;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_PAGE = 500;
const MAX_META_KEYS = 10;
const MAX_META_VALUE = 200;
const MIN_MESSAGE = 2;

function cleanText(value) {
  return typeof value === 'string' ? value.replace(CONTROL_CHARS, '').trim() : '';
}

/**
 * @param {Object} body - Parsed request body
 * @param {Object} site - Site config (maxMessageLength, maxLinks)
 * @returns {{ ok: true, value: Object } | { ok: false, errors: string[] }}
 */
export function validateSubmission(body, site) {
  const errors = [];

  const message = cleanText(body.message);
  // Single-line fields: no line breaks, so they can't affect email headers
  const name = cleanText(body.name).replace(/[\r\n]+/g, ' ');
  const email = cleanText(body.email).replace(/[\r\n]+/g, '');
  const page = cleanText(body.page);

  if (message.length < MIN_MESSAGE) errors.push('message_required');
  if (message.length > site.maxMessageLength) errors.push('message_too_long');
  if ((message.match(LINK_PATTERN) || []).length > site.maxLinks) errors.push('too_many_links');
  if (name.length > MAX_NAME) errors.push('name_too_long');
  if (email && (email.length > MAX_EMAIL || !EMAIL_PATTERN.test(email))) errors.push('invalid_email');
  if (page.length > MAX_PAGE) errors.push('page_too_long');

  // Context added by the client (app version, platform...): flat string pairs only
  const meta = {};
  if (body.meta !== undefined) {
    if (typeof body.meta !== 'object' || body.meta === null || Array.isArray(body.meta)) {
      errors.push('invalid_meta');
    } else {
      const entries = Object.entries(body.meta);
      if (entries.length > MAX_META_KEYS) errors.push('invalid_meta');
      for (const [key, value] of entries.slice(0, MAX_META_KEYS)) {
        const cleanKey = cleanText(key).slice(0, 40);
        const cleanValue = cleanText(String(value)).replace(/[\r\n]+/g, ' ').slice(0, MAX_META_VALUE);
        if (cleanKey) meta[cleanKey] = cleanValue;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { name, email, message, page, meta } };
}

// Random id the client creates once and keeps (e.g. crypto.randomUUID())
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;

/**
 * @param {Object} body - Parsed request body
 * @returns {{ ok: true, value: Object } | { ok: false, errors: string[] }}
 */
export function validateRating(body) {
  const errors = [];
  const page = cleanText(body.page);

  if (!Number.isInteger(body.stars) || body.stars < 1 || body.stars > 5) errors.push('invalid_stars');
  if (typeof body.clientId !== 'string' || !CLIENT_ID_PATTERN.test(body.clientId)) errors.push('invalid_client_id');
  if (page.length > MAX_PAGE) errors.push('page_too_long');

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { stars: body.stars, clientId: body.clientId, page } };
}
