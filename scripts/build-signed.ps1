# Build and Sign TidyCode Windows Installer
# This script builds the application and signs it with your code signing certificate

param(
    [string]$CertPath = $env:TAURI_SIGNING_PRIVATE_KEY_PATH,
    [string]$CertPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
    [string]$CertThumbprint = $env:TAURI_SIGNING_THUMBPRINT,
    [string]$TimestampUrl = "http://timestamp.digicert.com",
    [switch]$SkipBuild,
    [switch]$SignOnly,
    [string]$Target = "x86_64-pc-windows-msvc"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "TidyCode Signed Build Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Function to find SignTool.exe
function Find-SignTool {
    $possiblePaths = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe",
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.22000.0\x64\signtool.exe",
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe",
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.18362.0\x64\signtool.exe"
    )

    # Try to find any version
    $sdkPath = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
    if (Test-Path $sdkPath) {
        $found = Get-ChildItem -Path $sdkPath -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue |
                 Where-Object { $_.FullName -like "*\x64\*" } |
                 Select-Object -First 1
        if ($found) {
            return $found.FullName
        }
    }

    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            return $path
        }
    }

    throw "SignTool.exe not found. Please install Windows SDK from https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/"
}

# Function to sign a file
function Sign-File {
    param(
        [string]$FilePath,
        [string]$SignToolPath
    )

    if (-not (Test-Path $FilePath)) {
        Write-Host "File not found: $FilePath" -ForegroundColor Red
        return $false
    }

    Write-Host "Signing: $FilePath" -ForegroundColor Yellow

    try {
        # Build signtool arguments based on certificate type
        $signArgs = @("sign")

        # Determine certificate source
        if ($CertThumbprint) {
            Write-Host "Using certificate from Windows Store (Thumbprint: $CertThumbprint)" -ForegroundColor Cyan
            $signArgs += @("/sha1", $CertThumbprint)
            $signArgs += @("/sm")  # Use machine store
        }
        elseif ($CertPath -and (Test-Path $CertPath)) {
            Write-Host "Using certificate file: $CertPath" -ForegroundColor Cyan
            $signArgs += @("/f", $CertPath)
            if ($CertPassword) {
                $signArgs += @("/p", $CertPassword)
            }
        }
        else {
            # Try to auto-detect certificate from store
            $cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Select-Object -First 1
            if ($cert) {
                Write-Host "Auto-detected certificate: $($cert.Subject)" -ForegroundColor Cyan
                $signArgs += @("/sha1", $cert.Thumbprint)
            }
            else {
                Write-Host "No certificate found. Please set TAURI_SIGNING_PRIVATE_KEY_PATH or TAURI_SIGNING_THUMBPRINT" -ForegroundColor Red
                return $false
            }
        }

        # Add timestamp and algorithm options
        $signArgs += @(
            "/tr", $TimestampUrl,
            "/td", "sha256",
            "/fd", "sha256",
            "/v"  # Verbose
        )

        # Add file to sign
        $signArgs += $FilePath

        # Execute signtool
        & $SignToolPath $signArgs

        if ($LASTEXITCODE -eq 0) {
            Write-Host "Successfully signed: $FilePath" -ForegroundColor Green
            return $true
        }
        else {
            Write-Host "Failed to sign: $FilePath (Exit code: $LASTEXITCODE)" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host "Error signing file: $_" -ForegroundColor Red
        return $false
    }
}

# Function to verify signature
function Verify-Signature {
    param(
        [string]$FilePath,
        [string]$SignToolPath
    )

    Write-Host "Verifying signature: $FilePath" -ForegroundColor Yellow

    try {
        & $SignToolPath verify /pa /v $FilePath

        if ($LASTEXITCODE -eq 0) {
            Write-Host "Signature verified successfully!" -ForegroundColor Green
            return $true
        }
        else {
            Write-Host "Signature verification failed!" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host "Error verifying signature: $_" -ForegroundColor Red
        return $false
    }
}

# Main script execution
try {
    # Find SignTool
    Write-Host "Locating SignTool.exe..." -ForegroundColor Cyan
    $signTool = Find-SignTool
    Write-Host "Found SignTool: $signTool" -ForegroundColor Green
    Write-Host ""

    # Build the application if not skipped
    if (-not $SignOnly -and -not $SkipBuild) {
        Write-Host "Building application..." -ForegroundColor Cyan
        Write-Host "Target: $Target" -ForegroundColor Gray
        Write-Host ""

        # Set Tauri environment variables for signing during build
        if ($CertPath) {
            $env:TAURI_SIGNING_PRIVATE_KEY_PATH = $CertPath
        }
        if ($CertPassword) {
            $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $CertPassword
        }
        if ($CertThumbprint) {
            $env:TAURI_SIGNING_THUMBPRINT = $CertThumbprint
        }

        # Run the build
        npm run prepare:lsp
        npm run build:full
        npx tauri build --target $Target

        if ($LASTEXITCODE -ne 0) {
            throw "Build failed with exit code: $LASTEXITCODE"
        }

        Write-Host ""
        Write-Host "Build completed successfully!" -ForegroundColor Green
        Write-Host ""
    }

    # Find the installer files to sign
    $targetArch = if ($Target -like "*x86_64*") { "x64" } else { "arm64" }
    $version = (Get-Content "package.json" | ConvertFrom-Json).version

    $bundlePath = "src-tauri\target\release\bundle"
    $msiPath = "$bundlePath\msi\TidyCode_${version}_${targetArch}_en-US.msi"
    $exePath = "$bundlePath\nsis\TidyCode_${version}_${targetArch}-setup.exe"

    Write-Host "Looking for installers to sign..." -ForegroundColor Cyan

    $signedFiles = @()

    # Sign MSI if it exists
    if (Test-Path $msiPath) {
        Write-Host "Found MSI installer: $msiPath" -ForegroundColor Green
        if (Sign-File -FilePath $msiPath -SignToolPath $signTool) {
            $signedFiles += $msiPath
            Write-Host ""
            Verify-Signature -FilePath $msiPath -SignToolPath $signTool
            Write-Host ""
        }
    }
    else {
        Write-Host "MSI installer not found at: $msiPath" -ForegroundColor Yellow
    }

    # Sign NSIS installer if it exists
    if (Test-Path $exePath) {
        Write-Host "Found NSIS installer: $exePath" -ForegroundColor Green
        if (Sign-File -FilePath $exePath -SignToolPath $signTool) {
            $signedFiles += $exePath
            Write-Host ""
            Verify-Signature -FilePath $exePath -SignToolPath $signTool
            Write-Host ""
        }
    }
    else {
        Write-Host "NSIS installer not found at: $exePath" -ForegroundColor Yellow
    }

    # Summary
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Summary" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan

    if ($signedFiles.Count -gt 0) {
        Write-Host "Successfully signed $($signedFiles.Count) file(s):" -ForegroundColor Green
        foreach ($file in $signedFiles) {
            Write-Host "  - $file" -ForegroundColor Gray
        }
    }
    else {
        Write-Host "No files were signed!" -ForegroundColor Yellow
        Write-Host "Make sure the build completed successfully and check the paths." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "Done!" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Red
    Write-Host "Error occurred!" -ForegroundColor Red
    Write-Host "======================================" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Stack trace:" -ForegroundColor Gray
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    exit 1
}
