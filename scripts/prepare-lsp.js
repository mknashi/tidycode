#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Ensures LSP resource directories exist and emits guidance.
 * Does not download binaries (see scripts/download-lsp-binaries.sh).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const languages = ['javascript', 'typescript', 'python', 'rust', 'java', 'cpp', 'php'];
const platforms = ['macos', 'linux', 'windows'];
const root = path.join(__dirname, '..', 'src-tauri', 'resources', 'lsp');

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

languages.forEach((lang) => {
  platforms.forEach((plat) => {
    const dir = path.join(root, lang, plat);
    ensureDir(dir);
    const keep = path.join(dir, '.gitkeep');
    if (!fs.existsSync(keep)) {
      fs.writeFileSync(keep, '');
    }
  });
});

console.log('[prepare-lsp] ensured LSP resource directories exist under src-tauri/resources/lsp');
console.log('[prepare-lsp] place per-platform binaries or launcher scripts in each folder before packaging.');
