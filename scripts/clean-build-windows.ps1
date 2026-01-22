# Clean Build Script for Windows
# This script ensures a clean build with the correct PDF.js worker version

Write-Host "======================================"
Write-Host "TidyCode - Clean Build for Windows"
Write-Host "======================================"
Write-Host ""

# Step 1: Clean dist folder
Write-Host "[1/4] Cleaning dist folder..."
if (Test-Path "dist") {
    Remove-Item -Recurse -Force dist
    Write-Host "  OK - Removed dist folder"
}
if (-not (Test-Path "dist")) {
    Write-Host "  OK - No dist folder to clean"
}
Write-Host ""

# Step 2: Verify dependencies
Write-Host "[2/4] Verifying dependencies..."
$pdfjs = npm list pdfjs-dist --depth=0 2>&1 | Select-String "pdfjs-dist@"
if ($pdfjs) {
    Write-Host "  OK - $pdfjs"
}
if (-not $pdfjs) {
    Write-Host "  ERROR - pdfjs-dist not found - running npm install..."
    npm install
}
Write-Host ""

# Step 3: Full build
Write-Host "[3/4] Building application..."
npm run build:full
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - Build completed successfully"
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR - Build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host ""

# Step 4: Verify worker file
Write-Host "[4/4] Verifying PDF worker..."
$workerExists = Test-Path "dist\pdf.worker.min.mjs"

if (-not $workerExists) {
    Write-Host "  ERROR - PDF worker NOT found in dist folder!"
    Write-Host "    Expected: dist\pdf.worker.min.mjs"
    exit 1
}

if ($workerExists) {
    $size = (Get-Item "dist\pdf.worker.min.mjs").Length / 1MB
    $sizeRounded = [math]::Round($size, 2)
    Write-Host "  OK - PDF worker found: $sizeRounded MB"
}

# Check for cmaps
$cmapsExists = Test-Path "dist\cmaps"
$cmapCount = 0

if ($cmapsExists) {
    $cmapCount = (Get-ChildItem "dist\cmaps" -ErrorAction SilentlyContinue | Measure-Object).Count
}

if ($cmapsExists -and $cmapCount -gt 0) {
    Write-Host "  OK - CMap files found: $cmapCount files"
}

if ($cmapsExists -and $cmapCount -eq 0) {
    Write-Host "  WARNING - No CMap files found"
}

if (-not $cmapsExists) {
    Write-Host "  WARNING - cmaps directory not found"
}

Write-Host ""

Write-Host "======================================"
Write-Host "Build Complete! Ready for Tauri build"
Write-Host "======================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  - For x64:   npm run build:desktop:win:x64"
Write-Host "  - For ARM64: npm run build:desktop:win:arm64"
Write-Host "  - For both:  npm run build:desktop:win:all"
Write-Host ""
