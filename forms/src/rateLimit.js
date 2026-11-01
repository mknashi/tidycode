/**
 * In-memory sliding-window rate limiter. The service runs as a single
 * instance, so memory is enough; limits reset on restart.
 */

export class RateLimiter {
  constructor() {
    /** @type {Map<string, number[]>} key -> request timestamps */
    this.hits = new Map();
  }

  /**
   * Record a hit if it fits within every window.
   * @param {string} key
   * @param {Array<{windowMs: number, max: number}>} limits
   * @param {number} [now]
   * @returns {boolean} false when a limit is reached (the hit is not recorded)
   */
  allow(key, limits, now = Date.now()) {
    const longest = Math.max(...limits.map(l => l.windowMs));
    const recent = (this.hits.get(key) || []).filter(t => now - t < longest);

    for (const { windowMs, max } of limits) {
      if (recent.filter(t => now - t < windowMs).length >= max) {
        this.hits.set(key, recent);
        return false;
      }
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Drop keys with no hits in the last `maxAgeMs` */
  prune(maxAgeMs, now = Date.now()) {
    for (const [key, times] of this.hits) {
      if (!times.some(t => now - t < maxAgeMs)) this.hits.delete(key);
    }
  }
}
