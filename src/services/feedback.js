/**
 * Client for the forms service (forms/ in this repo), which emails feedback
 * to the TidyCode inbox. Submissions need a solved proof-of-work challenge;
 * see forms/src/pow.js.
 */

import { version as appVersion } from '../../package.json';
import { isDesktop } from '../utils/platform';

export const FORMS_URL = import.meta.env.VITE_FORMS_URL || 'https://forms.tidycode.ai';
const SITE_ID = 'tidycode';
// Challenges expire after an hour; refetch before that
const CHALLENGE_MAX_AGE_MS = 50 * 60 * 1000;

const ERROR_MESSAGES = {
  rate_limited: 'You have sent several messages recently. Please try again later.',
  message_required: 'Please write a message.',
  message_too_long: 'Your message is too long (5,000 characters at most).',
  too_many_links: 'Please include no more than 2 links.',
  invalid_email: 'Please check your email address.',
};

/** Context sent with every message, shown to the user in the form */
export function feedbackContext() {
  return {
    'App version': appVersion,
    Platform: isDesktop() ? 'Desktop app' : 'Web',
    'User agent': navigator.userAgent,
  };
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Find n where sha256(salt + n) equals the challenge, hashing in batches
async function solve(challenge) {
  const encoder = new TextEncoder();
  const batch = 1000;
  for (let start = 0; start <= challenge.maxnumber; start += batch) {
    const numbers = [];
    for (let n = start; n < start + batch && n <= challenge.maxnumber; n++) numbers.push(n);
    const hashes = await Promise.all(
      numbers.map(n => crypto.subtle.digest('SHA-256', encoder.encode(challenge.salt + n)))
    );
    const index = hashes.findIndex(hash => toHex(hash) === challenge.challenge);
    if (index !== -1) return numbers[index];
  }
  throw new Error('Challenge could not be solved');
}

async function fetchSolution() {
  const response = await fetch(`${FORMS_URL}/v1/challenge?site=${SITE_ID}`);
  if (!response.ok) throw new Error('challenge_unavailable');
  const { algorithm, challenge, maxnumber, salt, signature } = await response.json();
  const number = await solve({ challenge, maxnumber, salt });
  return { algorithm, challenge, number, salt, signature };
}

/**
 * One feedback form session. Call prepare() when the form opens so the proof
 * of work is done by the time the user presses Send.
 */
export function createFeedbackSession() {
  let pending = null;

  function prepare(force = false) {
    if (force || !pending || Date.now() - pending.fetchedAt > CHALLENGE_MAX_AGE_MS) {
      const promise = fetchSolution();
      promise.catch(() => {
        if (pending?.promise === promise) pending = null;
      });
      pending = { promise, fetchedAt: Date.now() };
    }
    return pending.promise;
  }

  /**
   * @param {{ name?: string, email?: string, message: string, website?: string }} fields - `website` is the honeypot
   * @throws {Error} With a message suitable for showing to the user
   */
  async function submit(fields, retried = false) {
    let altcha;
    try {
      altcha = await prepare();
    } catch {
      throw new Error("Couldn't reach the feedback service. Check your connection and try again.");
    }

    let response;
    try {
      response = await fetch(`${FORMS_URL}/v1/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: SITE_ID, ...fields, meta: feedbackContext(), altcha }),
      });
    } catch {
      throw new Error("Couldn't reach the feedback service. Check your connection and try again.");
    }

    const body = await response.json().catch(() => ({}));
    if (response.ok && body.ok) return;

    if (!retried && body.error === 'too_fast') {
      // Sent before the minimum time on the form: the same solution works once it has passed
      await new Promise(resolve => setTimeout(resolve, 3000));
      return submit(fields, true);
    }
    // A fresh challenge fixes expired or reused ones
    if (!retried && ['challenge_expired', 'challenge_used', 'challenge_failed'].includes(body.error)) {
      prepare(true);
      return submit(fields, true);
    }

    const code = body.fields?.[0] || body.error;
    throw new Error(ERROR_MESSAGES[code] || 'Sorry, your message could not be sent. Please try again.');
  }

  return { prepare, submit };
}
