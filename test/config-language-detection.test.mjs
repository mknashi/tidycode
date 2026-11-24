import test from 'node:test';
import assert from 'node:assert/strict';
import { detectConfigurationLanguage as detect } from '../src/utils/configLanguageDetection.js';

test('YAML flow maps, comments and punctuation are detected without requiring valid syntax', () => {
  assert.equal(detect(`routing_rules:
  - name: "high-priority-events"
    match_headers: { "X-Priority": "high", "X-Region": "us-central" }
    destinations:
      - endpoint: "https://example.com"
        weight: 80
# DOCUMENT 2: Edge-Case Parser Stress Test
---
edge_cases:
  unquoted_symbols: @#$%^&*()_+-=[]{}|;,.<>?/
...`), 'yaml');
});

test('configuration comments do not become Markdown headings', () => {
  assert.equal(detect('# Configuration\n# Database\ndatabase:\n  host: localhost'), 'yaml');
  assert.equal(detect('# Configuration\n[database]\nhost = "localhost"'), 'toml');
});

test('Markdown and CSS remain available to their own detectors', () => {
  assert.equal(detect('# Title\n\n---\n## Details\n- One\n- Two'), null);
  assert.equal(detect('body { color: red; }'), null);
  assert.equal(detect('# Documentation\n\nA paragraph with a colon: text.'), null);
});

test('quoted YAML keys and incomplete nested values are recognized', () => {
  assert.equal(detect('"service-name":\n  enabled: true\n  values: ['), 'yaml');
});

test('single YAML assignments retain their language', () => {
  assert.equal(detect('name: alpha'), 'yaml');
  assert.equal(detect('enabled: true'), 'yaml');
});
