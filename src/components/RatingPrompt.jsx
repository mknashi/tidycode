import React, { useEffect, useMemo, useState } from 'react';
import { X, Star, Loader2 } from 'lucide-react';
import {
  createRatingSession,
  markRatingPromptShown,
  optOutOfRatingPrompts,
  recordActiveDay,
  savedRating,
  shouldAskForRating,
  siteRating,
} from '../services/rating';

// Give people time to get some work done before asking
const PROMPT_DELAY_MS = 2 * 60 * 1000;
const THANKS_VISIBLE_MS = 4000;

/** Five star buttons. `value` is the selected rating, if any. */
export const StarPicker = ({ value, onPick, disabled, dark, size = 'w-7 h-7' }) => {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value || 0;
  return (
    <div role="radiogroup" aria-label="Rating" className="flex gap-1" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map(stars => (
        <button
          key={stars}
          type="button"
          role="radio"
          aria-checked={value === stars}
          aria-label={`${stars} star${stars > 1 ? 's' : ''}`}
          disabled={disabled}
          onMouseEnter={() => setHovered(stars)}
          onFocus={() => setHovered(stars)}
          onBlur={() => setHovered(0)}
          onClick={() => onPick(stars)}
          className="p-0.5 rounded transition-transform hover:scale-110 disabled:opacity-60 disabled:hover:scale-100"
        >
          <Star
            className={`${size} ${
              stars <= shown ? 'fill-amber-400 text-amber-400' : dark ? 'text-gray-500' : 'text-gray-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
};

/**
 * The overall rating, e.g. "★★★★½ 4.6 from 38 ratings". Must stay visible on
 * the home page while index.html carries aggregateRating; nothing is shown
 * until the build adds one.
 */
export const SiteRatingLine = ({ dark, className = '' }) => {
  const rating = useMemo(() => siteRating(), []);
  if (!rating) return null;
  const value = Number(rating.average);
  return (
    <p className={`flex items-center justify-center gap-2 text-sm ${dark ? 'text-gray-400' : 'text-gray-600'} ${className}`}>
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map(n => {
          const fill = Math.max(0, Math.min(1, value - (n - 1)));
          return (
            <span key={n} className="relative w-4 h-4">
              <Star className={`absolute inset-0 w-4 h-4 ${dark ? 'text-gray-600' : 'text-gray-300'}`} />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              </span>
            </span>
          );
        })}
      </span>
      <span>
        <span className={`font-semibold ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{rating.average}</span>
        {` from ${rating.count.toLocaleString('en-US')} ratings`}
      </span>
    </p>
  );
};

/**
 * Asks for a 1-5 star rating once the app has been used on a few days (see
 * services/rating.js). Every rating is sent, whatever the stars; low ones
 * are also offered the feedback form, as an extra, never instead.
 *
 * @param {Object} props
 * @param {string} props.theme
 * @param {boolean} props.blocked - Another dialog is open; wait for it to close
 * @param {() => void} props.onSendFeedback
 */
const RatingPrompt = ({ theme, blocked, onSendFeedback }) => {
  const dark = theme === 'dark';
  const session = useMemo(() => createRatingSession(), []);
  const [eligible, setEligible] = useState(false);
  const [visible, setVisible] = useState(false);
  const [stars, setStars] = useState(null);
  const [status, setStatus] = useState('ask'); // ask | sending | thanks
  const [error, setError] = useState('');

  useEffect(() => {
    recordActiveDay();
    if (!shouldAskForRating()) return undefined;
    const timer = setTimeout(() => setEligible(true), PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!eligible || visible || blocked) return;
    // On the web, let the cookie banner be answered first; it sits in the same corner
    try {
      if (!window.__TAURI_INTERNALS__ && localStorage.getItem('tidycode-analytics-consent') === null) return;
    } catch {
      // Storage unavailable: show anyway
    }
    markRatingPromptShown();
    session.prepare().catch(() => {});
    setVisible(true);
  }, [eligible, visible, blocked, session]);

  useEffect(() => {
    if (status !== 'thanks' || stars <= 3) return undefined;
    const timer = setTimeout(() => setVisible(false), THANKS_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [status, stars]);

  // Rated from the feedback dialog in the meantime
  if (!visible || (status === 'ask' && savedRating())) return null;

  const pick = async (picked) => {
    setStars(picked);
    setStatus('sending');
    setError('');
    try {
      await session.submit(picked);
      setStatus('thanks');
    } catch (submitError) {
      setError(submitError.message);
      setStatus('ask');
    }
  };

  const close = () => setVisible(false);
  const neverAsk = () => {
    optOutOfRatingPrompts();
    setVisible(false);
  };

  const muted = dark ? 'text-gray-400' : 'text-gray-600';
  const linkButton = `text-xs underline-offset-2 hover:underline ${dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800'}`;

  return (
    <div
      role="dialog"
      aria-labelledby="rating-prompt-title"
      className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 rounded-lg shadow-2xl border p-4 ${
        dark ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 id="rating-prompt-title" className="font-semibold text-sm">
          {status === 'thanks' ? 'Thanks for rating Tidy Code' : 'How would you rate Tidy Code?'}
        </h3>
        <button
          onClick={close}
          aria-label="Close"
          className={`p-1 -m-1 rounded transition-colors ${dark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {status === 'thanks' ? (
        stars <= 3 ? (
          <div className="mt-2 space-y-3">
            <p className={`text-xs ${muted}`}>Your rating has been counted. Would you tell us what would make it better?</p>
            <div className="flex gap-2">
              <button
                onClick={() => { close(); onSendFeedback(); }}
                className="px-3 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-700 text-white"
              >
                Send feedback
              </button>
              <button onClick={close} className={`px-3 py-1.5 text-xs rounded ${dark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}>
                No thanks
              </button>
            </div>
          </div>
        ) : (
          <p className={`mt-2 text-xs ${muted}`}>It helps other developers find it.</p>
        )
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <StarPicker value={stars} onPick={pick} disabled={status === 'sending'} dark={dark} />
            {status === 'sending' && <Loader2 className={`w-4 h-4 animate-spin ${muted}`} aria-label="Saving" />}
          </div>
          {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-4">
            <button onClick={close} className={linkButton}>Not now</button>
            <button onClick={neverAsk} className={linkButton}>Don't ask again</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RatingPrompt;
