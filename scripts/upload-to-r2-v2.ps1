# Upload Tidy Code binaries to Cloudflare R2 (Windows PowerShell)
# Usage: .\scripts\upload-to-r2.ps1 [version]
# Example: .\scripts\upload-to-r2.ps1 v0.2.0
#
# If no version is provided, it will automatically read from package.json
# Requires: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables

# Stop on errors
$ErrorActionPreference = "Stop"

# Configuration
$BUCKET_NAME = "tidycode-releases"

Write-Host "🔐 Tidy Code R2 Upload" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""

# Check for Account ID
if (-not $env:CLOUDFLARE_ACCOUNT_ID) {
    Write-Host "Please enter your Cloudflare Account ID:" -ForegroundColor Yellow
    Write-Host "(Find it in: https://dash.cloudflare.com/ -> R2 -> Overview)" -ForegroundColor Gray
    $env:CLOUDFLARE_ACCOUNT_ID = Read-Host

    if (-not $env:CLOUDFLARE_ACCOUNT_ID) {
        Write-Host "❌ No Account ID provided. Exiting." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✓ Found CLOUDFLARE_ACCOUNT_ID in environment" -ForegroundColor Green
}

# Check if token is already set in environment
if ($env:CLOUDFLARE_API_TOKEN) {
    Write-Host "✓ Found CLOUDFLARE_API_TOKEN in environment" -ForegroundColor Green
    $USE_EXISTING_TOKEN = $true
} else {
    $USE_EXISTING_TOKEN = $false
    Write-Host "Please enter your Cloudflare API Token:" -ForegroundColor Yellow
    Write-Host "(You can create one at: https://dash.cloudflare.com/profile/api-tokens)" -ForegroundColor Gray
    Write-Host ""

    # Read token securely (hidden input)
    $secureToken = Read-Host -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $env:CLOUDFLARE_API_TOKEN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)

    if (-not $env:CLOUDFLARE_API_TOKEN) {
        Write-Host "❌ No token provided. Exiting." -ForegroundColor Red
        exit 1
    }
}

# Test authentication
Write-Host ""
Write-Host "🔍 Testing Cloudflare authentication..." -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $env:CLOUDFLARE_API_TOKEN"
}

$apiUrl = "https://api.cloudflare.com/client/v4/accounts/$env:CLOUDFLARE_ACCOUNT_ID/r2/buckets"

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Get
    if ($response.success) {
        Write-Host "✅ Authentication successful!" -ForegroundColor Green

        # Verify bucket exists
        $bucketExists = $false
        foreach ($bucket in $response.result.buckets) {
            if ($bucket.name -eq $BUCKET_NAME) {
                $bucketExists = $true
                break
            }
        }

        if (-not $bucketExists) {
            Write-Host "⚠️  Warning: Bucket '$BUCKET_NAME' not found in your account" -ForegroundColor Yellow
            Write-Host "   Available buckets: $($response.result.buckets.name -join ', ')" -ForegroundColor Gray
            Write-Host ""
            Write-Host "Do you want to create the bucket '$BUCKET_NAME'? (y/n)" -ForegroundColor Yellow
            $createBucket = Read-Host

            if ($createBucket -eq 'y' -or $createBucket -eq 'Y') {
                $createUrl = "https://api.cloudflare.com/client/v4/accounts/$env:CLOUDFLARE_ACCOUNT_ID/r2/buckets"
                $createBody = @{
                    name = $BUCKET_NAME
                } | ConvertTo-Json

                $createResponse = Invoke-RestMethod -Uri $createUrl -Headers $headers -Method Post -Body $createBody -ContentType "application/json"
                if ($createResponse.success) {
                    Write-Host "✅ Bucket created successfully!" -ForegroundColor Green
                } else {
                    Write-Host "❌ Failed to create bucket: $($createResponse.errors)" -ForegroundColor Red
                    exit 1
                }
            } else {
                Write-Host "❌ Bucket not found. Exiting." -ForegroundColor Red
                exit 1
            }
        }
    } else {
        Write-Host "❌ Authentication failed: $($response.errors)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Authentication failed. Please check your API token and Account ID." -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

# Auto-detect version from package.json if not provided
if ($args.Count -eq 0) {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
        $VERSION = "v$($packageJson.version)"
        Write-Host "📌 Auto-detected version: $VERSION" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Node.js not found. Please provide version as argument or install Node.js" -ForegroundColor Red
        exit 1
    }
} else {
    $VERSION = $args[0]
}

Write-Host ""
Write-Host "📦 Uploading Tidy Code $VERSION to Cloudflare R2..." -ForegroundColor Cyan
Write-Host ""

# Define bundle directories to search
$BUNDLE_DIRS = @(
    ".\src-tauri\target\release\bundle",
    ".\src-tauri\target\universal-apple-darwin\release\bundle",
    ".\src-tauri\target\x86_64-apple-darwin\release\bundle",
    ".\src-tauri\target\aarch64-apple-darwin\release\bundle",
    ".\src-tauri\target\x86_64-pc-windows-msvc\release\bundle",
    ".\src-tauri\target\x86_64-unknown-linux-gnu\release\bundle"
)

# Helper function to upload file to R2
function Upload-To-R2 {
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

    try {
        $response = Invoke-RestMethod -Uri $uploadUrl -Headers $uploadHeaders -Method Put -Body $fileBytes -ContentType "application/octet-stream"
        return $true
    } catch {
        Write-Host "   Error: $_" -ForegroundColor Red
        return $false
    }
}

# Helper function to find and upload file
function Upload-If-Exists {
    param (
        [string]$Pattern,
        [string]$RemoteName,
        [string]$Description
    )

    foreach ($dir in $BUNDLE_DIRS) {
        if (Test-Path $dir) {
            $files = Get-ChildItem -Path $dir -Filter $Pattern -Recurse -ErrorAction SilentlyContinue
            if ($files) {
                $file = $files[0].FullName
                Write-Host "⬆️  Uploading $Description..." -ForegroundColor Yellow
                Write-Host "    File: $file" -ForegroundColor Gray

                $success = Upload-To-R2 -FilePath $file -ObjectKey $RemoteName

                if ($success) {
                    Write-Host "✅ $Description uploaded" -ForegroundColor Green
                } else {
                    Write-Host "❌ Failed to upload $Description" -ForegroundColor Red
                }

                return $success
            }
        }
    }
    return $false
}

# Upload macOS Universal DMG
Upload-If-Exists "TidyCode_*_universal.dmg" "TidyCode-$VERSION-mac-universal.dmg" "macOS Universal" | Out-Null

# Upload macOS ARM64 (Apple Silicon)
Upload-If-Exists "TidyCode_*_aarch64.dmg" "TidyCode-$VERSION-mac-arm64.dmg" "macOS ARM64" | Out-Null

# Upload macOS x64 (Intel)
Upload-If-Exists "TidyCode_*_x64.dmg" "TidyCode-$VERSION-mac-x64.dmg" "macOS x64" | Out-Null

# Upload Windows x64 MSI
Upload-If-Exists "TidyCode_*_x64_en-US.msi" "TidyCode-$VERSION-windows-x64.msi" "Windows x64 MSI" | Out-Null

# Upload Windows x64 NSIS Installer
Upload-If-Exists "TidyCode_*_x64-setup.exe" "TidyCode-$VERSION-windows-x64-setup.exe" "Windows x64 Installer" | Out-Null

# Upload Windows ARM64 MSI
Upload-If-Exists "TidyCode_*_arm64_en-US.msi" "TidyCode-$VERSION-windows-arm64.msi" "Windows ARM64 MSI" | Out-Null

# Upload Windows ARM64 NSIS Installer
Upload-If-Exists "TidyCode_*_arm64-setup.exe" "TidyCode-$VERSION-windows-arm64-setup.exe" "Windows ARM64 Installer" | Out-Null

# Upload Linux AppImage
Upload-If-Exists "TidyCode_*_amd64.AppImage" "TidyCode-$VERSION-linux-x86_64.AppImage" "Linux AppImage" | Out-Null

# Upload Linux DEB package
Upload-If-Exists "tidycode_*_amd64.deb" "TidyCode-$VERSION-linux-amd64.deb" "Linux DEB" | Out-Null

# Upload Linux RPM package
Upload-If-Exists "tidycode-*.x86_64.rpm" "TidyCode-$VERSION-linux-x86_64.rpm" "Linux RPM" | Out-Null

Write-Host ""
Write-Host "🎉 Upload complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Public URLs (using pub-73b0ec13d5ad4a2faf3ee5bacea83252.r2.dev):" -ForegroundColor Cyan
Write-Host ""
Write-Host "macOS:" -ForegroundColor Yellow
Write-Host "  Universal DMG:   https://pub-73b0ec13d5ad4a2faf3ee5bacea83252.r2.dev/TidyCode-$VERSION-mac-universal.dmg"
Write-Host "  ARM64 DMG:       https://pub-73b0ec13d5ad4a2faf3ee5bacea83252.r2.dev/TidyCode-$VERSION-mac-arm64.dmg"
Write-Host "  x64 DMG:         https://pub-73b0ec13d5ad4a2faf3ee5bacea83252.r2.dev/TidyCode-$VERSION-mac-x64.dmg"
Write-Host ""
Write-Host "Windows:" -ForegroundColor Yellow
Write-Host "  x64 MSI:         https://pub-73b0ec13d5ad4a2faf3ee5bacea83252.r2.dev/TidyCode-$VERSION-windows-x64.msi"
Write-Host "  x64 Installer:   https://pub-73b0ec13d5ad4a2faf3ee5bacea83252.r2.dev/TidyCode-$VERSION-windows-x64-setup.exe"
Write-Host "  ARM64 MSI:       https://pub-73b0ec13d5ad4a2faf3ee5bacea83252.r2.dev/TidyCode-$VERSION-windows-arm64.msi"
Write-Host "  ARM64 Installer: https://pub-73b0ec13d5ad4a2faf3ee5bacea83252.r2.dev/TidyCode-$VERSION-windows-arm64-setup.exe"
Write-Host ""
Write-Host "Linux:" -ForegroundColor Yellow
Write-Host "  AppImage:        https://pub-73b0ec13d5ad4a2faf3ee5bacea83252.r2.dev/TidyCode-$VERSION-linux-x86_64.AppImage"
Write-Host "  DEB Package:     https://pub-73b0ec13d5ad4a2faf3ee5bacea83252.r2.dev/TidyCode-$VERSION-linux-amd64.deb"
Write-Host "  RPM Package:     https://pub-73b0ec13d5ad4a2faf3ee5bacea83252.r2.dev/TidyCode-$VERSION-linux-x86_64.rpm"

# Offer to save credentials for future use
if (-not $USE_EXISTING_TOKEN) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host ""
    Write-Host "💡 Tip: To avoid entering credentials each time, you can:" -ForegroundColor Cyan
    Write-Host "   1. Set environment variables for current session:" -ForegroundColor Gray
    Write-Host '      $env:CLOUDFLARE_ACCOUNT_ID = "your-account-id"' -ForegroundColor White
    Write-Host '      $env:CLOUDFLARE_API_TOKEN = "your-token-here"' -ForegroundColor White
    Write-Host ""
    Write-Host "   2. Set environment variables permanently (User level):" -ForegroundColor Gray
    Write-Host '      [System.Environment]::SetEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID", "your-account-id", "User")' -ForegroundColor White
    Write-Host '      [System.Environment]::SetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "your-token", "User")' -ForegroundColor White
    Write-Host ""
    Write-Host "   3. Add to PowerShell profile (~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1):" -ForegroundColor Gray
    Write-Host '      $env:CLOUDFLARE_ACCOUNT_ID = "your-account-id"' -ForegroundColor White
    Write-Host '      $env:CLOUDFLARE_API_TOKEN = "your-token-here"' -ForegroundColor White
    Write-Host ""
}
