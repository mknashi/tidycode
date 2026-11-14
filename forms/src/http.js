/**
 * Small HTTP helpers shared by the public routes (app.js) and the admin
 * routes (admin.js).
 */

import { timingSafeEqual } from 'node:crypto';

const MAX_BODY_BYTES = 32 * 1024;

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Parsed JSON object body; 415 / 400 / 413 otherwise */
export async function readJson(req) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    throw new HttpError(415, 'json_required');
  }
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'invalid_json');
  }
  if (!body || typeof body !== 'object') throw new HttpError(400, 'invalid_json');
  return body;
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
