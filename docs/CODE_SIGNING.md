# Code Signing Guide for TidyCode

This guide explains how to sign your application installers for Windows, macOS, and Linux to build user trust and ensure secure distribution.

## Table of Contents

### Windows
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Building Signed Installers](#building-signed-installers)
- [Verification](#verification)
- [Timestamping](#timestamping)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)
- [Alternative Code Signing Solutions (Windows)](#alternative-code-signing-solutions-windows-only)
  - [Azure Trusted Signing](#azure-trusted-signing-cheapest-cloud-option)
  - [GPG Signing Analysis](#gpg-signing-analysis)

### macOS
- [macOS Code Signing](#macos-code-signing)
- [Cost and Enrollment](#cost-and-enrollment)
- [Certificate Setup](#certificate-setup)
- [Configuration for Tauri](#configuration-for-tauri)
- [Building and Notarizing](#building-and-notarizing)
- [Verification](#verification-1)

### Linux
- [Linux Code Signing](#linux-code-signing)
- [Distribution Formats and Signing](#distribution-formats-and-signing)
- [GPG Key Setup for Linux](#gpg-key-setup-for-linux)
- [Building Signed Linux Packages](#building-signed-linux-packages)

### General
- [Cross-Platform Signing Summary](#cross-platform-signing-summary)
- [Cost Considerations](#cost-considerations)
- [Recommended Workflow](#recommended-workflow)
- [Links and Resources](#links-and-resources)
- [Support](#support)

---

## Overview (Windows)

Windows SmartScreen and User Account Control (UAC) display warnings for unsigned applications. Code signing with a valid certificate removes these warnings and builds user trust.

## Prerequisites

### 1. Obtain a Code Signing Certificate

#### Commercial Certificate Authorities (Recommended)

Choose one of these trusted CAs:

| Provider | Type | Price/Year | Notes |
|----------|------|------------|-------|
| DigiCert | OV | ~$400-500 | Most trusted, best reputation |
| DigiCert | EV | ~$500-600 | Immediate SmartScreen trust |
| Sectigo | OV | ~$200-300 | Good value |
| SSL.com | OV | ~$200-300 | Affordable |
| SSL.com | EV | ~$350-450 | Affordable EV option |

**Recommendation**: Get an **EV (Extended Validation)** certificate for best results. EV certificates provide immediate Windows SmartScreen reputation.

#### What You'll Need to Purchase:

1. **For OV Certificate**:
   - Business registration documents
   - Valid business email address
   - Phone verification
   - Certificate will be delivered as a `.pfx` or `.p12` file

2. **For EV Certificate**:
   - All OV requirements plus:
   - Hardware token (USB key) - provided by CA
   - Certificate is stored on the token
   - More stringent validation process (2-5 business days)

### 2. Certificate Formats

- **PFX/P12**: Windows certificate format (includes private key)
- **PEM**: Can be converted to PFX if needed
- **Hardware Token**: For EV certificates, the cert stays on the USB device

## Installation

### Installing Your Certificate

#### For PFX/P12 File:

1. **Secure Storage**:
   ```powershell
   # Create a secure location for your certificate
   mkdir C:\CodeSigning
   # Copy your certificate file here
   # DO NOT commit this to git!
   ```

2. **Install to Windows Certificate Store** (Optional but recommended):
   ```powershell
   # Import certificate
   Import-PfxCertificate -FilePath "C:\CodeSigning\your-cert.pfx" `
     -CertStoreLocation Cert:\CurrentUser\My `
     -Password (ConvertTo-SecureString -String "YOUR_PASSWORD" -AsPlainText -Force)
   ```

3. **Verify Installation**:
   ```powershell
   # List certificates
   Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert
   ```

#### For Hardware Token (EV Certificate):

1. Install the driver provided by your CA
2. Insert the USB token
3. Verify it's detected:
   ```powershell
   Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert
   ```

## Configuration

### 1. Environment Variables

Create a `.env.local` file in the project root (DO NOT commit this):

```env
# Code Signing Configuration
TAURI_SIGNING_PRIVATE_KEY_PATH=C:\CodeSigning\your-cert.pfx
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=your_password_here
TAURI_SIGNING_IDENTITY=Your Company Name

# Or for certificate in Windows Store:
# TAURI_SIGNING_IDENTITY=Your Company Name
# (Will auto-detect from certificate store)
```

### 2. Tauri Configuration

The `tauri.conf.json` has been configured to support code signing. Tauri will automatically detect and use your certificate during the build process.

Key configuration in `tauri.conf.json`:
```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

### 3. Certificate Thumbprint (Alternative Method)

If you prefer to specify the certificate by thumbprint:

```powershell
# Get your certificate thumbprint
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Format-List Subject, Thumbprint
```

Add to `tauri.conf.json`:
```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_THUMBPRINT_HERE"
    }
  }
}
```

## Building Signed Installers

### Method 1: Using Build Script (Recommended)

```powershell
# Build signed installer
npm run build:desktop:signed
```

### Method 2: Manual Build

```powershell
# Build with automatic certificate detection
npm run build:desktop:win

# Or specify certificate explicitly
$env:TAURI_SIGNING_PRIVATE_KEY_PATH="C:\CodeSigning\cert.pfx"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your_password"
npm run build:desktop:win
```

### Method 3: Using SignTool Directly

If Tauri doesn't automatically sign, you can sign manually:

```powershell
# Using PFX file
& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign `
  /f "C:\CodeSigning\cert.pfx" `
  /p "your_password" `
  /tr "http://timestamp.digicert.com" `
  /td sha256 `
  /fd sha256 `
  "src-tauri\target\release\bundle\msi\TidyCode_0.2.1_x64_en-US.msi"

# Using certificate from store
& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign `
  /n "Your Company Name" `
  /tr "http://timestamp.digicert.com" `
  /td sha256 `
  /fd sha256 `
  "src-tauri\target\release\bundle\msi\TidyCode_0.2.1_x64_en-US.msi"
```

## Verification

### Verify Signature

```powershell
# Verify the MSI is signed
& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" verify `
  /pa `
  /v `
  "src-tauri\target\release\bundle\msi\TidyCode_0.2.1_x64_en-US.msi"
```

Expected output:
```
Successfully verified: TidyCode_0.2.1_x64_en-US.msi
```

### Check Signature in Windows

Right-click the MSI file → Properties → Digital Signatures tab
- Should show your company name
- Status should be "This digital signature is OK"

## Timestamping

**Critical**: Always use timestamping when signing!

Timestamping ensures your signature remains valid even after your certificate expires.

Recommended timestamp servers:
- DigiCert: `http://timestamp.digicert.com`
- Sectigo: `http://timestamp.sectigo.com`
- GlobalSign: `http://timestamp.globalsign.com`

This is configured in `tauri.conf.json` and the build scripts.

## Security Best Practices

### 1. Protect Your Certificate

```powershell
# Set restrictive permissions on certificate file
icacls C:\CodeSigning\cert.pfx /inheritance:r
icacls C:\CodeSigning\cert.pfx /grant:r "$env:USERNAME:(R)"
```

### 2. Use Environment Variables

Never hardcode passwords in scripts or config files!

### 3. CI/CD Considerations

For GitHub Actions or other CI/CD:

```yaml
# Example GitHub Actions secret configuration
- name: Decode certificate
  run: |
    echo "${{ secrets.WINDOWS_CERTIFICATE }}" | base64 --decode > cert.pfx

- name: Build and sign
  env:
    TAURI_SIGNING_PRIVATE_KEY_PATH: cert.pfx
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.CERT_PASSWORD }}
  run: npm run build:desktop:win

- name: Clean up
  if: always()
  run: Remove-Item cert.pfx -ErrorAction SilentlyContinue
```

### 4. Don't Commit Certificates

Ensure `.gitignore` includes:
```
*.pfx
*.p12
*.pem
.env.local
/CodeSigning/
```

## Troubleshooting

### "Certificate not found" Error

1. Verify certificate is installed:
   ```powershell
   Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert
   ```

2. Check environment variables are set correctly

3. Try using certificate thumbprint instead of file path

### "Invalid password" Error

- Double-check your password
- Ensure no extra spaces in password
- Try escaping special characters

### Signature Appears Invalid

- Verify timestamp server is accessible
- Check your system date/time is correct
- Ensure certificate hasn't expired

### SmartScreen Still Shows Warning (OV Cert)

- This is normal for new OV certificates
- SmartScreen reputation builds over time
- Consider upgrading to EV certificate for immediate trust
- Accumulate downloads to build reputation (typically 5,000+ downloads)

---

# macOS Code Signing

macOS has strict code signing and notarization requirements enforced by **Gatekeeper** to protect users from malicious software.

## Overview

**GPG signatures are NOT used on macOS.** Apple requires its own code signing system with Developer ID certificates and notarization.

### Key Requirements

1. **Code Signing**: All executables must be signed with an Apple Developer ID certificate
2. **Notarization**: All apps must be submitted to Apple for automated security scanning
3. **Hardened Runtime**: Required for notarization (enabled by default in modern tools)

Without both signing and notarization, macOS will block your app from running on user machines (macOS 10.15 Catalina and later).

## Cost and Enrollment

### Apple Developer Program

**Cost**: $99 USD/year (prices vary by region)

**What's Included**:
- Developer ID Application certificate (for apps outside App Store)
- Developer ID Installer certificate (for package installers)
- Unlimited notarizations
- TestFlight, App Store submission, beta testing tools

**Enrollment**:
1. Sign up at [developer.apple.com](https://developer.apple.com/programs/enroll/)
2. Provide Apple ID and payment information
3. Verify identity (individual) or D-U-N-S number (organization)
4. Wait 24-48 hours for approval

**Fee Waivers**: Available for nonprofits, educational institutions, and government entities

## Certificate Setup

### 1. Create Developer ID Certificate

**In Xcode** (easiest):
```bash
# Open Xcode preferences
Xcode → Settings → Accounts → Your Apple ID → Manage Certificates → + → Developer ID Application
```

**Or via Apple Developer portal**:
1. Visit [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates)
2. Create new certificate → Developer ID Application
3. Download and install to Keychain

### 2. Verify Installation

```bash
# List available signing identities
security find-identity -v -p codesigning

# Should show something like:
# "Developer ID Application: Your Name (TEAM_ID)"
```

## Configuration for Tauri

### Environment Variables

Create `.env.local` (DO NOT commit):

```env
# macOS Code Signing
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
APPLE_ID="your-apple-id@example.com"
APPLE_PASSWORD="app-specific-password"
APPLE_TEAM_ID="YOUR_TEAM_ID"
```

**Generate App-Specific Password**:
1. Visit [appleid.apple.com](https://appleid.apple.com)
2. Sign in → App-Specific Passwords → Generate
3. Use this password (NOT your Apple ID password)

### Tauri Configuration

Update `tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
      "entitlements": null,
      "hardenedRuntime": true
    }
  }
}
```

## Building and Notarizing

### Method 1: Automatic (Tauri with Environment Variables)

```bash
# Build and sign automatically
npm run build:desktop

# Tauri will:
# 1. Sign the .app bundle
# 2. Create .dmg installer
# 3. Submit for notarization
# 4. Staple the notarization ticket
```

### Method 2: Manual Signing and Notarization

```bash
# 1. Sign the app bundle
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name" \
  --options runtime \
  --entitlements entitlements.plist \
  "TidyCode.app"

# 2. Create DMG
hdiutil create -volname "TidyCode" -srcfolder "TidyCode.app" -ov -format UDZO "TidyCode.dmg"

# 3. Sign the DMG
codesign --sign "Developer ID Application: Your Name" "TidyCode.dmg"

# 4. Submit for notarization
xcrun notarytool submit "TidyCode.dmg" \
  --apple-id "your-apple-id@example.com" \
  --password "app-specific-password" \
  --team-id "YOUR_TEAM_ID" \
  --wait

# 5. Staple the notarization ticket
xcrun stapler staple "TidyCode.dmg"
```

### Method 3: Using `notarytool` (Recommended CLI)

```bash
# Store credentials (one-time setup)
xcrun notarytool store-credentials "notary-profile" \
  --apple-id "your-apple-id@example.com" \
  --password "app-specific-password" \
  --team-id "YOUR_TEAM_ID"

# Submit for notarization
xcrun notarytool submit "TidyCode.dmg" \
  --keychain-profile "notary-profile" \
  --wait

# Check status
xcrun notarytool info SUBMISSION_ID --keychain-profile "notary-profile"

# Staple the ticket
xcrun stapler staple "TidyCode.dmg"
```

## Verification

### Verify Code Signature

```bash
# Check app signature
codesign --verify --deep --strict --verbose=2 "TidyCode.app"

# Check DMG signature
codesign --verify --verbose=2 "TidyCode.dmg"

# Display signature details
codesign -dv --verbose=4 "TidyCode.app"
```

### Verify Notarization

```bash
# Check if notarization ticket is stapled
xcrun stapler validate "TidyCode.dmg"

# Should output: "The validate action worked!"

# Check Gatekeeper assessment
spctl --assess --verbose=4 --type execute "TidyCode.app"
```

## Important Notes

### Apple Silicon Requirements

Since November 2020, **all executable code on Apple Silicon Macs must be signed**. Unsigned code will not run.

### Deprecated Tools

**Do NOT use**:
- `altool` - Deprecated as of November 1, 2023
- Xcode 13 or earlier for notarization

**Use instead**:
- `notarytool` - Current official tool
- Xcode 14 or later

### Notarization Timeline

- **Typical**: 5-15 minutes for automated security scan
- **Peak times**: Up to 1 hour
- **Failed**: Check logs with `notarytool log SUBMISSION_ID`

## Troubleshooting

### "No identity found" Error

```bash
# List all certificates
security find-identity -v

# If empty, create certificate in Xcode or download from portal
```

### Notarization Fails

```bash
# Get detailed error log
xcrun notarytool log SUBMISSION_ID --keychain-profile "notary-profile"

# Common issues:
# - Missing hardened runtime
# - Unsigned nested binaries
# - Invalid entitlements
# - Unsigned or modified dependencies
```

### Gatekeeper Blocks App

```bash
# User workaround (if they trust your app)
xattr -cr /path/to/TidyCode.app

# Better: Ensure proper signing and notarization
```

---

# Linux Code Signing

Linux code signing is fundamentally different from Windows and macOS. **GPG signatures are the standard and accepted method.**

## Overview

### Key Differences from Windows/macOS

- ✅ **GPG is the primary signing method** (not a workaround)
- ✅ **Free and decentralized** (no certificate authorities)
- ✅ **Package managers verify signatures automatically**
- ✅ **Widely trusted in Linux/open-source communities**
- ✅ **No centralized authority** (Web of Trust model)

Unlike Windows (where GPG is useless) and macOS (where Apple signing is required), **Linux distributions expect and validate GPG signatures natively**.

## Distribution Formats and Signing

### AppImage (Recommended for Tauri)

AppImages can be signed with GPG signatures:

```bash
# Sign AppImage with GPG
appimagetool --sign TidyCode.AppImage

# Or manually
gpg --detach-sign --armor TidyCode.AppImage
# Creates TidyCode.AppImage.sig
```

**User Verification**:
```bash
# Check signature
TidyCode.AppImage --appimage-signature

# Or manually verify
gpg --verify TidyCode.AppImage.sig TidyCode.AppImage
```

### DEB Packages (Debian/Ubuntu)

```bash
# Sign .deb package
dpkg-sig --sign builder TidyCode.deb

# Verify signature
dpkg-sig --verify TidyCode.deb
```

**Repository Signing**:
```bash
# Create GPG-signed repository
apt-ftparchive release . > Release
gpg --armor --detach-sign --sign -o Release.gpg Release
```

### RPM Packages (Fedora/RHEL)

```bash
# Sign RPM
rpm --addsign TidyCode.rpm

# Verify signature
rpm --checksig TidyCode.rpm
```

## GPG Key Setup for Linux

### 1. Generate GPG Key (if not done already)

```bash
# Generate key pair
gpg --full-generate-key

# Choose:
# - Type: RSA and RSA
# - Key size: 4096 bits
# - Expiration: 2-5 years (recommended)
# - Real name: Your name or company
# - Email: Contact email
```

**IMPORTANT**: For Debian/Ubuntu packages in 2026, **do NOT use SHA1**. Debian deprecated SHA1 signatures as of February 1, 2026.

### 2. Configure GPG for Package Signing

```bash
# Edit ~/.gnupg/gpg.conf
echo "personal-digest-preferences SHA512 SHA384 SHA256" >> ~/.gnupg/gpg.conf
echo "cert-digest-algo SHA512" >> ~/.gnupg/gpg.conf
echo "default-preference-list SHA512 SHA384 SHA256 AES256 AES192 AES ZLIB BZIP2 ZIP Uncompressed" >> ~/.gnupg/gpg.conf
```

### 3. Export Public Key

```bash
# Export ASCII-armored public key
gpg --armor --export your-email@example.com > TidyCode-GPG-Key.asc

# Export to keyservers
gpg --send-keys YOUR_KEY_ID --keyserver keyserver.ubuntu.com
gpg --send-keys YOUR_KEY_ID --keyserver keys.openpgp.org
```

### 4. Publish Public Key

**Methods**:
1. **On your website**: Host `TidyCode-GPG-Key.asc` for download
2. **In GitHub releases**: Include with every release
3. **In README**: Provide fingerprint and download link
4. **Public keyservers**: Upload to keyserver.ubuntu.com, keys.openpgp.org

## Tauri Configuration for Linux

Update `tauri.conf.json`:

```json
{
  "bundle": {
    "linux": {
      "appimage": {
        "sign": true,
        "signCommand": "gpg2 --detach-sign --armor"
      }
    }
  }
}
```

**Environment Variable**:
```bash
# Set GPG key for signing
export APPIMAGETOOL_SIGN_KEY="your-key-id"
export APPIMAGETOOL_SIGN_PASSPHRASE="your-gpg-passphrase"
```

## Building Signed Linux Packages

### AppImage with Tauri

```bash
# Build signed AppImage
SIGN=1 npm run build:desktop

# Tauri will automatically sign if configured
```

### Manual AppImage Signing

```bash
# Using appimagetool
appimagetool --sign --sign-key YOUR_KEY_ID TidyCode.AppDir TidyCode.AppImage

# Or sign after building
gpg --detach-sign --armor TidyCode.AppImage
```

### DEB Package

```bash
# Build DEB
cargo tauri build -- --bundles deb

# Sign it
dpkg-sig --sign builder src-tauri/target/release/bundle/deb/tidycode_*.deb
```

## User Instructions for Verification

Include these instructions in your documentation:

```bash
# 1. Download public key
wget https://tidycode.com/TidyCode-GPG-Key.asc

# 2. Import the key
gpg --import TidyCode-GPG-Key.asc

# 3. Verify the key fingerprint (compare with website)
gpg --fingerprint your-email@example.com

# 4. Download app and signature
wget https://tidycode.com/releases/TidyCode.AppImage
wget https://tidycode.com/releases/TidyCode.AppImage.sig

# 5. Verify signature
gpg --verify TidyCode.AppImage.sig TidyCode.AppImage

# Success output:
# gpg: Good signature from "TidyCode <email@example.com>"
```

## Package Manager Integration

### APT Repository (Debian/Ubuntu)

```bash
# Users add your repository
sudo wget -O /etc/apt/trusted.gpg.d/tidycode.asc https://tidycode.com/TidyCode-GPG-Key.asc
echo "deb https://tidycode.com/apt stable main" | sudo tee /etc/apt/sources.list.d/tidycode.list
sudo apt update
sudo apt install tidycode
```

### YUM Repository (Fedora/RHEL)

```bash
# Users add your repository
sudo rpm --import https://tidycode.com/TidyCode-GPG-Key.asc
sudo tee /etc/yum.repos.d/tidycode.repo <<EOF
[tidycode]
name=TidyCode Repository
baseurl=https://tidycode.com/rpm
enabled=1
gpgcheck=1
gpgkey=https://tidycode.com/TidyCode-GPG-Key.asc
EOF
sudo yum install tidycode
```

## Security Best Practices

### Key Management

1. **Strong passphrase**: Use a long, random passphrase for your GPG key
2. **Backup**: Keep encrypted backups of your private key
3. **Revocation certificate**: Generate and store securely
4. **Expiration**: Set key expiration (2-5 years), extend before expiry

```bash
# Generate revocation certificate
gpg --output revoke.asc --gen-revoke your-email@example.com

# Backup private key (store securely!)
gpg --export-secret-keys --armor your-email@example.com > private-key-backup.asc

# Backup public key
gpg --export --armor your-email@example.com > public-key-backup.asc
```

### CI/CD Integration

```bash
# GitHub Actions example
- name: Import GPG key
  run: |
    echo "${{ secrets.GPG_PRIVATE_KEY }}" | gpg --import --batch --passphrase "${{ secrets.GPG_PASSPHRASE }}"

- name: Build and sign
  run: |
    SIGN=1 npm run build:desktop
```

## Important 2026 Update: SHA1 Deprecation

**Debian/Ubuntu**: SHA1 signatures are rejected as of February 1, 2026.

**Action Required**:
- Ensure your GPG key uses SHA256, SHA384, or SHA512
- Check with: `gpg --list-packets yourfile.sig`
- Reconfigure GPG as shown above

## Why GPG Works on Linux

Unlike Windows and macOS, Linux distributions:
- **Expect GPG signatures** as the standard
- **Verify automatically** in package managers
- **Trust Web of Trust** model (decentralized)
- **Don't require paid certificates** from centralized authorities
- **Have built-in GPG verification** in APT, YUM, DNF, etc.

---

# Cross-Platform Signing Summary

## Quick Reference by Platform

| Platform | Signing Method | Cost | Required? | User Trust Mechanism |
|----------|---------------|------|-----------|---------------------|
| **Windows** | Authenticode (CA cert or Azure) | $10/mo or $200-600/yr | Recommended | SmartScreen (reputation-based) |
| **macOS** | Apple Developer ID + Notarization | $99/year | **Required** | Gatekeeper (immediate) |
| **Linux** | GPG signatures | Free | Recommended | Package managers (Web of Trust) |

## Recommended Approach for TidyCode

### Minimum Viable Signing

1. **Windows**: Azure Trusted Signing ($9.99/month)
2. **macOS**: Apple Developer Program ($99/year)
3. **Linux**: GPG signing (free)

**Total Cost**: ~$219/year

### With Supplementary Security

1. **Windows**: Azure Trusted Signing + GPG signatures
2. **macOS**: Apple Developer Program + SHA256 checksums
3. **Linux**: GPG signatures + SHA256 checksums

Provide for each release:
```
releases/
├── TidyCode-0.2.1-x64.msi              # Windows (Authenticode signed)
├── TidyCode-0.2.1-x64.msi.sig          # Windows (GPG signature)
├── TidyCode-0.2.1-x64.dmg              # macOS (signed + notarized)
├── TidyCode-0.2.1-x86_64.AppImage      # Linux (GPG signed)
├── TidyCode-0.2.1-x86_64.AppImage.sig  # Linux (GPG signature)
├── SHA256SUMS                           # All file checksums
├── SHA256SUMS.sig                       # Checksums signature
└── PUBLIC_KEY.asc                       # Your GPG public key
```

---

# Alternative Code Signing Solutions (Windows Only)

### Quick Reference: Choosing Your Code Signing Approach

| Solution | Cost | SmartScreen Trust | Best For | Setup Complexity |
|----------|------|------------------|----------|-----------------|
| **Azure Trusted Signing** | $9.99/mo | ✅ Yes (after reputation) | Budget-conscious, cloud-first | Low |
| **OV Certificate** | $200-500/yr | ✅ Yes (after reputation) | Traditional approach | Medium |
| **EV Certificate** | $350-600/yr | ✅ Yes (after reputation) | Enterprise needs | High |
| **GPG Signatures** | Free | ❌ No | Supplement only, tech users | Low |
| **Self-signed** | Free | ❌ No | Testing only | Low |

**Recommendation for TidyCode**: Start with **Azure Trusted Signing** ($9.99/month) for the best value and ease of management. Add GPG signatures as a free supplementary verification method for technical users.

### Azure Trusted Signing (Cheapest Cloud Option)

**Microsoft Azure Trusted Signing** (formerly Azure Artifact Signing) is now generally available and provides the most affordable legitimate code signing option for Windows applications.

**Pricing:**
- **Basic Tier**: $9.99/month for up to 5,000 signatures with 1 certificate profile
- **Premium Tier**: $99.99/month for up to 100,000 signatures with 10 certificate profiles

**Benefits:**
- Lowest cost option for legitimate Windows code signing
- Cloud-based - no hardware tokens or certificate files to manage
- Eliminates SmartScreen warnings (after reputation builds)
- Fully integrated with Azure DevOps and GitHub Actions
- Automated certificate rotation and management

**Availability:**
- US and Canada-based organizations with 3+ years of verifiable business history
- Individual developers in the US and Canada (as of October 2025)
- Expanding to Europe

**Setup:**
```bash
# Install Azure CLI and sign in
az login

# Sign your installer
az trusted-signing sign -n YourAccountName -e yourEndpoint \
  --file "path/to/TidyCode.msi"
```

**Links:**
- [Azure Trusted Signing Documentation](https://learn.microsoft.com/en-us/azure/trusted-signing/)
- [Azure Trusted Signing Pricing](https://azure.microsoft.com/en-us/pricing/details/trusted-signing/)

### GPG Signing Analysis

**GPG (GNU Privacy Guard)** is often considered as a free alternative to commercial code signing. However, it's important to understand its limitations for Windows applications.

#### What is GPG Signing?

GPG is a general-purpose cryptographic toolkit that can create digital signatures for files. It's widely used in the open-source community for:
- Signing software releases and archives
- Verifying downloaded package integrity
- Git commit signing
- Cryptographic email (PGP)

#### Critical Limitation: No Windows SmartScreen Integration

**GPG signatures do NOT integrate with Windows security systems:**

- ❌ **Does not bypass SmartScreen warnings** - Windows SmartScreen only recognizes Authenticode signatures
- ❌ **Does not bypass UAC prompts** - User Account Control ignores GPG signatures
- ❌ **Not recognized by Windows Defender** - Windows security features don't validate GPG signatures
- ❌ **No installation trust** - Installers will still show "Unknown Publisher" warnings

**Important Evidence**: Even [Gpg4win](https://www.gpg4win.org/package-integrity.html) (GPG's own Windows installer) uses traditional Authenticode code signing certificates for its Windows installer, not GPG signatures. GPG signatures are provided separately as .sig files for manual verification only.

#### How GPG Differs from Authenticode

| Feature | GPG Signatures | Authenticode (Traditional) |
|---------|---------------|---------------------------|
| **Trust Model** | Web of Trust (decentralized) | Certificate Authority (centralized) |
| **Windows Integration** | None | Full integration with SmartScreen, UAC |
| **File Types** | Any file (.sig files) | Windows executables (.exe, .msi, .dll) |
| **Cost** | Free | $200-600/year (or $9.99/month Azure) |
| **Purpose** | Integrity verification | Operating system trust |
| **Verification** | Manual (gpg --verify) | Automatic (Windows Explorer) |
| **User Experience** | Technical users only | All users |

#### When GPG Signing IS Useful

GPG signatures can complement (but not replace) Authenticode signing:

1. **Integrity Verification**: Technical users can verify downloads haven't been tampered with
2. **Supply Chain Security**: Prove the software came from you
3. **Open Source Trust**: Widely accepted in Linux/open-source communities
4. **Additional Security Layer**: Provide dual verification (Authenticode + GPG)
5. **Cross-Platform**: Same signature mechanism works on Windows, Linux, macOS

#### Implementing GPG Signatures (As Supplement)

If you want to provide GPG signatures in addition to Authenticode:

**1. Generate a GPG Key:**
```bash
# Install GPG for Windows (Gpg4win)
choco install gpg4win

# Generate a key pair
gpg --full-generate-key
# Choose RSA and RSA, 4096 bits, key doesn't expire

# Export public key for users
gpg --armor --export your-email@example.com > PUBLIC_KEY.asc
```

**2. Sign Your Installer:**
```bash
# Create detached signature
gpg --detach-sign --armor TidyCode_0.2.1_x64_en-US.msi

# This creates TidyCode_0.2.1_x64_en-US.msi.asc
```

**3. Publish Public Key:**
```bash
# Upload to key servers
gpg --send-keys YOUR_KEY_ID

# Also publish on your website/GitHub repo
```

**4. User Verification (Technical Users):**
```bash
# Import your public key
gpg --import PUBLIC_KEY.asc

# Verify the signature
gpg --verify TidyCode_0.2.1_x64_en-US.msi.asc TidyCode_0.2.1_x64_en-US.msi
```

#### Recommended Distribution Strategy

For best user experience and security:

1. **Required**: Authenticode sign with traditional certificate or Azure Trusted Signing
2. **Optional**: Also provide GPG signatures for technical users
3. **Documentation**: Clearly explain that GPG signatures are for integrity verification only

**Example File Distribution:**
```
releases/
├── TidyCode_0.2.1_x64_en-US.msi           # Authenticode signed
├── TidyCode_0.2.1_x64_en-US.msi.asc       # GPG signature
├── TidyCode_0.2.1_x64_en-US.msi.sha256    # SHA-256 checksum
└── PUBLIC_KEY.asc                          # Your GPG public key
```

#### Important 2024/2025 SmartScreen Policy Change

As of March 2024, Microsoft changed how SmartScreen treats code signing certificates:

- **EV Certificates**: No longer provide instant SmartScreen trust (policy changed)
- **OV Certificates**: Always required reputation building
- **Both types**: Now require organic reputation building through downloads
- **Azure Trusted Signing**: Also requires reputation building

**What This Means:**
- Even with a valid $500/year EV certificate, users may see SmartScreen warnings initially
- Reputation builds as users download and install your application
- Microsoft doesn't publish specific download thresholds
- Typically requires hundreds to thousands of downloads
- Neither GPG nor traditional certificates eliminate warnings instantly anymore

## Cost Considerations

### Cloud-Based (Recommended for Budget)
- **Azure Trusted Signing**: $9.99/month (5,000 signatures)
  - Best value for small to medium software publishers
  - No upfront costs or hardware requirements

### Traditional Certificates
- **OV Certificate**: $200-500/year
- **EV Certificate**: $350-600/year (includes hardware token)

### Annual Renewal
- Same as initial cost
- Renewal process is faster (1-2 days)

### Free Alternatives
- **GPG Signatures**: Free, but doesn't eliminate Windows warnings
- **Self-signed certificates**: Users still see warnings (not recommended)

## Recommended Workflow

1. **Development**: Build unsigned for testing
2. **Internal Testing**: Sign with test certificate
3. **Release**: Sign with production certificate
4. **Distribution**: Upload signed installer to your website/store

## Links and Resources

### Official Documentation

**Cross-Platform**:
- [Tauri Distribution Guide](https://v2.tauri.app/distribute/)

**Windows**:
- [Microsoft SignTool Documentation](https://docs.microsoft.com/en-us/windows/win32/seccrypto/signtool)
- [Tauri Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/)
- [Windows SmartScreen](https://docs.microsoft.com/en-us/windows/security/threat-protection/microsoft-defender-smartscreen/microsoft-defender-smartscreen-overview)
- [Azure Trusted Signing Documentation](https://learn.microsoft.com/en-us/azure/trusted-signing/)

**macOS**:
- [Tauri macOS Code Signing](https://v2.tauri.app/distribute/sign/macos/)
- [Signing Mac Software with Developer ID](https://developer.apple.com/developer-id/)
- [Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Apple Developer Program](https://developer.apple.com/programs/)

**Linux**:
- [Tauri Linux Code Signing](https://v2.tauri.app/distribute/sign/linux/)
- [AppImage Signing Documentation](https://docs.appimage.org/packaging-guide/optional/signatures.html)
- [Debian Package Signing](https://www.debian.org/doc/manuals/securing-debian-manual/deb-pack-sign.en.html)
- [RPM Package Signing](https://access.redhat.com/articles/3359321)

### Certificate Providers (Windows/Traditional)
- [DigiCert Code Signing](https://www.digicert.com/signing/code-signing-certificates)
- [SSL.com Code Signing](https://www.ssl.com/code-signing/)
- [Sectigo Code Signing](https://sectigo.com/ssl-certificates-tls/code-signing)

### GPG Resources
- [GnuPG Official Site](https://gnupg.org/)
- [Gpg4win - GPG for Windows](https://www.gpg4win.org/)
- [GPG Documentation](https://gnupg.org/documentation/)
- [GPG Best Practices](https://riseup.net/en/security/message-security/openpgp/best-practices)
- [How to GPG Sign DEB Packages](https://blog.packagecloud.io/how-to-gpg-sign-and-verify-deb-packages-and-apt-repositories/)

## Support

### Windows Issues
1. Check the Windows troubleshooting section above
2. Verify certificate is valid and not expired
3. For traditional certs: Contact your CA's support team
4. For Azure: Check Azure Trusted Signing documentation
5. Check Tauri's GitHub issues for similar problems

### macOS Issues
1. Verify Apple Developer Program membership is active
2. Check that certificates haven't expired
3. Review notarization logs: `xcrun notarytool log SUBMISSION_ID`
4. Check Apple Developer Forums
5. Check Tauri's GitHub issues for macOS-specific problems

### Linux Issues
1. Verify GPG key configuration and expiration
2. Check SHA1 is not being used (deprecated Feb 2026)
3. Test signature verification manually
4. Check distribution-specific package signing requirements
5. Review AppImage documentation for signing issues

### General Resources
- [Tauri Discord Community](https://discord.gg/tauri)
- [Tauri GitHub Discussions](https://github.com/tauri-apps/tauri/discussions)
- [Stack Overflow - Tauri tag](https://stackoverflow.com/questions/tagged/tauri)
