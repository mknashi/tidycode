# GPG Signing Script for TidyCode Windows Binaries
# This script signs the built executable with GPG and creates verification files

param(
    [string]$BinaryPath = "src-tauri\target\x86_64-pc-windows-msvc\release\TidyCode.exe",
    [string]$KeyId = $env:GPG_KEY_ID
)

Write-Host "=== TidyCode GPG Signing Script ===" -ForegroundColor Cyan

# Check if GPG is installed
try {
    $gpgVersion = gpg --version 2>$null
    if (-not $?) {
        throw "GPG not found"
    }
    Write-Host "✓ GPG found" -ForegroundColor Green
} catch {
    Write-Host "✗ GPG is not installed" -ForegroundColor Red
    Write-Host "Install GPG from: https://gnupg.org/download/" -ForegroundColor Yellow
    exit 1
}

# Check if binary exists
if (-not (Test-Path $BinaryPath)) {
    Write-Host "✗ Binary not found at: $BinaryPath" -ForegroundColor Red
    Write-Host "Build the project first with: npm run build:desktop:win:portable" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Binary found: $BinaryPath" -ForegroundColor Green

# Get file info
$binary = Get-Item $BinaryPath
$directory = $binary.Directory.FullName
$filename = $binary.Name

# If no key ID provided, list available keys
if (-not $KeyId) {
    Write-Host "`nAvailable GPG keys:" -ForegroundColor Yellow
    gpg --list-secret-keys --keyid-format LONG
    Write-Host "`nUsage:" -ForegroundColor Yellow
    Write-Host "  .\scripts\sign-with-gpg.ps1 -KeyId YOUR_KEY_ID" -ForegroundColor White
    Write-Host "  OR set environment variable: `$env:GPG_KEY_ID='YOUR_KEY_ID'" -ForegroundColor White
    exit 1
}

Write-Host "`nSigning with Key ID: $KeyId" -ForegroundColor Cyan

# Create detached signature
Write-Host "`nCreating detached signature..." -ForegroundColor Cyan
$signatureFile = "$BinaryPath.asc"
gpg --default-key $KeyId --detach-sign --armor --output $signatureFile $BinaryPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Signature created: $signatureFile" -ForegroundColor Green
} else {
    Write-Host "✗ Signature creation failed" -ForegroundColor Red
    exit 1
}

# Create SHA256 checksum
Write-Host "`nCreating SHA256 checksum..." -ForegroundColor Cyan
$hash = (Get-FileHash -Path $BinaryPath -Algorithm SHA256).Hash
$checksumFile = "$BinaryPath.sha256"
"$hash  $filename" | Out-File -FilePath $checksumFile -Encoding ASCII -NoNewline

Write-Host "✓ Checksum created: $checksumFile" -ForegroundColor Green
Write-Host "  SHA256: $hash" -ForegroundColor White

# Sign the checksum file too
Write-Host "`nSigning checksum file..." -ForegroundColor Cyan
gpg --default-key $KeyId --clearsign $checksumFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Signed checksum created: $checksumFile.asc" -ForegroundColor Green
    Remove-Item $checksumFile # Keep only the signed version
} else {
    Write-Host "✗ Checksum signing failed" -ForegroundColor Red
}

# Create verification instructions
$verifyFile = Join-Path $directory "VERIFY.txt"
@"
TidyCode - Binary Verification Instructions
==============================================

Files:
- $filename              (The executable)
- $filename.asc          (GPG signature)
- $filename.sha256.asc   (Signed SHA256 checksum)

To verify the binary authenticity:

1. Install GPG:
   - Windows: https://gnupg.org/download/
   - Or via Chocolatey: choco install gnupg

2. Import the TidyCode public key:
   gpg --keyserver keys.openpgp.org --recv-keys $KeyId

   OR download from GitHub releases and import:
   gpg --import tidycode-public-key.asc

3. Verify the signature:
   gpg --verify $filename.asc $filename

4. Verify the checksum:
   gpg --verify $filename.sha256.asc

   Then compare the hash manually:
   Get-FileHash -Algorithm SHA256 $filename

Expected output: "Good signature from TidyCode"

Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@ | Out-File -FilePath $verifyFile -Encoding UTF8

Write-Host "✓ Verification instructions created: $verifyFile" -ForegroundColor Green

Write-Host "`n=== Signing Complete ===" -ForegroundColor Green
Write-Host "`nGenerated files:" -ForegroundColor Cyan
Write-Host "  - $signatureFile" -ForegroundColor White
Write-Host "  - $checksumFile.asc" -ForegroundColor White
Write-Host "  - $verifyFile" -ForegroundColor White

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Export your public key: gpg --armor --export $KeyId > tidycode-public-key.asc"
Write-Host "2. Include all files in your GitHub release"
Write-Host "3. Upload public key to keyserver: gpg --keyserver keys.openpgp.org --send-keys $KeyId"
Write-Host "`nNote: GPG signatures do NOT prevent Windows SmartScreen warnings."
Write-Host "For that, you need a Windows Code Signing Certificate." -ForegroundColor Yellow
