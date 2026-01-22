# Build script for Tauri desktop app on ARM64 Windows
# This script sets up the correct MSVC cross-compiler toolchain

Write-Host "Setting up build environment..." -ForegroundColor Green

# Add MSVC ARM64->x64 cross-compiler to PATH
$msvcPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostarm64\x64"
$env:PATH = "$msvcPath;$env:PATH"

Write-Host "MSVC linker path: $msvcPath" -ForegroundColor Cyan
Write-Host "Building for x64 target on ARM64 host..." -ForegroundColor Cyan

# Run the build
npm run build:desktop:win

Write-Host "Build complete!" -ForegroundColor Green
