#!/usr/bin/env node

/**
 * AI Provider Test Runner
 *
 * Runs all unit tests for the AI provider architecture.
 *
 * Usage:
 *   node src/services/ai/__tests__/run.js           # Run all unit tests
 *   node src/services/ai/__tests__/run.js --live    # Include live API tests
 *   node src/services/ai/__tests__/run.js --help    # Show help
 */

import { runSuites, colors } from './testUtils.js';
import { allSuites as providerInterfaceSuites } from './ProviderInterface.test.js';
import { allSuites as providersSuites } from './providers.test.js';
import { allSuites as providerManagerSuites } from './ProviderManager.test.js';

// Parse arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const runLive = args.includes('--live') || args.includes('-l');
const verbose = args.includes('--verbose') || args.includes('-v');

if (showHelp) {
  console.log(`
${colors.bright}AI Provider Test Runner${colors.reset}

${colors.cyan}Usage:${colors.reset}
  node src/services/ai/__tests__/run.js [options]

${colors.cyan}Options:${colors.reset}
  --help, -h      Show this help message
  --live, -l      Include live API tests (requires API keys)
  --verbose, -v   Show more detailed output

${colors.cyan}Environment Variables (for live tests):${colors.reset}
  GROQ_API_KEY    Groq API key (gsk_...)
  OPENAI_API_KEY  OpenAI API key (sk-...)
  CLAUDE_API_KEY  Claude API key (sk-ant-...)
  GEMINI_API_KEY  Gemini API key (AIza...)
  MISTRAL_API_KEY Mistral API key

${colors.cyan}Examples:${colors.reset}
  # Run unit tests only
  node src/services/ai/__tests__/run.js

  # Run with live API tests
  GROQ_API_KEY=gsk_... node src/services/ai/__tests__/run.js --live

  # Run all tests with verbose output
  node src/services/ai/__tests__/run.js --live --verbose
`);
  process.exit(0);
}

async function runTests() {
  console.log(`
${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════╗${colors.reset}
${colors.bright}${colors.cyan}║       AI Provider Architecture Tests              ║${colors.reset}
${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════╝${colors.reset}
`);

  // Collect all unit test suites
  const unitSuites = [
    ...providerInterfaceSuites,
    ...providersSuites,
    ...providerManagerSuites,
  ];

  console.log(`${colors.gray}Running ${unitSuites.length} test suites...${colors.reset}\n`);

  // Run unit tests
  let success = await runSuites(unitSuites);

  // Run live tests if requested
  if (runLive) {
    console.log(`\n${colors.bright}${colors.cyan}── Live API Tests ──${colors.reset}\n`);

    try {
      const { allSuites: liveSuites } = await import('./manual.test.js');
      const liveSuccess = await runSuites(liveSuites);
      success = success && liveSuccess;
    } catch (error) {
      console.error(`${colors.red}Failed to run live tests: ${error.message}${colors.reset}`);
      success = false;
    }
  }

  // Final summary
  console.log(`\n${colors.bright}═══════════════════════════════════════════════════${colors.reset}`);

  if (success) {
    console.log(`${colors.green}${colors.bright}All tests passed!${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bright}Some tests failed.${colors.reset}`);
  }

  if (!runLive) {
    console.log(`${colors.gray}Run with --live to include API tests${colors.reset}`);
  }

  return success;
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error(`${colors.red}Test runner error: ${error.message}${colors.reset}`);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  });
