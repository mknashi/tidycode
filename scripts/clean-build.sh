#!/bin/bash
# Clean Build Script for macOS/Linux
# This script ensures a clean build with the correct PDF.js worker version

echo "======================================"
echo "TidyCode - Clean Build"
echo "======================================"
echo ""

# Step 1: Clean dist folder
echo "[1/4] Cleaning dist folder..."
if [ -d "dist" ]; then
    rm -rf dist
    echo "  ✓ Removed dist folder"
else
    echo "  ✓ No dist folder to clean"
fi
echo ""

# Step 2: Verify dependencies
echo "[2/4] Verifying dependencies..."
pdfjs_version=$(npm list pdfjs-dist --depth=0 2>/dev/null | grep pdfjs-dist@)
if [ -n "$pdfjs_version" ]; then
    echo "  ✓ $pdfjs_version"
else
    echo "  ✗ pdfjs-dist not found - running npm install..."
    npm install
fi
echo ""

# Step 3: Full build
echo "[3/4] Building application (WASM + Vite)..."
npm run build:full
if [ $? -eq 0 ]; then
    echo "  ✓ Build completed successfully"
else
    echo "  ✗ Build failed with exit code $?"
    exit $?
fi
echo ""

# Step 4: Verify worker file
echo "[4/4] Verifying PDF worker..."
if [ -f "dist/pdf.worker.min.mjs" ]; then
    size=$(du -h dist/pdf.worker.min.mjs | cut -f1)
    echo "  ✓ PDF worker found: $size"

    # Verify cmaps
    if [ -d "dist/cmaps" ]; then
        cmap_count=$(ls dist/cmaps | wc -l | tr -d ' ')
        echo "  ✓ CMap files found: $cmap_count files"
    else
        echo "  ⚠ Warning: No CMap files found"
    fi
else
    echo "  ✗ PDF worker NOT found in dist folder!"
    echo "    Expected: dist/pdf.worker.min.mjs"
    exit 1
fi
echo ""

echo "======================================"
echo "Build Complete! Ready for Tauri build"
echo "======================================"
echo ""
echo "Next steps:"
echo "  • macOS: npm run build:desktop"
echo "  • Linux: npm run build:desktop:linux"
echo ""
