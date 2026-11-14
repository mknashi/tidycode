/**
 * Adds the overall star rating to index.html at build time, from the forms
 * service's public summary (forms/, GET /v1/ratings/summary):
 *
 *   - `aggregateRating` on the WebApplication JSON-LD, for search results
 *   - <meta name="tidycode-rating" content="4.6 38">, which the app reads to
 *     show the same numbers on the welcome screen (Google requires ratings
 *     in structured data to be visible on the page too)
 *
 * Both come from one summary, so they always match. Below MIN_RATINGS, or if
 * the summary can't be fetched, both are left out and the build carries on.
 * Ratings change only when the site is rebuilt.
 *
 * Environment:
 *   RATINGS_SUMMARY_URL   default https://forms.tidycode.ai/v1/ratings/summary?site=tidycode
 *   RATINGS_DISABLED=1    skip the fetch (offline builds)
 */

const DEFAULT_URL = 'https://forms.tidycode.ai/v1/ratings/summary?site=tidycode';
export const MIN_RATINGS = 5;
const FETCH_TIMEOUT_MS = 5000;

const JSON_LD = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/;

/**
 * @param {string} html
 * @param {{ count: number, average: number|null }|null} summary
 * @returns {string}
 */
export function applySiteRating(html, summary) {
  if (!summary || !Number.isInteger(summary.count) || summary.count < MIN_RATINGS) return html;
  if (typeof summary.average !== 'number' || summary.average < 1 || summary.average > 5) return html;

  const match = html.match(JSON_LD);
  if (!match) throw new Error('[site-rating] No JSON-LD block found in index.html');

  const data = JSON.parse(match[2]);
  if (data['@type'] !== 'WebApplication') {
    throw new Error(`[site-rating] Expected WebApplication JSON-LD, found ${data['@type']}`);
  }

  const ratingValue = (Math.round(summary.average * 10) / 10).toFixed(1);
  data.aggregateRating = {
    '@type': 'AggregateRating',
    ratingValue,
    ratingCount: summary.count,
    bestRating: 5,
    worstRating: 1,
  };

  const jsonLd = `\n${JSON.stringify(data, null, 2).replace(/^/gm, '    ')}\n    `;
  return html
    .replace(JSON_LD, (_, open, __, close) => `${open}${jsonLd}${close}`)
    .replace('</head>', `<meta name="tidycode-rating" content="${ratingValue} ${summary.count}" />\n  </head>`);
}

async function fetchSummary(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export default function siteRating() {
  let summary = null;
  return {
    name: 'site-rating',
    apply: 'build',
    async buildStart() {
      if (process.env.RATINGS_DISABLED === '1') return;
      const url = process.env.RATINGS_SUMMARY_URL || DEFAULT_URL;
      try {
        summary = await fetchSummary(url);
        const shown = summary.count >= MIN_RATINGS ? 'adding it to index.html' : `not shown below ${MIN_RATINGS}`;
        console.log(`[site-rating] ${summary.count} ratings, average ${summary.average}: ${shown}`);
      } catch (error) {
        summary = null;
        console.warn(`[site-rating] Couldn't fetch ${url} (${error.message}); building without a rating`);
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler: html => applySiteRating(html, summary),
    },
  };
}
