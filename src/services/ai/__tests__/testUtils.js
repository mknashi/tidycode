/**
 * Test Utilities for AI Provider Tests
 *
 * Simple test framework that works without external dependencies.
 */

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Test results collector
 */
class TestResults {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.errors = [];
    this.startTime = Date.now();
  }

  addPass(name) {
    this.passed++;
    console.log(`  ${colors.green}✓${colors.reset} ${name}`);
  }

  addFail(name, error) {
    this.failed++;
    this.errors.push({ name, error });
    console.log(`  ${colors.red}✗${colors.reset} ${name}`);
    console.log(`    ${colors.red}${error.message}${colors.reset}`);
  }

  addSkip(name, reason) {
    this.skipped++;
    console.log(`  ${colors.yellow}○${colors.reset} ${name} ${colors.gray}(${reason})${colors.reset}`);
  }

  summary() {
    const duration = Date.now() - this.startTime;
    console.log('\n' + '─'.repeat(50));
    console.log(`${colors.bright}Test Results:${colors.reset}`);
    console.log(`  ${colors.green}Passed:${colors.reset}  ${this.passed}`);
    console.log(`  ${colors.red}Failed:${colors.reset}  ${this.failed}`);
    console.log(`  ${colors.yellow}Skipped:${colors.reset} ${this.skipped}`);
    console.log(`  ${colors.gray}Duration: ${duration}ms${colors.reset}`);

    if (this.errors.length > 0) {
      console.log(`\n${colors.red}${colors.bright}Failures:${colors.reset}`);
      this.errors.forEach(({ name, error }) => {
        console.log(`\n  ${colors.red}${name}${colors.reset}`);
        console.log(`  ${error.stack || error.message}`);
      });
    }

    return this.failed === 0;
  }
}

/**
 * Test suite class
 */
export class TestSuite {
  constructor(name) {
    this.name = name;
    this.tests = [];
    this.beforeAllFn = null;
    this.afterAllFn = null;
    this.beforeEachFn = null;
    this.afterEachFn = null;
  }

  beforeAll(fn) {
    this.beforeAllFn = fn;
  }

  afterAll(fn) {
    this.afterAllFn = fn;
  }

  beforeEach(fn) {
    this.beforeEachFn = fn;
  }

  afterEach(fn) {
    this.afterEachFn = fn;
  }

  test(name, fn, options = {}) {
    this.tests.push({ name, fn, options });
  }

  skip(name, fn) {
    this.tests.push({ name, fn, options: { skip: true } });
  }

  async run(results = new TestResults()) {
    console.log(`\n${colors.bright}${colors.cyan}${this.name}${colors.reset}`);

    if (this.beforeAllFn) {
      try {
        await this.beforeAllFn();
      } catch (error) {
        console.log(`  ${colors.red}beforeAll failed: ${error.message}${colors.reset}`);
        return results;
      }
    }

    for (const { name, fn, options } of this.tests) {
      if (options.skip) {
        results.addSkip(name, options.skipReason || 'skipped');
        continue;
      }

      try {
        if (this.beforeEachFn) await this.beforeEachFn();
        await fn();
        if (this.afterEachFn) await this.afterEachFn();
        results.addPass(name);
      } catch (error) {
        results.addFail(name, error);
      }
    }

    if (this.afterAllFn) {
      try {
        await this.afterAllFn();
      } catch (error) {
        console.log(`  ${colors.yellow}afterAll failed: ${error.message}${colors.reset}`);
      }
    }

    return results;
  }
}

/**
 * Assertion helpers
 */
export const assert = {
  ok(value, message = 'Expected value to be truthy') {
    if (!value) {
      throw new Error(message);
    }
  },

  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected} but got ${actual}`);
    }
  },

  deepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new Error(message || `Expected ${expectedStr} but got ${actualStr}`);
    }
  },

  notEqual(actual, expected, message) {
    if (actual === expected) {
      throw new Error(message || `Expected ${actual} to not equal ${expected}`);
    }
  },

  throws(fn, message = 'Expected function to throw') {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error(message);
    }
  },

  async rejects(promise, message = 'Expected promise to reject') {
    let rejected = false;
    try {
      await promise;
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error(message);
    }
  },

  instanceOf(value, constructor, message) {
    if (!(value instanceof constructor)) {
      throw new Error(message || `Expected instance of ${constructor.name}`);
    }
  },

  includes(array, value, message) {
    if (!array.includes(value)) {
      throw new Error(message || `Expected array to include ${value}`);
    }
  },

  hasProperty(obj, prop, message) {
    if (!(prop in obj)) {
      throw new Error(message || `Expected object to have property ${prop}`);
    }
  },

  isFunction(value, message) {
    if (typeof value !== 'function') {
      throw new Error(message || 'Expected value to be a function');
    }
  },

  isArray(value, message) {
    if (!Array.isArray(value)) {
      throw new Error(message || 'Expected value to be an array');
    }
  },

  lengthOf(value, length, message) {
    if (value.length !== length) {
      throw new Error(message || `Expected length ${length} but got ${value.length}`);
    }
  },

  greaterThan(actual, expected, message) {
    if (actual <= expected) {
      throw new Error(message || `Expected ${actual} to be greater than ${expected}`);
    }
  },
};

/**
 * Mock fetch for testing without actual API calls
 */
export function createMockFetch(responses = {}) {
  return async (url, options = {}) => {
    const urlStr = url.toString();

    // Find matching response
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlStr.includes(pattern)) {
        if (response.error) {
          throw new Error(response.error);
        }

        return {
          ok: response.ok ?? true,
          status: response.status ?? 200,
          statusText: response.statusText ?? 'OK',
          json: async () => response.body ?? {},
          text: async () => JSON.stringify(response.body ?? {}),
          body: response.stream ? createMockStream(response.chunks) : null,
        };
      }
    }

    // Default 404 response
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Not found' }),
      text: async () => 'Not found',
    };
  };
}

/**
 * Create a mock readable stream for testing streaming responses
 */
function createMockStream(chunks = []) {
  let index = 0;
  return {
    getReader() {
      return {
        async read() {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const chunk = chunks[index++];
          const encoder = new TextEncoder();
          return { done: false, value: encoder.encode(chunk) };
        },
        releaseLock() {},
      };
    },
  };
}

/**
 * Run multiple test suites
 */
export async function runSuites(suites) {
  const results = new TestResults();

  for (const suite of suites) {
    await suite.run(results);
  }

  const success = results.summary();
  return success;
}

export { TestResults, colors };
