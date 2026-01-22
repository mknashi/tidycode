#!/usr/bin/env bash
set -euo pipefail

# This helper downloads open-source LSP binaries into src-tauri/resources/lsp.
# It does NOT run automatically; execute manually when you have network access.
# Licensing: ensure you comply with each tool's license before distributing.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT_DIR/src-tauri/resources/lsp"
mkdir -p "$DEST"

download() {
  local url="$1"
  local out="$2"
  echo "Downloading $url -> $out"
  curl -L --fail --retry 3 "$url" -o "$out"
  chmod +x "$out" || true
}

platform="$(uname | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
echo "Detected platform=$platform arch=$arch"

# Known-good clangd release
CLANGD_VER="19.1.0"

case "$platform" in
  darwin)
    download "https://github.com/clangd/clangd/releases/download/${CLANGD_VER}/clangd-mac-${CLANGD_VER}.zip" "$DEST/cpp/macos/clangd.zip"
    # Rust analyzer (create universal binary)
    download "https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-aarch64-apple-darwin.gz" "$DEST/rust/macos/rust-analyzer-aarch64.gz"
    download "https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-x86_64-apple-darwin.gz" "$DEST/rust/macos/rust-analyzer-x86_64.gz"
    (
      cd "$DEST/rust/macos"
      gunzip -f rust-analyzer-aarch64.gz
      gunzip -f rust-analyzer-x86_64.gz
      lipo -create -output rust-analyzer rust-analyzer-aarch64 rust-analyzer-x86_64
      chmod +x rust-analyzer
      rm -f rust-analyzer-aarch64 rust-analyzer-x86_64
    )
    # TypeScript LS (Node-based) - provide a launcher script instead of binary
    cat > "$DEST/javascript/macos/typescript-language-server" <<'EOF'
#!/usr/bin/env bash
node "$(dirname "$0")/node_modules/.bin/typescript-language-server" "$@"
EOF
    chmod +x "$DEST/javascript/macos/typescript-language-server"
    ;;
  linux)
    download "https://github.com/clangd/clangd/releases/download/${CLANGD_VER}/clangd-linux-${CLANGD_VER}.zip" "$DEST/cpp/linux/clangd.zip"
    download "https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-x86_64-unknown-linux-gnu.gz" "$DEST/rust/linux/rust-analyzer.gz"
    cat > "$DEST/javascript/linux/typescript-language-server" <<'EOF'
#!/usr/bin/env bash
node "$(dirname "$0")/node_modules/.bin/typescript-language-server" "$@"
EOF
    chmod +x "$DEST/javascript/linux/typescript-language-server"
    ;;
  msys*|cygwin*|mingw*|windows*)
    download "https://github.com/clangd/clangd/releases/download/${CLANGD_VER}/clangd-windows-${CLANGD_VER}.zip" "$DEST/cpp/windows/clangd.zip"
    download "https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-x86_64-pc-windows-msvc.gz" "$DEST/rust/windows/rust-analyzer.gz"
    ;;
  *)
    echo "Unsupported platform: $platform"
    exit 1
    ;;
esac

echo "Next steps:"
echo "- Unzip .zip files and gunzip .gz files; ensure executables are in the per-platform folders."
echo "- For Node/Java servers (typescript-language-server, pyright-langserver, jdtls, intelephense), place a launcher script or the installed binaries in the respective folders."
