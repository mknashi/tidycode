#!/bin/bash

# Upload Tidy Code binaries to Cloudflare R2
# Usage: ./scripts/upload-to-r2.sh [version]
# Example: ./scripts/upload-to-r2.sh v0.2.0
#
# If no version is provided, it will automatically read from package.json
# If CLOUDFLARE_API_TOKEN is not set, it will prompt for it

set -e

# Configuration
BUCKET_NAME="tidycode-releases"

echo "🔐 Tidy Code R2 Upload"
echo "========================"
echo ""

# Check if token is already set in environment
if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
    echo "✓ Found CLOUDFLARE_API_TOKEN in environment"
    USE_EXISTING_TOKEN=true
else
    USE_EXISTING_TOKEN=false
    echo "Please enter your Cloudflare API Token:"
    echo "(You can create one at: https://dash.cloudflare.com/profile/api-tokens)"
    echo ""

    # Read token securely (hidden input)
    read -s CLOUDFLARE_API_TOKEN
    echo ""

    if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
        echo "❌ No token provided. Exiting."
        exit 1
    fi
fi

# Export token for wrangler to use
export CLOUDFLARE_API_TOKEN

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Install it with: npm install -g wrangler"
    exit 1
fi

# Test authentication
echo ""
echo "🔍 Testing Cloudflare authentication..."
if wrangler r2 bucket list > /dev/null 2>&1; then
    echo "✅ Authentication successful!"
else
    echo "❌ Authentication failed. Please check your API token."
    exit 1
fi

# Auto-detect version from package.json if not provided
if [ -z "$1" ]; then
    if command -v node &> /dev/null; then
        VERSION="v$(node -p "require('./package.json').version")"
        echo "📌 Auto-detected version: ${VERSION}"
    else
        echo "❌ Node.js not found. Please provide version as argument or install Node.js"
        exit 1
    fi
else
    VERSION="$1"
fi

echo ""
echo "📦 Uploading Tidy Code ${VERSION} to Cloudflare R2..."
echo ""

# Find bundle directories across different targets
BUNDLE_DIRS=(
    "./src-tauri/target/release/bundle"
    "./src-tauri/target/universal-apple-darwin/release/bundle"
    "./src-tauri/target/x86_64-apple-darwin/release/bundle"
    "./src-tauri/target/aarch64-apple-darwin/release/bundle"
    "./src-tauri/target/x86_64-pc-windows-msvc/release/bundle"
    "./src-tauri/target/x86_64-unknown-linux-gnu/release/bundle"
)

# Upload macOS Universal DMG (if exists)
for DIST_DIR in "${BUNDLE_DIRS[@]}"; do
    if [ -f "${DIST_DIR}/dmg/TidyCode_"*"_universal.dmg" ]; then
        MAC_UNIVERSAL=$(ls ${DIST_DIR}/dmg/TidyCode_*_universal.dmg 2>/dev/null | head -1)
        if [ -n "$MAC_UNIVERSAL" ]; then
            echo "binary file: $MAC_UNIVERSAL"
            echo "⬆️  Uploading macOS Universal DMG..."
            wrangler r2 object put ${BUCKET_NAME}/TidyCode-${VERSION}-mac-universal.dmg --remote --file="${MAC_UNIVERSAL}"
            echo "✅ macOS Universal uploaded"
            break
        fi
    fi
done

# Upload macOS ARM64 (Apple Silicon) - if separate build exists
for DIST_DIR in "${BUNDLE_DIRS[@]}"; do
    if [ -f "${DIST_DIR}/dmg/TidyCode_"*"_aarch64.dmg" ]; then
        MAC_ARM64=$(ls ${DIST_DIR}/dmg/TidyCode_*_aarch64.dmg 2>/dev/null | head -1)
        if [ -n "$MAC_ARM64" ]; then
            echo "⬆️  Uploading macOS ARM64..."
            wrangler r2 object put ${BUCKET_NAME}/TidyCode-${VERSION}-mac-arm64.dmg --remote --file="${MAC_ARM64}"
            echo "✅ macOS ARM64 uploaded"
            break
        fi
    fi
done

# Upload macOS x64 (Intel) - if separate build exists
for DIST_DIR in "${BUNDLE_DIRS[@]}"; do
    if [ -f "${DIST_DIR}/dmg/TidyCode_"*"_x64.dmg" ]; then
        MAC_X64=$(ls ${DIST_DIR}/dmg/TidyCode_*_x64.dmg 2>/dev/null | head -1)
        if [ -n "$MAC_X64" ]; then
            echo "⬆️  Uploading macOS x64..."
            wrangler r2 object put ${BUCKET_NAME}/TidyCode-${VERSION}-mac-x64.dmg --remote --file="${MAC_X64}"
            echo "✅ macOS x64 uploaded"
            break
        fi
    fi
done

# Upload Windows x64 MSI
for DIST_DIR in "${BUNDLE_DIRS[@]}"; do
    if [ -f "${DIST_DIR}/msi/TidyCode_"*"_x64_en-US.msi" ]; then
        WIN_X64=$(ls ${DIST_DIR}/msi/TidyCode_*_x64_en-US.msi 2>/dev/null | head -1)
        if [ -n "$WIN_X64" ]; then
            echo "⬆️  Uploading Windows x64..."
            wrangler r2 object put ${BUCKET_NAME}/TidyCode-${VERSION}-windows-x64.msi --remote --file="${WIN_X64}"
            echo "✅ Windows x64 uploaded"
            break
        fi
    fi
done

# Upload Windows Portable (NSIS installer)
for DIST_DIR in "${BUNDLE_DIRS[@]}"; do
    if [ -f "${DIST_DIR}/nsis/TidyCode_"*"_x64-setup.exe" ]; then
        WIN_PORTABLE=$(ls ${DIST_DIR}/nsis/TidyCode_*_x64-setup.exe 2>/dev/null | head -1)
        if [ -n "$WIN_PORTABLE" ]; then
            echo "⬆️  Uploading Windows portable..."
            wrangler r2 object put ${BUCKET_NAME}/TidyCode-${VERSION}-windows-portable.exe --remote --file="${WIN_PORTABLE}"
            echo "✅ Windows portable uploaded"
            break
        fi
    fi
done

# Upload Linux AppImage
for DIST_DIR in "${BUNDLE_DIRS[@]}"; do
    if [ -f "${DIST_DIR}/appimage/TidyCode_"*"_amd64.AppImage" ]; then
        LINUX_APPIMAGE=$(ls ${DIST_DIR}/appimage/TidyCode_*_amd64.AppImage 2>/dev/null | head -1)
        if [ -n "$LINUX_APPIMAGE" ]; then
            echo "⬆️  Uploading Linux AppImage..."
            wrangler r2 object put ${BUCKET_NAME}/TidyCode-${VERSION}-linux-x86_64.AppImage --remote --file="${LINUX_APPIMAGE}"
            echo "✅ Linux AppImage uploaded"
            break
        fi
    fi
done

# Upload Linux DEB package
for DIST_DIR in "${BUNDLE_DIRS[@]}"; do
    if [ -f "${DIST_DIR}/deb/tidycode_"*"_amd64.deb" ]; then
        LINUX_DEB=$(ls ${DIST_DIR}/deb/tidycode_*_amd64.deb 2>/dev/null | head -1)
        if [ -n "$LINUX_DEB" ]; then
            echo "⬆️  Uploading Linux DEB..."
            wrangler r2 object put ${BUCKET_NAME}/TidyCode-${VERSION}-linux-amd64.deb --remote --file="${LINUX_DEB}"
            echo "✅ Linux DEB uploaded"
            break
        fi
    fi
done

# Upload Linux RPM package
for DIST_DIR in "${BUNDLE_DIRS[@]}"; do
    if [ -f "${DIST_DIR}/rpm/tidycode-"*".x86_64.rpm" ]; then
        LINUX_RPM=$(ls ${DIST_DIR}/rpm/tidycode-*.x86_64.rpm 2>/dev/null | head -1)
        if [ -n "$LINUX_RPM" ]; then
            echo "⬆️  Uploading Linux RPM..."
            wrangler r2 object put ${BUCKET_NAME}/TidyCode-${VERSION}-linux-x86_64.rpm --remote --file="${LINUX_RPM}"
            echo "✅ Linux RPM uploaded"
            break
        fi
    fi
done

echo ""
echo "🎉 Upload complete!"
echo ""
echo "Public URLs (using pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev):"
echo ""
echo "macOS:"
echo "  Universal DMG:   https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-${VERSION}-mac-universal.dmg"
echo "  ARM64 DMG:       https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-${VERSION}-mac-arm64.dmg"
echo "  x64 DMG:         https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-${VERSION}-mac-x64.dmg"
echo ""
echo "Windows:"
echo "  x64 MSI:         https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-${VERSION}-windows-x64.msi"
echo "  x64 Installer:   https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-${VERSION}-windows-portable.exe"
echo ""
echo "Linux:"
echo "  AppImage:        https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-${VERSION}-linux-x86_64.AppImage"
echo "  DEB Package:     https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-${VERSION}-linux-amd64.deb"
echo "  RPM Package:     https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-${VERSION}-linux-x86_64.rpm"

# Offer to save token for future use
if [ "$USE_EXISTING_TOKEN" = false ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "💡 Tip: To avoid entering the token each time, you can:"
    echo "   1. Add to your shell config (~/.zshrc or ~/.bashrc):"
    echo "      export CLOUDFLARE_API_TOKEN=\"your-token-here\""
    echo ""
    echo "   2. Or create a .env file (add to .gitignore!):"
    echo "      echo 'CLOUDFLARE_API_TOKEN=your-token' > .env"
    echo "      echo '.env' >> .gitignore"
    echo ""
fi
