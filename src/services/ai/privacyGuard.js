/**
 * Privacy Guard
 *
 * Scans content for sensitive data patterns (API keys, tokens, credentials)
 * before it is sent to external AI providers. Provides redaction and
 * truncation utilities for privacy-first AI usage.
 */

/**
 * Common secret / credential patterns.
 * Each entry: { name, pattern (global RegExp), description }
 */
export const SECRET_PATTERNS = [
  {
    name: 'AWS_ACCESS_KEY',
    pattern: /AKIA[0-9A-Z]{16}/g,
    description: 'AWS Access Key ID',
  },
  {
    name: 'AWS_SECRET_KEY',
    pattern: /(?:aws_secret_access_key|aws_secret|secret_key)\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}/gi,
    description: 'AWS Secret Access Key',
  },
  {
    name: 'GITHUB_TOKEN',
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/g,
    description: 'GitHub personal access token',
  },
  {
    name: 'OPENAI_KEY',
    pattern: /sk-[A-Za-z0-9]{20,}/g,
    description: 'OpenAI-style API key',
  },
  {
    name: 'GROQ_KEY',
    pattern: /gsk_[A-Za-z0-9]{20,}/g,
    description: 'Groq API key',
  },
  {
    name: 'BEARER_TOKEN',
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}=*/gi,
    description: 'Bearer authentication token',
  },
  {
    name: 'PRIVATE_KEY',
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    description: 'Private key header',
  },
  {
    name: 'CONNECTION_STRING',
    pattern: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^:\s]+:[^@\s]+@/gi,
    description: 'Connection string with embedded password',
  },
  {
    name: 'PASSWORD_FIELD',
    pattern: /(?:password|passwd|pwd|secret)\s*[=:]\s*['"][^'"]{4,}['"]/gi,
    description: 'Password in configuration',
  },
  {
    name: 'ANTHROPIC_KEY',
    pattern: /sk-ant-[A-Za-z0-9\-]{20,}/g,
    description: 'Anthropic API key',
  },
  {
    name: 'GENERIC_API_KEY',
    pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"][A-Za-z0-9\-._]{20,}['"]/gi,
    description: 'Generic API key assignment',
  },
];

/**
 * Scan text for potential secrets / sensitive data.
 * @param {string} text - Content to scan
 * @returns {Array<{type: string, match: string, index: number}>} Findings
 */
export function scanForSecrets(text) {
  if (!text || typeof text !== 'string') return [];

  const findings = [];
  const seen = new Set();

  for (const { name, pattern } of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;

    let m;
    while ((m = pattern.exec(text)) !== null) {
      const key = `${name}:${m.index}`;
      if (!seen.has(key)) {
        seen.add(key);
        findings.push({
          type: name,
          match: m[0].length > 12
            ? m[0].slice(0, 6) + '...' + m[0].slice(-4)
            : m[0],
          index: m.index,
        });
      }
    }
  }

  return findings;
}

/**
 * Redact detected secrets in text, replacing each with a placeholder.
 * @param {string} text - Content to redact
 * @returns {{ redactedText: string, findings: Array }}
 */
export function redactSecrets(text) {
  if (!text || typeof text !== 'string') return { redactedText: text, findings: [] };

  let redacted = text;
  const allFindings = [];

  for (const { name, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, (match) => {
      allFindings.push({ type: name, match: match.length > 12 ? match.slice(0, 6) + '...' : match });
      return `[REDACTED-${name}]`;
    });
  }

  return { redactedText: redacted, findings: allFindings };
}

/**
 * Truncate content to a maximum character length.
 * @param {string} text - Content to truncate
 * @param {number} maxChars - Maximum characters (0 = unlimited)
 * @returns {string}
 */
export function truncateContent(text, maxChars) {
  if (!maxChars || maxChars <= 0 || !text || text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars) + '\n...[content truncated to ' + maxChars + ' characters]';
}

/**
 * Providers that run locally and never send data externally.
 */
export const LOCAL_PROVIDERS = ['ollama', 'tinyllm'];

/**
 * Check if a provider is local (no external data transmission).
 * @param {string} providerId
 * @returns {boolean}
 */
export function isLocalProvider(providerId) {
  return LOCAL_PROVIDERS.includes(providerId);
}
