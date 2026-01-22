# Build Tidy Code for all Windows architectures
# This script builds the app for both x64 and ARM64

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building Tidy Code for Windows (All Architectures)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Visual Studio Build Tools are installed
Write-Host "Checking for Visual Studio Build Tools..." -ForegroundColor Yellow
$linkExePath = Get-Command link.exe -ErrorAction SilentlyContinue
if (-not $linkExePath) {
    Write-Host "ERROR: Visual Studio Build Tools not found!" -ForegroundColor Red
    Write-Host "Please install Visual Studio 2017 or later with 'Desktop development with C++'" -ForegroundColor Red
    Write-Host "Download from: https://visualstudio.microsoft.com/downloads/" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ Visual Studio Build Tools found: $($linkExePath.Source)" -ForegroundColor Green
Write-Host ""

# Check if Rust is installed
Write-Host "Checking Rust installation..." -ForegroundColor Yellow
$rustcPath = Get-Command rustc -ErrorAction SilentlyContinue
if (-not $rustcPath) {
    Write-Host "ERROR: Rust not found!" -ForegroundColor Red
    Write-Host "Please install Rust from: https://rustup.rs/" -ForegroundColor Yellow
    exit 1
}
$rustVersion = rustc --version
Write-Host "✓ Rust found: $rustVersion" -ForegroundColor Green
Write-Host ""

# Check targets
Write-Host "Verifying Rust targets..." -ForegroundColor Yellow
$targets = rustup target list --installed
if ($targets -notcontains "x86_64-pc-windows-msvc") {
    Write-Host "Adding x86_64-pc-windows-msvc target..." -ForegroundColor Yellow
    rustup target add x86_64-pc-windows-msvc
}
if ($targets -notcontains "aarch64-pc-windows-msvc") {
    Write-Host "Adding aarch64-pc-windows-msvc target..." -ForegroundColor Yellow
    rustup target add aarch64-pc-windows-msvc
}
Write-Host "✓ All targets ready" -ForegroundColor Green
Write-Host ""

# Build x64
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building for x64 (x86_64-pc-windows-msvc)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
npm run build:desktop:win:x64
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: x64 build failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "✓ x64 build completed successfully" -ForegroundColor Green
Write-Host ""

# Build ARM64
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building for ARM64 (aarch64-pc-windows-msvc)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
npm run build:desktop:win:arm64
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: ARM64 build failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "✓ ARM64 build completed successfully" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$bundlePath = "src-tauri\target\release\bundle"
if (Test-Path $bundlePath) {
    Write-Host "Build artifacts are located in:" -ForegroundColor Green
    Write-Host "  $bundlePath" -ForegroundColor White
    Write-Host ""

    # List MSI files
    $msiFiles = Get-ChildItem -Path $bundlePath -Recurse -Filter "*.msi" -ErrorAction SilentlyContinue
    if ($msiFiles) {
        Write-Host "MSI Installers:" -ForegroundColor Yellow
        foreach ($msi in $msiFiles) {
            $sizeInMB = [math]::Round($msi.Length / 1MB, 2)
            Write-Host "  - $($msi.FullName) (${sizeInMB} MB)" -ForegroundColor White
        }
        Write-Host ""
    }

    # List EXE files
    $exeFiles = Get-ChildItem -Path $bundlePath -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue
    if ($exeFiles) {
        Write-Host "EXE Installers:" -ForegroundColor Yellow
        foreach ($exe in $exeFiles) {
            $sizeInMB = [math]::Round($exe.Length / 1MB, 2)
            Write-Host "  - $($exe.FullName) (${sizeInMB} MB)" -ForegroundColor White
        }
        Write-Host ""
    }
}

Write-Host "✓ All builds completed successfully!" -ForegroundColor Green
Write-Host ""
