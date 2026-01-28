# GPG Release Signing Script for TidyCode (PowerShell)
# This script signs release artifacts with GPG signatures for integrity verification

param(
    [switch]$Help,
    [switch]$List,
    [string]$KeyId,
    [string]$Email,
    [string]$ReleasesDir,
    [switch]$Verify,
    [switch]$Auto,
    [switch]$ExportKey,
    [string[]]$Files
)

# Configuration
$script:ProjectRoot = Split-Path -Parent $PSScriptRoot
$script:ReleasesDir = if ($ReleasesDir) { $ReleasesDir } else { Join-Path $ProjectRoot "releases" }
$script:GpgKeyId = if ($KeyId) { $KeyId } else { $env:GPG_KEY_ID }
$script:GpgEmail = if ($Email) { $Email } else { $env:GPG_EMAIL }
$script:GpgCmd = $null

# Color output functions
function Write-Info($message) {
    Write-Host "[INFO] " -ForegroundColor Blue -NoNewline
    Write-Host $message
}

function Write-Success($message) {
    Write-Host "[SUCCESS] " -ForegroundColor Green -NoNewline
    Write-Host $message
}

function Write-Warning($message) {
    Write-Host "[WARNING] " -ForegroundColor Yellow -NoNewline
    Write-Host $message
}

function Write-ErrorMsg($message) {
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $message
}

# Check if GPG is installed
function Test-GpgInstalled {
    # Try gpg2 first, then gpg
    if (Get-Command gpg2 -ErrorAction SilentlyContinue) {
        $script:GpgCmd = "gpg2"
        Write-Success "Found GPG: gpg2"
        return $true
    }
    elseif (Get-Command gpg -ErrorAction SilentlyContinue) {
        $script:GpgCmd = "gpg"
        Write-Success "Found GPG: gpg"
        return $true
    }
    else {
        Write-ErrorMsg "GPG is not installed!"
        Write-Host ""
        Write-Host "Please install GPG for Windows:"
        Write-Host "  choco install gpg4win"
        Write-Host "  or download from: https://www.gpg4win.org/"
        return $false
    }
}

# List available GPG keys
function Get-GpgKeys {
    Write-Info "Available GPG keys:"
    & $script:GpgCmd --list-secret-keys --keyid-format LONG
}

# Get GPG key ID
function Get-GpgKeyId {
    if ($script:GpgKeyId) {
        Write-Info "Using GPG_KEY_ID from parameter/environment: $($script:GpgKeyId)"
        return $script:GpgKeyId
    }

    if ($script:GpgEmail) {
        Write-Info "Looking up key by email: $($script:GpgEmail)"

        $keyOutput = & $script:GpgCmd --list-secret-keys --keyid-format LONG $script:GpgEmail 2>$null
        $keyLine = $keyOutput | Select-String "sec" | Select-Object -First 1

        if ($keyLine) {
            $script:GpgKeyId = ($keyLine -split '\s+')[1] -split '/' | Select-Object -Last 1

            if ($script:GpgKeyId) {
                Write-Success "Found key: $($script:GpgKeyId)"
                return $script:GpgKeyId
            }
        }

        Write-ErrorMsg "No GPG key found for email: $($script:GpgEmail)"
        exit 1
    }

    # Interactive selection
    Write-Warning "No GPG_KEY_ID or GPG_EMAIL set. Please choose a key:"
    Get-GpgKeys
    Write-Host ""

    $script:GpgKeyId = Read-Host "Enter your GPG key ID (long format)"

    if (-not $script:GpgKeyId) {
        Write-ErrorMsg "No key ID provided"
        exit 1
    }

    return $script:GpgKeyId
}

# Verify GPG key configuration
function Test-GpgKeyConfig {
    Write-Info "Verifying GPG key configuration..."

    # Display key info
    Write-Success "GPG key configuration:"
    & $script:GpgCmd --list-keys $script:GpgKeyId | Select-String "pub" -Context 0, 1
}

# Sign a file
function Invoke-SignFile {
    param([string]$FilePath)

    if (-not (Test-Path $FilePath)) {
        Write-ErrorMsg "File not found: $FilePath"
        return $false
    }

    $fileName = Split-Path $FilePath -Leaf
    Write-Info "Signing: $fileName"

    # Create detached ASCII-armored signature
    & $script:GpgCmd --detach-sign --armor --default-key $script:GpgKeyId $FilePath 2>&1 | Out-Null

    $sigFile = "$FilePath.asc"

    if (Test-Path $sigFile) {
        Write-Success "Created signature: $fileName.asc"
        return $true
    }
    else {
        Write-ErrorMsg "Failed to create signature for: $fileName"
        return $false
    }
}

# Verify a signature
function Test-Signature {
    param([string]$FilePath)

    $sigFile = "$FilePath.asc"

    if (-not (Test-Path $sigFile)) {
        $sigFile = "$FilePath.sig"
    }

    if (-not (Test-Path $sigFile)) {
        Write-Warning "No signature file found for: $(Split-Path $FilePath -Leaf)"
        return $false
    }

    $fileName = Split-Path $FilePath -Leaf
    Write-Info "Verifying: $fileName"

    $verifyOutput = & $script:GpgCmd --verify $sigFile $FilePath 2>&1

    if ($verifyOutput -match "Good signature") {
        Write-Success "Signature verified: $fileName"
        return $true
    }
    else {
        Write-ErrorMsg "Signature verification failed: $fileName"
        return $false
    }
}

# Create checksums file
function New-ChecksumsFile {
    param([string[]]$FilesToHash)

    Write-Info "Creating SHA256 checksums..."

    $checksumFile = Join-Path $script:ReleasesDir "SHA256SUMS"

    # Remove old checksums file
    if (Test-Path $checksumFile) {
        Remove-Item $checksumFile
    }

    # Create new checksums
    foreach ($file in $FilesToHash) {
        if (Test-Path $file) {
            $hash = Get-FileHash -Path $file -Algorithm SHA256
            $fileName = Split-Path $file -Leaf
            "$($hash.Hash.ToLower())  $fileName" | Out-File -Append -Encoding ASCII $checksumFile
        }
    }

    if (Test-Path $checksumFile) {
        Write-Success "Created: SHA256SUMS"

        # Sign the checksums file
        Invoke-SignFile -FilePath $checksumFile | Out-Null
        return $true
    }
    else {
        Write-ErrorMsg "Failed to create checksums file"
        return $false
    }
}

# Export public key
function Export-PublicKey {
    $outputFile = Join-Path $script:ReleasesDir "PUBLIC_KEY.asc"

    Write-Info "Exporting public key..."

    & $script:GpgCmd --armor --export $script:GpgKeyId | Out-File -Encoding ASCII $outputFile

    if (Test-Path $outputFile) {
        Write-Success "Exported public key: $outputFile"

        # Display fingerprint
        Write-Info "Key fingerprint:"
        & $script:GpgCmd --fingerprint $script:GpgKeyId
        return $true
    }
    else {
        Write-ErrorMsg "Failed to export public key"
        return $false
    }
}

# Find release files
function Find-ReleaseFiles {
    $files = @()

    # Look in releases directory first
    if (Test-Path $script:ReleasesDir) {
        $files += Get-ChildItem -Path $script:ReleasesDir -File | Where-Object {
            $_.Extension -in @('.msi', '.exe', '.dmg', '.pkg', '.AppImage', '.deb', '.rpm')
        } | Select-Object -ExpandProperty FullName
    }

    # Define all Tauri bundle directories to search (same as upload-to-r2.ps1)
    $bundleDirs = @(
        (Join-Path $script:ProjectRoot "src-tauri\target\release\bundle"),
        (Join-Path $script:ProjectRoot "src-tauri\target\universal-apple-darwin\release\bundle"),
        (Join-Path $script:ProjectRoot "src-tauri\target\x86_64-apple-darwin\release\bundle"),
        (Join-Path $script:ProjectRoot "src-tauri\target\aarch64-apple-darwin\release\bundle"),
        (Join-Path $script:ProjectRoot "src-tauri\target\x86_64-pc-windows-msvc\release\bundle"),
        (Join-Path $script:ProjectRoot "src-tauri\target\aarch64-pc-windows-msvc\release\bundle"),
        (Join-Path $script:ProjectRoot "src-tauri\target\x86_64-unknown-linux-gnu\release\bundle")
    )

    # File patterns to search for (same as upload-to-r2.ps1)
    $filePatterns = @(
        # macOS
        @{ Pattern = "TidyCode_*_universal.dmg"; Subdir = "dmg"; Description = "macOS Universal DMG" },
        @{ Pattern = "TidyCode_*_aarch64.dmg"; Subdir = "dmg"; Description = "macOS ARM64 DMG" },
        @{ Pattern = "TidyCode_*_x64.dmg"; Subdir = "dmg"; Description = "macOS x64 DMG" },
        # Windows MSI
        @{ Pattern = "TidyCode_*_x64_en-US.msi"; Subdir = "msi"; Description = "Windows x64 MSI" },
        @{ Pattern = "TidyCode_*_arm64_en-US.msi"; Subdir = "msi"; Description = "Windows ARM64 MSI" },
        # Windows NSIS
        @{ Pattern = "TidyCode_*_x64-setup.exe"; Subdir = "nsis"; Description = "Windows x64 Installer" },
        @{ Pattern = "TidyCode_*_arm64-setup.exe"; Subdir = "nsis"; Description = "Windows ARM64 Installer" },
        # Linux
        @{ Pattern = "TidyCode_*_amd64.AppImage"; Subdir = "appimage"; Description = "Linux AppImage" },
        @{ Pattern = "tidycode_*_amd64.deb"; Subdir = "deb"; Description = "Linux DEB" },
        @{ Pattern = "tidycode-*.x86_64.rpm"; Subdir = "rpm"; Description = "Linux RPM" }
    )

    # Search each bundle directory
    foreach ($bundleDir in $bundleDirs) {
        if (Test-Path $bundleDir) {
            foreach ($filePattern in $filePatterns) {
                $searchDir = Join-Path $bundleDir $filePattern.Subdir
                if (Test-Path $searchDir) {
                    $foundFiles = Get-ChildItem -Path $searchDir -Filter $filePattern.Pattern -Recurse -ErrorAction SilentlyContinue
                    foreach ($file in $foundFiles) {
                        # Avoid duplicates
                        if ($files -notcontains $file.FullName) {
                            $files += $file.FullName
                        }
                    }
                }
            }

            # Also do a generic search for any installers we might have missed
            $genericPatterns = @("*.msi", "*.exe", "*.dmg", "*.AppImage", "*.deb", "*.rpm")
            foreach ($pattern in $genericPatterns) {
                $foundFiles = Get-ChildItem -Path $bundleDir -Filter $pattern -Recurse -ErrorAction SilentlyContinue
                foreach ($file in $foundFiles) {
                    if ($files -notcontains $file.FullName) {
                        $files += $file.FullName
                    }
                }
            }
        }
    }

    # Remove duplicates and return
    return $files | Select-Object -Unique
}

# Display usage
function Show-Usage {
    Write-Host @"
GPG Release Signing Script for TidyCode (PowerShell)

Usage: .\sign-release.ps1 [OPTIONS] [FILES...]

Options:
    -Help               Show this help message
    -List               List available GPG keys
    -KeyId <KEY_ID>     Specify GPG key ID to use
    -Email <EMAIL>      Specify email to lookup GPG key
    -ReleasesDir <DIR>  Releases directory (default: .\releases)
    -Verify             Verify signatures instead of creating them
    -Auto               Auto-detect and sign all release files
    -ExportKey          Export public key to releases directory
    -Files <FILES>      Specific files to sign

Environment Variables:
    GPG_KEY_ID          GPG key ID to use for signing
    GPG_EMAIL           Email address associated with GPG key

Examples:
    # Sign all release files automatically
    .\sign-release.ps1 -Auto

    # Sign specific files
    .\sign-release.ps1 -Files file1.msi,file2.AppImage

    # Use specific key
    .\sign-release.ps1 -KeyId ABCD1234 -Auto

    # Verify signatures
    .\sign-release.ps1 -Verify -Auto

    # Export public key
    .\sign-release.ps1 -ExportKey

"@
}

# Main function
function Main {
    # Show help
    if ($Help) {
        Show-Usage
        return
    }

    # Check GPG installation
    if (-not (Test-GpgInstalled)) {
        exit 1
    }

    # List keys
    if ($List) {
        Get-GpgKeys
        return
    }

    # Get GPG key ID
    Get-GpgKeyId | Out-Null

    # Verify key configuration
    Test-GpgKeyConfig

    # Create releases directory
    if (-not (Test-Path $script:ReleasesDir)) {
        New-Item -ItemType Directory -Path $script:ReleasesDir | Out-Null
    }

    # Export public key only
    if ($ExportKey) {
        Export-PublicKey
        return
    }

    # Determine files to process
    $filesToProcess = @()

    if ($Auto) {
        Write-Info "Auto-detecting release files..."
        $filesToProcess = Find-ReleaseFiles

        if ($filesToProcess.Count -eq 0) {
            Write-Warning "No release files found!"
            Write-Host "Searched in:"
            Write-Host "  - $script:ReleasesDir"
            Write-Host "  - $(Join-Path $script:ProjectRoot 'src-tauri\target\release\bundle')"
            Write-Host "  - $(Join-Path $script:ProjectRoot 'src-tauri\target\universal-apple-darwin\release\bundle')"
            Write-Host "  - $(Join-Path $script:ProjectRoot 'src-tauri\target\x86_64-apple-darwin\release\bundle')"
            Write-Host "  - $(Join-Path $script:ProjectRoot 'src-tauri\target\aarch64-apple-darwin\release\bundle')"
            Write-Host "  - $(Join-Path $script:ProjectRoot 'src-tauri\target\x86_64-pc-windows-msvc\release\bundle')"
            Write-Host "  - $(Join-Path $script:ProjectRoot 'src-tauri\target\aarch64-pc-windows-msvc\release\bundle')"
            Write-Host "  - $(Join-Path $script:ProjectRoot 'src-tauri\target\x86_64-unknown-linux-gnu\release\bundle')"
            exit 1
        }

        Write-Success "Found $($filesToProcess.Count) file(s) to process"
    }
    elseif ($Files) {
        $filesToProcess = $Files
    }

    # Check if we have files
    if ($filesToProcess.Count -eq 0) {
        Write-ErrorMsg "No files specified!"
        Show-Usage
        exit 1
    }

    # Process files
    if ($Verify) {
        Write-Info "Verifying signatures..."
        $verified = 0
        $failed = 0

        foreach ($file in $filesToProcess) {
            if (Test-Signature -FilePath $file) {
                $verified++
            }
            else {
                $failed++
            }
        }

        Write-Host ""
        Write-Info "Verification complete: $verified verified, $failed failed"

        if ($failed -gt 0) {
            exit 1
        }
    }
    else {
        Write-Info "Signing files..."
        $signed = 0
        $failed = 0

        foreach ($file in $filesToProcess) {
            if (Invoke-SignFile -FilePath $file) {
                $signed++
            }
            else {
                $failed++
            }
        }

        Write-Host ""

        # Create checksums
        New-ChecksumsFile -FilesToHash $filesToProcess | Out-Null

        # Export public key
        Export-PublicKey | Out-Null

        Write-Host ""
        Write-Success "Signing complete: $signed files signed, $failed failed"

        if ($failed -gt 0) {
            exit 1
        }

        # Display summary
        Write-Host ""
        Write-Info "Files in release directory:"
        Get-ChildItem -Path $script:ReleasesDir | Where-Object {
            $_.Extension -in @('.msi', '.exe', '.dmg', '.AppImage', '.deb', '.rpm', '.asc', '.sig') -or
            $_.Name -in @('SHA256SUMS', 'PUBLIC_KEY.asc')
        } | Format-Table Name, Length, LastWriteTime -AutoSize
    }
}

# Run main function
Main
