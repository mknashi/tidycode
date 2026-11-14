/**
 * Star ratings for the forms service (forms/ in this repo, POST /v1/rate).
 * The overall rating is shown on tidycode.ai and in its structured data.
 *
 * When to ask: only after the app has been used on a few different days,
 * at most a few times, a month apart, and never again after a rating or
 * "Don't ask again". Every rating is sent and counts, whatever the stars;
 * never ask only people likely to rate highly.
 */

import { FORMS_URL, SITE_ID, createSolutionCache } from './feedback';
import { isDesktop } from '../utils/platform';

const STATE_KEY = 'tidycode-rating';
const CLIENT_ID_KEY = 'tidycode-rating-client-id';

const MIN_ACTIVE_DAYS = 3;
const MAX_PROMPTS = 3;
const DAYS_BETWEEN_PROMPTS = 30;
const MAX_TRACKED_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const ERROR_MESSAGES = {
  rate_limited: 'Too many ratings from your network recently. Please try again later.',
};

function readState() {
  try {
    const state = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    return state && typeof state === 'object' ? state : {};
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode, blocked): the app just asks less reliably
  }
}

function updateState(changes) {
  const state = { ...readState(), ...changes };
  writeState(state);
  return state;
}

function localDay(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Random id that makes a second rating from this browser replace the first */
function clientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Call once per app start */
export function recordActiveDay(now = new Date()) {
  const state = readState();
  const days = Array.isArray(state.activeDays) ? state.activeDays : [];
  const today = localDay(now);
  if (!days.includes(today)) {
    writeState({ ...state, activeDays: [...days, today].slice(-MAX_TRACKED_DAYS) });
  }
}

export function shouldAskForRating(now = new Date()) {
  const state = readState();
  if (state.stars || state.optedOut) return false;
  if ((state.activeDays?.length || 0) < MIN_ACTIVE_DAYS) return false;
  if ((state.promptsShown || 0) >= MAX_PROMPTS) return false;
  if (state.lastPromptAt && now.getTime() - state.lastPromptAt < DAYS_BETWEEN_PROMPTS * DAY_MS) return false;
  return true;
}

/** Counts as one of the limited prompts, even if the user ignores it */
export function markRatingPromptShown(now = new Date()) {
  const state = readState();
  writeState({ ...state, promptsShown: (state.promptsShown || 0) + 1, lastPromptAt: now.getTime() });
}

export function optOutOfRatingPrompts() {
  updateState({ optedOut: true });
}

/**
 * The overall rating the build wrote into index.html (scripts/vite-plugin-site-rating.js).
 * Web only: a desktop build's copy would be months out of date.
 * @returns {{ average: string, count: number }|null}
 */
export function siteRating() {
  if (isDesktop()) return null;
  const content = document.querySelector('meta[name="tidycode-rating"]')?.getAttribute('content');
  const [average, count] = (content || '').split(' ');
  if (!/^[1-5]\.\d$/.test(average || '') || !/^\d+$/.test(count || '')) return null;
  return { average, count: Number(count) };
}

/** @returns {number|null} The stars this browser last sent */
export function savedRating() {
  return readState().stars || null;
}

/**
 * One rating session. Call prepare() when the stars appear so the proof of
 * work is done by the time the user picks a rating.
 */
export function createRatingSession() {
  const prepare = createSolutionCache();

  /**
   * @param {number} stars - 1 to 5
   * @throws {Error} With a message suitable for showing to the user
   */
  async function submit(stars, retried = false) {
    const unreachable = "Couldn't reach the server. Check your connection and try again.";
    let altcha;
    try {
      altcha = await prepare();
    } catch {
      throw new Error(unreachable);
    }

    let response;
    try {
      response = await fetch(`${FORMS_URL}/v1/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site: SITE_ID,
          stars,
          clientId: clientId(),
          page: isDesktop() ? 'desktop' : window.location.pathname,
          altcha,
        }),
      });
    } catch {
      throw new Error(unreachable);
    }

    const body = await response.json().catch(() => ({}));
    if (response.ok && body.ok) {
      updateState({ stars, ratedAt: Date.now() });
      return;
    }

    if (!retried && body.error === 'too_fast') {
      // Picked within the minimum time: the same solution works once it has passed
      await new Promise(resolve => setTimeout(resolve, 3000));
      return submit(stars, true);
    }
    if (!retried && ['challenge_expired', 'challenge_used', 'challenge_failed'].includes(body.error)) {
      prepare(true);
      return submit(stars, true);
    }
    throw new Error(ERROR_MESSAGES[body.error] || 'Sorry, your rating could not be saved. Please try again.');
  }

  return { prepare, submit };
}
