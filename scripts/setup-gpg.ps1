# GPG Setup Script for TidyCode (PowerShell)
# This script helps you generate and configure a GPG key for code signing

param(
    [switch]$Help
)

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

# Display banner
function Show-Banner {
    Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              TidyCode GPG Key Setup Wizard                   ║
║                                                              ║
║  This wizard will help you create and configure a GPG key   ║
║  for signing your TidyCode releases.                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

"@
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
        Write-Host "Installation instructions:"
        Write-Host "  1. Install with Chocolatey (recommended):"
        Write-Host "     choco install gpg4win"
        Write-Host ""
        Write-Host "  2. Or download from:"
        Write-Host "     https://www.gpg4win.org/"
        Write-Host ""
        Write-Host "After installation, restart PowerShell and run this script again."
        return $false
    }
}

# Configure GPG for modern security
function Set-GpgConfiguration {
    Write-Info "Configuring GPG for code signing..."

    $gpgConfPath = Join-Path $env:APPDATA "gnupg\gpg.conf"
    $gnupgDir = Join-Path $env:APPDATA "gnupg"

    # Backup existing config
    if (Test-Path $gpgConfPath) {
        $backupPath = "$gpgConfPath.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        Copy-Item $gpgConfPath $backupPath
        Write-Info "Backed up existing gpg.conf to $backupPath"
    }

    # Ensure .gnupg directory exists
    if (-not (Test-Path $gnupgDir)) {
        New-Item -ItemType Directory -Path $gnupgDir | Out-Null
    }

    # Add modern security settings
    $gpgConfig = @"

# ========================================
# TidyCode Code Signing Configuration
# Added by setup-gpg.ps1
# ========================================

# Use SHA256+ for digest (SHA1 deprecated Feb 2026)
personal-digest-preferences SHA512 SHA384 SHA256
cert-digest-algo SHA512
default-preference-list SHA512 SHA384 SHA256 AES256 AES192 AES ZLIB BZIP2 ZIP Uncompressed

# Stronger algorithms
personal-cipher-preferences AES256 AES192 AES
personal-compress-preferences ZLIB BZIP2 ZIP Uncompressed

# Long key IDs for clarity
keyid-format 0xlong

# Show fingerprints
with-fingerprint

# Require cross-certification on subkeys
require-cross-certification

# Don't use SHA1 for anything
weak-digest SHA1

"@

    Add-Content -Path $gpgConfPath -Value $gpgConfig
    Write-Success "GPG configuration updated"
}

# List available GPG keys
function Get-GpgKeys {
    Write-Info "Available GPG keys:"
    & $script:GpgCmd --list-secret-keys --keyid-format LONG
}

# Generate GPG key
function New-GpgKey {
    Write-Info "Generating new GPG key..."
    Write-Host ""

    # Collect information
    $name = Read-Host "Your name (or company name)"

    if ([string]::IsNullOrWhiteSpace($name)) {
        Write-ErrorMsg "Name is required"
        return $null
    }

    $email = Read-Host "Your email address"

    if ([string]::IsNullOrWhiteSpace($email)) {
        Write-ErrorMsg "Email is required"
        return $null
    }

    $comment = Read-Host "Comment (optional, press Enter to skip)"

    Write-Host ""
    Write-Info "Key expiration recommendation: 2-5 years"
    Write-Warning "You can extend the expiration before it expires"
    $expiration = Read-Host "Key expiration (0 = does not expire, 2y = 2 years) [default: 2y]"

    if ([string]::IsNullOrWhiteSpace($expiration)) {
        $expiration = "2y"
    }

    # Build display info
    $commentDisplay = if ([string]::IsNullOrWhiteSpace($comment)) { "(none)" } else { $comment }

    Write-Host ""
    Write-Info "Creating key with the following details:"
    Write-Host "  Name:       $name"
    Write-Host "  Email:      $email"
    Write-Host "  Comment:    $commentDisplay"
    Write-Host "  Expiration: $expiration"
    Write-Host "  Key size:   4096 bits (RSA)"
    Write-Host ""

    $proceed = Read-Host "Proceed? (y/n)"

    if ($proceed -notmatch '^[Yy]$') {
        Write-Warning "Key generation cancelled"
        return $null
    }

    Write-Host ""
    Write-Info "Generating key... (you may be prompted for a passphrase)"
    Write-Host ""

    # Create key generation batch file - only include Name-Comment if not empty
    $batchFile = [System.IO.Path]::GetTempFileName()

    # Build batch content conditionally
    $batchLines = @(
        "%echo Generating GPG key for TidyCode code signing..."
        "Key-Type: RSA"
        "Key-Length: 4096"
        "Subkey-Type: RSA"
        "Subkey-Length: 4096"
        "Name-Real: $name"
        "Name-Email: $email"
    )

    # Only add comment if provided
    if (-not [string]::IsNullOrWhiteSpace($comment)) {
        $batchLines += "Name-Comment: $comment"
    }

    $batchLines += @(
        "Expire-Date: $expiration"
        "%ask-passphrase"
        "%commit"
        "%echo Key generation complete!"
    )

    $batchContent = $batchLines -join "`n"

    # Write with ASCII encoding (no BOM)
    [System.IO.File]::WriteAllText($batchFile, $batchContent, [System.Text.Encoding]::ASCII)

    # Try batch mode first
    $gpgResult = & $script:GpgCmd --batch --gen-key $batchFile 2>&1
    $gpgExitCode = $LASTEXITCODE

    Remove-Item $batchFile -ErrorAction SilentlyContinue

    # If batch mode failed, try interactive quick generation
    if ($gpgExitCode -ne 0) {
        Write-Warning "Batch key generation had issues. Trying interactive mode..."
        Write-Host ""
        Write-Info "GPG will now prompt you for a passphrase."
        Write-Host ""

        # Build the user ID string
        $userId = if ([string]::IsNullOrWhiteSpace($comment)) {
            "$name <$email>"
        } else {
            "$name ($comment) <$email>"
        }

        # Use quick-generate-key for simpler interactive generation
        & $script:GpgCmd --quick-generate-key $userId rsa4096 sign,cert $expiration

        $gpgExitCode = $LASTEXITCODE

        if ($gpgExitCode -ne 0) {
            Write-ErrorMsg "GPG key generation failed"
            Write-Host ""
            Write-Info "You can try generating a key manually with:"
            Write-Host "  gpg --full-generate-key"
            return $null
        }
    }

    Write-Host ""
    Write-Success "GPG key generated successfully!"

    # Get the key ID - try multiple methods
    Start-Sleep -Seconds 1  # Give GPG a moment to update its keyring

    # Method 1: Search by email
    $keyOutput = & $script:GpgCmd --list-secret-keys --keyid-format LONG $email 2>$null

    if ($keyOutput) {
        # Parse the output to find key ID
        foreach ($line in $keyOutput) {
            if ($line -match 'sec\s+\w+/([A-F0-9]+)') {
                $keyId = $matches[1]
                Write-Success "Your key ID is: $keyId"
                return @{
                    Email = $email
                    KeyId = $keyId
                }
            }
        }
    }

    # Method 2: List all secret keys and find by email in output
    $allKeys = & $script:GpgCmd --list-secret-keys --keyid-format LONG 2>$null
    $foundKey = $false
    $currentKeyId = $null

    foreach ($line in $allKeys) {
        if ($line -match 'sec\s+\w+/([A-F0-9]+)') {
            $currentKeyId = $matches[1]
        }
        if ($line -match [regex]::Escape($email) -and $currentKeyId) {
            Write-Success "Your key ID is: $currentKeyId"
            return @{
                Email = $email
                KeyId = $currentKeyId
            }
        }
    }

    # Method 3: Get the most recently created key
    $recentKey = & $script:GpgCmd --list-secret-keys --keyid-format LONG --with-colons 2>$null |
        Select-String "^sec" |
        Select-Object -First 1

    if ($recentKey -match ':([A-F0-9]{16}):') {
        $keyId = $matches[1]
        Write-Success "Your key ID is: $keyId"
        Write-Warning "Please verify this is the correct key"
        return @{
            Email = $email
            KeyId = $keyId
        }
    }

    Write-ErrorMsg "Failed to retrieve key ID automatically"
    Write-Host ""
    Write-Info "Your key was created. Please run this command to find it:"
    Write-Host "  gpg --list-secret-keys --keyid-format LONG"
    Write-Host ""

    $manualKeyId = Read-Host "Enter your key ID manually (or press Enter to skip)"

    if (-not [string]::IsNullOrWhiteSpace($manualKeyId)) {
        return @{
            Email = $email
            KeyId = $manualKeyId
        }
    }

    return $null
}

# Display key information
function Show-KeyInfo {
    param([string]$Email)

    Write-Host ""
    Write-Info "Your GPG key details:"
    Write-Host ""

    & $script:GpgCmd --list-keys --keyid-format LONG $Email

    Write-Host ""
    Write-Info "Your key fingerprint:"
    & $script:GpgCmd --fingerprint $Email
}

# Export keys
function Export-GpgKeys {
    param([string]$Email)

    $outputDir = Join-Path $HOME "gpg-backup-$(Get-Date -Format 'yyyyMMdd')"

    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir | Out-Null
    }

    Write-Info "Exporting keys to: $outputDir"

    # Export public key
    $publicKeyPath = Join-Path $outputDir "public-key.asc"
    try {
        $publicKey = & $script:GpgCmd --armor --export $Email 2>$null
        if ($publicKey) {
            $publicKey | Out-File -Encoding ASCII $publicKeyPath
            Write-Success "Exported public key: $publicKeyPath"
        } else {
            Write-Warning "Could not export public key"
        }
    } catch {
        Write-Warning "Error exporting public key: $_"
    }

    # Export private key (encrypted) - user will be prompted for passphrase
    $privateKeyPath = Join-Path $outputDir "private-key.asc"
    Write-Info "Exporting private key (you may be prompted for your passphrase)..."
    try {
        $privateKey = & $script:GpgCmd --armor --export-secret-keys $Email 2>$null
        if ($privateKey) {
            $privateKey | Out-File -Encoding ASCII $privateKeyPath
            Write-Success "Exported private key: $privateKeyPath"
        } else {
            Write-Warning "Could not export private key (this is normal if you cancelled the passphrase prompt)"
        }
    } catch {
        Write-Warning "Error exporting private key: $_"
    }

    # Generate revocation certificate
    $revokePath = Join-Path $outputDir "revocation-certificate.asc"
    Write-Info "Generating revocation certificate..."
    Write-Warning "GPG will ask you to confirm - answer 'y' and select reason '0' (No reason specified)"

    try {
        # Use command mode for revocation
        & $script:GpgCmd --output $revokePath --gen-revoke $Email
        if (Test-Path $revokePath) {
            Write-Success "Generated revocation certificate: $revokePath"
        } else {
            Write-Warning "Revocation certificate was not created (you can generate it later)"
        }
    } catch {
        Write-Warning "Error generating revocation certificate: $_"
        Write-Info "You can generate it later with: gpg --gen-revoke $Email"
    }

    Write-Host ""
    Write-Warning "IMPORTANT: Keep these files secure!"
    Write-Host "  - Store private-key.asc in a secure, encrypted location"
    Write-Host "  - Store revocation-certificate.asc separately (in case you need to revoke the key)"
    Write-Host "  - You can share public-key.asc publicly"
    Write-Host ""
    Write-Info "Backup location: $outputDir"

    # Open the backup directory
    $openDir = Read-Host "Open backup directory? (y/n)"
    if ($openDir -match '^[Yy]$') {
        Invoke-Item $outputDir
    }
}

# Upload to keyservers
function Publish-ToKeyservers {
    param([string]$KeyId)

    Write-Host ""
    Write-Info "Uploading public key to keyservers..."

    $keyservers = @(
        "keyserver.ubuntu.com",
        "keys.openpgp.org",
        "pgp.mit.edu"
    )

    foreach ($server in $keyservers) {
        Write-Info "Uploading to $server..."
        $result = & $script:GpgCmd --keyserver $server --send-keys $KeyId 2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Success "Uploaded to $server"
        }
        else {
            Write-Warning "Failed to upload to $server (may need manual verification)"
        }
    }
}

# Create environment file
function New-EnvironmentFile {
    param(
        [string]$Email,
        [string]$KeyId
    )

    $envFile = ".env.local"

    if (Test-Path $envFile) {
        Write-Warning "$envFile already exists. Appending GPG configuration..."
        Add-Content -Path $envFile -Value "`n"
    }

    $envContent = @"
# GPG Code Signing Configuration
# Added by setup-gpg.ps1
GPG_KEY_ID=$KeyId
GPG_EMAIL=$Email
"@

    Add-Content -Path $envFile -Value $envContent
    Write-Success "Added GPG configuration to $envFile"
}

# Display next steps
function Show-NextSteps {
    param(
        [string]$Email,
        [string]$KeyId
    )

    Write-Host @"

╔══════════════════════════════════════════════════════════════╗
║                    Setup Complete! 🎉                        ║
╚══════════════════════════════════════════════════════════════╝

Your GPG key is ready for code signing!

Key Information:
  Email:  $Email
  Key ID: $KeyId

Next Steps:

1. Test your signing setup:
   .\scripts\sign-release.ps1 -Help

2. Sign release files:
   .\scripts\sign-release.ps1 -Auto

3. Share your public key:
   - Publish to your website
   - Include in GitHub releases
   - Add fingerprint to README

4. Configure CI/CD:
   - Export GPG_PRIVATE_KEY secret (base64 encoded)
   - Export GPG_PASSPHRASE secret
   - Use in GitHub Actions/GitLab CI

5. Backup Management:
   - Store private key backup securely (encrypted location)
   - Keep revocation certificate safe
   - Set calendar reminder to extend expiration before it expires

Documentation:
  - See docs/CODE_SIGNING.md for detailed instructions
  - Linux section has complete GPG signing guide

For help:
  .\scripts\sign-release.ps1 -Help

"@
}

# Main menu
function Show-Menu {
    Show-Banner

    # Check GPG installation
    if (-not (Test-GpgInstalled)) {
        exit 1
    }

    Write-Host ""
    Write-Info "What would you like to do?"
    Write-Host ""
    Write-Host "1) Generate a new GPG key for code signing"
    Write-Host "2) Configure existing GPG key"
    Write-Host "3) List existing GPG keys"
    Write-Host "4) Exit"
    Write-Host ""

    $choice = Read-Host "Choose an option (1-4)"

    switch ($choice) {
        "1" {
            Set-GpgConfiguration
            $keyInfo = New-GpgKey

            if ($keyInfo) {
                $email = $keyInfo.Email
                $keyId = $keyInfo.KeyId

                Show-KeyInfo -Email $email

                # Ask about exports
                $exportChoice = Read-Host "`nExport and backup keys? (recommended) (y/n)"
                if ($exportChoice -match '^[Yy]$') {
                    Export-GpgKeys -Email $email
                }

                # Ask about keyserver upload
                $uploadChoice = Read-Host "`nUpload public key to keyservers? (y/n)"
                if ($uploadChoice -match '^[Yy]$') {
                    Publish-ToKeyservers -KeyId $keyId
                }

                # Create env file
                $envChoice = Read-Host "`nAdd to .env.local file? (y/n)"
                if ($envChoice -match '^[Yy]$') {
                    New-EnvironmentFile -Email $email -KeyId $keyId
                }

                Show-NextSteps -Email $email -KeyId $keyId
            }
        }
        "2" {
            Set-GpgConfiguration
            Write-Success "GPG configuration updated!"
            Write-Host ""
            Write-Info "Your existing keys:"
            Get-GpgKeys
        }
        "3" {
            Write-Host ""
            Write-Info "Existing GPG keys:"
            Get-GpgKeys
        }
        "4" {
            Write-Info "Goodbye!"
            exit 0
        }
        default {
            Write-ErrorMsg "Invalid option"
            exit 1
        }
    }
}

# Show help
function Show-Help {
    Write-Host @"
TidyCode GPG Setup Wizard (PowerShell)

This interactive wizard helps you:
  - Generate a 4096-bit RSA GPG key
  - Configure GPG with modern security (SHA256+, avoiding SHA1)
  - Export and backup your keys securely
  - Generate revocation certificate
  - Upload public key to keyservers
  - Create .env.local configuration

Usage:
  .\scripts\setup-gpg.ps1

After setup, use the signing script:
  .\scripts\sign-release.ps1 -Auto

For more information:
  See docs/CODE_SIGNING.md

"@
}

# Main execution
if ($Help) {
    Show-Help
}
else {
    Show-Menu
}
