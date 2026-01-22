#!/bin/bash

# Build script for WASM module
# This compiles the Rust code to WebAssembly

set -e

echo "Building Tidy Code WASM module..."

# Navigate to wasm directory
cd "$(dirname "$0")"

# Build with wasm-pack
# --target web: For use with ES modules (Vite)
# --out-dir pkg: Output directory
# --release: Optimized build
wasm-pack build --target web --out-dir pkg --release

echo "✓ WASM module built successfully!"
echo "Output: src-wasm/pkg/"
echo ""
echo "Files generated:"
ls -lh pkg/
