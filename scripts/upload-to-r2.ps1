# Upload Tidy Code binaries to Cloudflare R2 (Windows PowerShell)
# Usage: .\scripts\upload-to-r2.ps1 [version]
# Example: .\scripts\upload-to-r2.ps1 v0.2.0
#
# If no version is provided, it will automatically read from package.json
# Requires: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables
#
# IMPORTANT: This script ONLY uploads files matching the current version number.
# It will NOT upload or rename old versions. This ensures you always upload
# the correct build artifacts for the version specified in package.json.

# Stop on errors
$ErrorActionPreference = "Stop"

# Configuration
$BUCKET_NAME = "tidycode-releases"

Write-Host "Tidy Code R2 Upload" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host ""

# Check for Account ID
if (-not $env:CLOUDFLARE_ACCOUNT_ID)
{
    Write-Host "Please enter your Cloudflare Account ID:" -ForegroundColor Yellow
    Write-Host "(Find it in: https://dash.cloudflare.com/ -> R2 -> Overview)" -ForegroundColor Gray
    $env:CLOUDFLARE_ACCOUNT_ID = Read-Host

    if (-not $env:CLOUDFLARE_ACCOUNT_ID)
    {
        Write-Host "ERROR: No Account ID provided. Exiting." -ForegroundColor Red
        exit 1
    }
}
else
{
    Write-Host "SUCCESS: Found CLOUDFLARE_ACCOUNT_ID in environment" -ForegroundColor Green
}

# Check if token is already set in environment
if ($env:CLOUDFLARE_API_TOKEN)
{
    Write-Host "SUCCESS: Found CLOUDFLARE_API_TOKEN in environment" -ForegroundColor Green
    $USE_EXISTING_TOKEN = $true
}
else
{
    $USE_EXISTING_TOKEN = $false
    Write-Host "Please enter your Cloudflare API Token:" -ForegroundColor Yellow
    Write-Host "(You can create one at: https://dash.cloudflare.com/profile/api-tokens)" -ForegroundColor Gray
    Write-Host ""

    # Read token securely (hidden input)
    $secureToken = Read-Host -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $env:CLOUDFLARE_API_TOKEN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)

    if (-not $env:CLOUDFLARE_API_TOKEN)
    {
        Write-Host "ERROR: No token provided. Exiting." -ForegroundColor Red
        exit 1
    }
}

# Test authentication
Write-Host ""
Write-Host "Testing Cloudflare authentication..." -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $env:CLOUDFLARE_API_TOKEN"
}

$apiUrl = "https://api.cloudflare.com/client/v4/accounts/$env:CLOUDFLARE_ACCOUNT_ID/r2/buckets"

try
{
    $response = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Get
    if ($response.success)
    {
        Write-Host "SUCCESS: Authentication successful!" -ForegroundColor Green

        # Verify bucket exists
        $bucketExists = $false
        foreach ($bucket in $response.result.buckets)
        {
            if ($bucket.name -eq $BUCKET_NAME)
            {
                $bucketExists = $true
                break
            }
        }

        if (-not $bucketExists)
        {
            Write-Host "WARNING: Bucket '$BUCKET_NAME' not found in your account" -ForegroundColor Yellow
            Write-Host "   Available buckets: $($response.result.buckets.name -join ', ')" -ForegroundColor Gray
            Write-Host ""
            Write-Host "Do you want to create the bucket '$BUCKET_NAME'? (y/n)" -ForegroundColor Yellow
            $createBucket = Read-Host

            if ($createBucket -eq 'y' -or $createBucket -eq 'Y')
            {
                $createUrl = "https://api.cloudflare.com/client/v4/accounts/$env:CLOUDFLARE_ACCOUNT_ID/r2/buckets"
                $createBody = @{
                    name = $BUCKET_NAME
                } | ConvertTo-Json

                $createResponse = Invoke-RestMethod -Uri $createUrl -Headers $headers -Method Post -Body $createBody -ContentType "application/json"
                if ($createResponse.success)
                {
                    Write-Host "SUCCESS: Bucket created successfully!" -ForegroundColor Green
                }
                else
                {
                    Write-Host "ERROR: Failed to create bucket: $($createResponse.errors)" -ForegroundColor Red
                    exit 1
                }
            }
            else
            {
                Write-Host "ERROR: Bucket not found. Exiting." -ForegroundColor Red
                exit 1
            }
        }
    }
    else
    {
        Write-Host "ERROR: Authentication failed: $($response.errors)" -ForegroundColor Red
        exit 1
    }
}
catch
{
    Write-Host "ERROR: Authentication failed. Please check your API token and Account ID." -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

# Auto-detect version from package.json if not provided
if ($args.Count -eq 0)
{
    if (Test-Path "package.json")
    {
        $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
        $VERSION = "v$($packageJson.version)"
        $VERSION_NUMBER = $packageJson.version
        Write-Host "Auto-detected version: $VERSION (from package.json)" -ForegroundColor Cyan
    }
    else
    {
        Write-Host "ERROR: package.json not found. Please run from project root or provide version as argument" -ForegroundColor Red
        exit 1
    }
}
else
{
    $VERSION = $args[0]
    # Extract version number (remove 'v' prefix if present)
    $VERSION_NUMBER = $VERSION -replace '^v', ''
}

Write-Host ""
Write-Host "Uploading Tidy Code $VERSION to Cloudflare R2..." -ForegroundColor Cyan
Write-Host ""

# Define bundle directories to search
$BUNDLE_DIRS = @(
    ".\src-tauri\target\release\bundle",
    ".\src-tauri\target\universal-apple-darwin\release\bundle",
    ".\src-tauri\target\x86_64-apple-darwin\release\bundle",
    ".\src-tauri\target\aarch64-apple-darwin\release\bundle",
    ".\src-tauri\target\x86_64-pc-windows-msvc\release\bundle",
    ".\src-tauri\target\aarch64-pc-windows-msvc\release\bundle",
    ".\src-tauri\target\x86_64-unknown-linux-gnu\release\bundle"
)

# Helper function to upload file to R2
function Upload-To-R2
{
    param (
        [string]$FilePath,
        [string]$ObjectKey
    )

    $uploadUrl = "https://api.cloudflare.com/client/v4/accounts/$env:CLOUDFLARE_ACCOUNT_ID/r2/buckets/$BUCKET_NAME/objects/$ObjectKey"

    $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
    $fileInfo = Get-Item $FilePath

    $uploadHeaders = @{
        "Authorization" = "Bearer $env:CLOUDFLARE_API_TOKEN"
        "Content-Length" = $fileInfo.Length
    }

    try
    {
        $response = Invoke-RestMethod -Uri $uploadUrl -Headers $uploadHeaders -Method Put -Body $fileBytes -ContentType "application/octet-stream"
        return $true
    }
    catch
    {
        Write-Host "   Error: $_" -ForegroundColor Red
        return $false
    }
}

# Helper function to find and upload file
function Upload-If-Exists
{
    param (
        [string]$Pattern,
        [string]$RemoteName,
        [string]$Description
    )

    $foundFiles = @()

    foreach ($dir in $BUNDLE_DIRS)
    {
        if (Test-Path $dir)
        {
            $files = Get-ChildItem -Path $dir -Filter $Pattern -Recurse -ErrorAction SilentlyContinue
            if ($files)
            {
                # Validate that the file matches the current version
                foreach ($f in $files)
                {
                    if ($f.Name -match $VERSION_NUMBER)
                    {
                        $foundFiles += $f
                    }
                }
            }
        }
    }

    if ($foundFiles.Count -eq 0)
    {
        Write-Host "SKIPPED: $Description (not found for version $VERSION_NUMBER)" -ForegroundColor Gray
        return $false
    }

    # Use the most recently modified file if multiple found
    $file = ($foundFiles | Sort-Object LastWriteTime -Descending)[0].FullName

    Write-Host "Uploading $Description..." -ForegroundColor Yellow
    Write-Host "    Local:  $file" -ForegroundColor Gray
    Write-Host "    Remote: $RemoteName" -ForegroundColor Gray

    $success = Upload-To-R2 -FilePath $file -ObjectKey $RemoteName

    if ($success)
    {
        Write-Host "SUCCESS: $Description uploaded" -ForegroundColor Green
    }
    else
    {
        Write-Host "ERROR: Failed to upload $Description" -ForegroundColor Red
    }

    return $success
}

# Track uploaded files
$uploadedFiles = @()

# Upload macOS Universal DMG
if (Upload-If-Exists "TidyCode_*_universal.dmg" "TidyCode-$VERSION-mac-universal.dmg" "macOS Universal") {
    $uploadedFiles += "macOS Universal DMG"
}

# Upload macOS ARM64 (Apple Silicon)
if (Upload-If-Exists "TidyCode_*_aarch64.dmg" "TidyCode-$VERSION-mac-arm64.dmg" "macOS ARM64") {
    $uploadedFiles += "macOS ARM64 DMG"
}

# Upload macOS x64 (Intel)
if (Upload-If-Exists "TidyCode_*_x64.dmg" "TidyCode-$VERSION-mac-x64.dmg" "macOS x64") {
    $uploadedFiles += "macOS x64 DMG"
}

# Upload Windows x64 MSI
if (Upload-If-Exists "TidyCode_*_x64_en-US.msi" "TidyCode-$VERSION-windows-x64.msi" "Windows x64 MSI") {
    $uploadedFiles += "Windows x64 MSI"
}

# Upload Windows x64 NSIS Installer
if (Upload-If-Exists "TidyCode_*_x64-setup.exe" "TidyCode-$VERSION-windows-x64-setup.exe" "Windows x64 Installer") {
    $uploadedFiles += "Windows x64 Setup"
}

# Upload Windows ARM64 MSI
if (Upload-If-Exists "TidyCode_*_arm64_en-US.msi" "TidyCode-$VERSION-windows-arm64.msi" "Windows ARM64 MSI") {
    $uploadedFiles += "Windows ARM64 MSI"
}

# Upload Windows ARM64 NSIS Installer
if (Upload-If-Exists "TidyCode_*_arm64-setup.exe" "TidyCode-$VERSION-windows-arm64-setup.exe" "Windows ARM64 Installer") {
    $uploadedFiles += "Windows ARM64 Setup"
}

# Upload Linux AppImage
if (Upload-If-Exists "TidyCode_*_amd64.AppImage" "TidyCode-$VERSION-linux-x86_64.AppImage" "Linux AppImage") {
    $uploadedFiles += "Linux AppImage"
}

# Upload Linux DEB package
if (Upload-If-Exists "tidycode_*_amd64.deb" "TidyCode-$VERSION-linux-amd64.deb" "Linux DEB") {
    $uploadedFiles += "Linux DEB"
}

# Upload Linux RPM package
if (Upload-If-Exists "tidycode-*.x86_64.rpm" "TidyCode-$VERSION-linux-x86_64.rpm" "Linux RPM") {
    $uploadedFiles += "Linux RPM"
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Upload Summary" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Version: $VERSION" -ForegroundColor White
Write-Host "Uploaded: $($uploadedFiles.Count) file(s)" -ForegroundColor White
Write-Host ""

if ($uploadedFiles.Count -gt 0) {
    Write-Host "Successfully uploaded:" -ForegroundColor Green
    foreach ($file in $uploadedFiles) {
        Write-Host "  [OK] $file" -ForegroundColor Green
    }
    Write-Host ""
    Write-Host "Public URLs (using pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev):" -ForegroundColor Cyan
    Write-Host ""

    # Only show URLs for uploaded files
    if ($uploadedFiles -match "macOS") {
        Write-Host "macOS:" -ForegroundColor Yellow
        if ($uploadedFiles -contains "macOS Universal DMG") {
            Write-Host "  Universal DMG:   https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-$VERSION-mac-universal.dmg"
        }
        if ($uploadedFiles -contains "macOS ARM64 DMG") {
            Write-Host "  ARM64 DMG:       https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-$VERSION-mac-arm64.dmg"
        }
        if ($uploadedFiles -contains "macOS x64 DMG") {
            Write-Host "  x64 DMG:         https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-$VERSION-mac-x64.dmg"
        }
        Write-Host ""
    }

    if ($uploadedFiles -match "Windows") {
        Write-Host "Windows:" -ForegroundColor Yellow
        if ($uploadedFiles -contains "Windows x64 MSI") {
            Write-Host "  x64 MSI:         https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-$VERSION-windows-x64.msi"
        }
        if ($uploadedFiles -contains "Windows x64 Setup") {
            Write-Host "  x64 Installer:   https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-$VERSION-windows-x64-setup.exe"
        }
        if ($uploadedFiles -contains "Windows ARM64 MSI") {
            Write-Host "  ARM64 MSI:       https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-$VERSION-windows-arm64.msi"
        }
        if ($uploadedFiles -contains "Windows ARM64 Setup") {
            Write-Host "  ARM64 Installer: https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-$VERSION-windows-arm64-setup.exe"
        }
        Write-Host ""
    }

    if ($uploadedFiles -match "Linux") {
        Write-Host "Linux:" -ForegroundColor Yellow
        if ($uploadedFiles -contains "Linux AppImage") {
            Write-Host "  AppImage:        https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-$VERSION-linux-x86_64.AppImage"
        }
        if ($uploadedFiles -contains "Linux DEB") {
            Write-Host "  DEB Package:     https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-$VERSION-linux-amd64.deb"
        }
        if ($uploadedFiles -contains "Linux RPM") {
            Write-Host "  RPM Package:     https://pub-9e756d8120fc44b6a3b1d665fb099ed7.r2.dev/TidyCode-$VERSION-linux-x86_64.rpm"
        }
        Write-Host ""
    }
} else {
    Write-Host "WARNING: No files were uploaded!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Possible reasons:" -ForegroundColor Gray
    Write-Host "  - No build artifacts found for version $VERSION_NUMBER" -ForegroundColor Gray
    Write-Host "  - Build may not have completed successfully" -ForegroundColor Gray
    Write-Host "  - Wrong version number in package.json" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To build the application first, run:" -ForegroundColor Cyan
    Write-Host "  npm run build:desktop:win" -ForegroundColor White
    Write-Host ""
}

# Offer to save credentials for future use
if (-not $USE_EXISTING_TOKEN)
{
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Gray
    Write-Host ""
    Write-Host "TIP: To avoid entering credentials each time, you can:" -ForegroundColor Cyan
    Write-Host "   1. Set environment variables for current session:" -ForegroundColor Gray
    Write-Host '      $env:CLOUDFLARE_ACCOUNT_ID = "your-account-id"' -ForegroundColor White
    Write-Host '      $env:CLOUDFLARE_API_TOKEN = "your-token-here"' -ForegroundColor White
    Write-Host ""
    Write-Host "   2. Set environment variables permanently (User level):" -ForegroundColor Gray
    Write-Host '      [System.Environment]::SetEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID", "your-account-id", "User")' -ForegroundColor White
    Write-Host '      [System.Environment]::SetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "your-token", "User")' -ForegroundColor White
    Write-Host ""
    Write-Host '   3. Add to PowerShell profile (~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1):' -ForegroundColor Gray
    Write-Host '      $env:CLOUDFLARE_ACCOUNT_ID = "your-account-id"' -ForegroundColor White
    Write-Host '      $env:CLOUDFLARE_API_TOKEN = "your-token-here"' -ForegroundColor White
    Write-Host ""
}
