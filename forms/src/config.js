/**
 * Site configuration: which sites may submit, from which origins, and where
 * their messages go. Loaded once at startup; the service refuses to start
 * on an invalid file.
 */

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const SITE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SITE_DEFAULTS = {
  maxMessageLength: 5000,
  maxLinks: 2,
  perHour: 5,
  perDay: 20,
};

function fail(message) {
  throw new Error(`Invalid forms config: ${message}`);
}

function normalizeOrigin(id, origin) {
  if (typeof origin !== 'string') fail(`site "${id}": origins must be strings`);
  // Desktop webviews use non-http schemes such as tauri://localhost
  const match = origin.match(/^([a-z][a-z0-9+.-]*):\/\/[^/\s]+$/i);
  if (!match) fail(`site "${id}": "${origin}" is not an origin (scheme://host[:port], no path)`);
  return origin.toLowerCase();
}

/**
 * Validate a parsed config object and fill in defaults.
 * @param {Object} raw
 * @returns {{ sites: Map<string, Object> }}
 */
export function buildConfig(raw) {
  if (!raw || typeof raw !== 'object' || !raw.sites || typeof raw.sites !== 'object') {
    fail('expected a top-level "sites" map');
  }

  const sites = new Map();
  for (const [id, site] of Object.entries(raw.sites)) {
    if (!SITE_ID.test(id)) fail(`site id "${id}" must be lowercase letters, digits and dashes`);
    if (!site || typeof site !== 'object') fail(`site "${id}" must be a map`);

    const to = Array.isArray(site.to) ? site.to : [site.to];
    if (to.length === 0 || !to.every(addr => typeof addr === 'string' && EMAIL.test(addr))) {
      fail(`site "${id}": "to" must be an email address or a list of them`);
    }
    if (!Array.isArray(site.origins) || site.origins.length === 0) {
      fail(`site "${id}": "origins" must list at least one origin`);
    }
    if (site.from !== undefined && typeof site.from !== 'string') {
      fail(`site "${id}": "from" must be a string`);
    }
    if (site.ratings !== undefined && typeof site.ratings !== 'boolean') {
      fail(`site "${id}": "ratings" must be true or false`);
    }

    const merged = { ...SITE_DEFAULTS, ...site };
    for (const key of Object.keys(SITE_DEFAULTS)) {
      if (!Number.isInteger(merged[key]) || merged[key] < 0) fail(`site "${id}": "${key}" must be a whole number`);
    }

    sites.set(id, {
      id,
      name: typeof site.name === 'string' ? site.name : id,
      origins: site.origins.map(origin => normalizeOrigin(id, origin)),
      to,
      from: site.from,
      ratings: site.ratings === true,
      maxMessageLength: merged.maxMessageLength,
      maxLinks: merged.maxLinks,
      limits: [
        { windowMs: 60 * 60 * 1000, max: merged.perHour },
        { windowMs: 24 * 60 * 60 * 1000, max: merged.perDay },
      ],
    });
  }

  if (sites.size === 0) fail('no sites configured');
  return { sites };
}

/** @param {string} path - YAML file */
export function loadConfig(path) {
  return buildConfig(parse(readFileSync(path, 'utf8')));
}
