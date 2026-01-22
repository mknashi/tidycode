# Sign existing TidyCode installer files
# This script signs already-built installer files

param(
    [string]$InstallerPath,
    [string]$CertPath = $env:TAURI_SIGNING_PRIVATE_KEY_PATH,
    [string]$CertPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
    [string]$CertThumbprint = $env:TAURI_SIGNING_THUMBPRINT,
    [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "TidyCode Installer Signing Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Function to find SignTool.exe
function Find-SignTool {
    $sdkPath = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
    if (Test-Path $sdkPath) {
        $found = Get-ChildItem -Path $sdkPath -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue |
                 Where-Object { $_.FullName -like "*\x64\*" } |
                 Select-Object -First 1
        if ($found) {
            return $found.FullName
        }
    }

    throw "SignTool.exe not found. Please install Windows SDK."
}

# Validate inputs
if (-not $InstallerPath) {
    Write-Host "Error: Please provide the installer path using -InstallerPath parameter" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage examples:" -ForegroundColor Yellow
    Write-Host "  .\sign-installer.ps1 -InstallerPath 'src-tauri\target\release\bundle\msi\TidyCode_0.2.1_x64_en-US.msi'" -ForegroundColor Gray
    Write-Host "  .\sign-installer.ps1 -InstallerPath 'installer.msi' -CertPath 'C:\cert.pfx' -CertPassword 'pwd'" -ForegroundColor Gray
    exit 1
}

if (-not (Test-Path $InstallerPath)) {
    Write-Host "Error: Installer file not found: $InstallerPath" -ForegroundColor Red
    exit 1
}

# Find SignTool
Write-Host "Locating SignTool.exe..." -ForegroundColor Cyan
$signTool = Find-SignTool
Write-Host "Found: $signTool" -ForegroundColor Green
Write-Host ""

# Build signtool arguments
$signArgs = @("sign")

# Determine certificate source
if ($CertThumbprint) {
    Write-Host "Using certificate from Windows Store" -ForegroundColor Cyan
    Write-Host "Thumbprint: $CertThumbprint" -ForegroundColor Gray
    $signArgs += @("/sha1", $CertThumbprint, "/sm")
}
elseif ($CertPath -and (Test-Path $CertPath)) {
    Write-Host "Using certificate file: $CertPath" -ForegroundColor Cyan
    $signArgs += @("/f", $CertPath)
    if ($CertPassword) {
        $signArgs += @("/p", $CertPassword)
    }
}
else {
    # Auto-detect from certificate store
    Write-Host "Auto-detecting certificate from Windows Store..." -ForegroundColor Cyan
    $cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Select-Object -First 1
    if ($cert) {
        Write-Host "Found certificate: $($cert.Subject)" -ForegroundColor Green
        $signArgs += @("/sha1", $cert.Thumbprint)
    }
    else {
        Write-Host "Error: No certificate found!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please either:" -ForegroundColor Yellow
        Write-Host "  1. Set environment variable: `$env:TAURI_SIGNING_PRIVATE_KEY_PATH = 'C:\path\to\cert.pfx'" -ForegroundColor Gray
        Write-Host "  2. Use -CertPath parameter" -ForegroundColor Gray
        Write-Host "  3. Install certificate to Windows Certificate Store" -ForegroundColor Gray
        exit 1
    }
}

# Add signing options
$signArgs += @(
    "/tr", $TimestampUrl,
    "/td", "sha256",
    "/fd", "sha256",
    "/v",
    $InstallerPath
)

# Sign the file
Write-Host ""
Write-Host "Signing installer..." -ForegroundColor Yellow
Write-Host "File: $InstallerPath" -ForegroundColor Gray
Write-Host ""

try {
    & $signTool $signArgs

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Successfully signed!" -ForegroundColor Green
        Write-Host ""

        # Verify signature
        Write-Host "Verifying signature..." -ForegroundColor Yellow
        & $signTool verify /pa /v $InstallerPath

        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "======================================" -ForegroundColor Green
            Write-Host "Signature verified successfully!" -ForegroundColor Green
            Write-Host "======================================" -ForegroundColor Green
        }
        else {
            Write-Host "Warning: Signature verification failed" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host ""
        Write-Host "Error: Signing failed (Exit code: $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
