#!/usr/bin/env node
/**
 * Smart WASM build script
 * Checks if WASM is already built, otherwise attempts to build it
 * Workaround for wasm-pack ARM64 Windows compatibility issues
 */

import { existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const wasmPkgDir = join(projectRoot, 'src-wasm', 'pkg');
const wasmFile = join(wasmPkgDir, 'file_ops_wasm_bg.wasm');

console.log('[build-wasm] Checking WASM build status...');

// Check if WASM is already built
if (existsSync(wasmFile)) {
  const stats = statSync(wasmFile);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const age = Math.floor((Date.now() - stats.mtimeMs) / 1000 / 60); // minutes

  console.log(`[build-wasm] ✓ WASM already built: ${sizeMB}MB (${age} minutes old)`);
  console.log(`[build-wasm] Skipping rebuild. Delete src-wasm/pkg/ to force rebuild.`);
  process.exit(0);
}

console.log('[build-wasm] WASM not found, attempting to build...');

// Try to build WASM
try {
  console.log('[build-wasm] Running: wasm-pack build --target web --out-dir pkg --release');

  execSync('wasm-pack build --target web --out-dir pkg --release', {
    cwd: join(projectRoot, 'src-wasm'),
    stdio: 'inherit'
  });

  console.log('[build-wasm] ✓ WASM build successful');
  process.exit(0);
} catch (error) {
  console.error('[build-wasm] ✗ wasm-pack build failed');
  console.error('[build-wasm] Error:', error.message);

  // Check if this is the ARM64 Windows issue
  if (process.platform === 'win32' && process.arch === 'arm64') {
    console.error('\n[build-wasm] ⚠️  ARM64 Windows Detected');
    console.error('[build-wasm] The npm wasm-pack package does not support Windows ARM64.');
    console.error('[build-wasm] \n[build-wasm] To build WASM on ARM64 Windows, you need to:');
    console.error('[build-wasm] 1. Install wasm-pack via cargo:');
    console.error('[build-wasm]    cargo install wasm-pack');
    console.error('[build-wasm] \n[build-wasm] 2. OR use cargo directly:');
    console.error('[build-wasm]    cd src-wasm');
    console.error('[build-wasm]    cargo build --target wasm32-unknown-unknown --release');
    console.error('[build-wasm]    wasm-bindgen target/wasm32-unknown-unknown/release/file_ops_wasm.wasm --out-dir pkg --target web');
    console.error('[build-wasm] \n[build-wasm] 3. OR build in WSL/Docker');
    console.error('[build-wasm] \n[build-wasm] For now, continuing with build (WASM features will be disabled)...\n');
  }

  // Don't fail the build - just continue without WASM
  console.warn('[build-wasm] ⚠️  Continuing build without WASM support');
  process.exit(0);
}
