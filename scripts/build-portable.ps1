# Build Portable Windows Executable
Write-Host "=== Building TidyCode Portable (Windows x64) ===" -ForegroundColor Cyan

# Run the build
npm run prepare:lsp
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run build:full
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

cargo build --release --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Show the output location
$exePath = "src-tauri\target\x86_64-pc-windows-msvc\release\TidyCode.exe"
Write-Host "`n=== Build Complete ===" -ForegroundColor Green

if (Test-Path $exePath) {
    $fileInfo = Get-Item $exePath
    Write-Host "`nPortable executable created:" -ForegroundColor Cyan
    Write-Host "  Path: $($fileInfo.FullName)" -ForegroundColor White
    Write-Host "  Size: $([math]::Round($fileInfo.Length / 1MB, 2)) MB" -ForegroundColor White
    Write-Host "`nYou can run it directly or sign it with GPG:" -ForegroundColor Yellow
    Write-Host "  npm run sign:gpg" -ForegroundColor White
} else {
    Write-Host "`nWarning: Expected executable not found at $exePath" -ForegroundColor Red
}
