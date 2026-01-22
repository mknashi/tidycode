#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[smoke] Building web assets..."
npm run build

echo "[smoke] Preparing LSP directories..."
npm run prepare:lsp

echo "[smoke] Running tauri build (debug, no bundles)..."
tauri build --debug --bundles none

echo "[smoke] Done."
