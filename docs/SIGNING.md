# Binary Signing Guide for TidyCode

## Overview

This document explains the binary signing options for TidyCode and how to use them.

## Signing Options Comparison

### 1. GPG Signing (Free, Available Now)

**What it provides:**
- ✅ Cryptographic proof of authenticity
- ✅ Tamper detection
- ✅ Free and open-source
- ✅ Good for open-source community trust

**What it does NOT provide:**
- ❌ No Windows SmartScreen bypass
- ❌ No "Verified Publisher" status
- ❌ Still shows "Unknown Publisher" in UAC
- ❌ Users must manually verify

**Best for:** Open-source distributions, technical users, additional verification layer

### 2. Windows Code Signing Certificate (Paid, ~$100-400/year)

**What it provides:**
- ✅ Removes SmartScreen warnings (after reputation)
- ✅ Shows organization name in UAC
- ✅ Automatic Windows validation
- ✅ Professional appearance

**Types:**
- **Standard OV (Organization Validation)**: ~$100-200/year
  - Takes time to build SmartScreen reputation
  - Cheaper option

- **EV (Extended Validation)**: ~$300-400/year
  - Instant SmartScreen trust
  - Requires hardware token
  - Recommended for wide distribution

**Best for:** Commercial distribution, non-technical users, maximum trust

### 3. Hybrid Approach (Recommended)

Use BOTH:
1. **GPG signing** for technical users and verification
2. **Code signing certificate** for general users and SmartScreen

## GPG Signing Setup

### Initial Setup (One-time)

1. **Install GPG** (if not already installed):
   ```powershell
   # Via Chocolatey
   choco install gnupg

   # Or download from https://gnupg.org/download/
   ```

2. **Generate a GPG key** (if you don't have one):
   ```bash
   gpg --full-generate-key
   ```
   - Choose RSA and RSA (default)
   - Key size: 4096 bits
   - Expiration: 2 years (recommended)
   - Real name: Your name or "TidyCode Release"
   - Email: Your email
   - Set a strong passphrase

3. **Get your Key ID**:
   ```bash
   gpg --list-secret-keys --keyid-format LONG
   ```
   The key ID is the 16-character string after `rsa4096/`

4. **Export your public key**:
   ```bash
   gpg --armor --export YOUR_KEY_ID > tidycode-public-key.asc
   ```

5. **Upload to keyserver** (optional but recommended):
   ```bash
   gpg --keyserver keys.openpgp.org --send-keys YOUR_KEY_ID
   ```

### Signing a Release

**Option 1: Using the script**
```powershell
# Set your key ID once
$env:GPG_KEY_ID = "YOUR_KEY_ID_HERE"

# Build and sign all release files automatically
npm run build:desktop
.\scripts\sign-release.ps1 -Auto

# Or sign specific files
.\scripts\sign-release.ps1 -Files path\to\file.msi
```

**Option 2: Manual signing**
```powershell
# Sign the executable
gpg --detach-sign --armor --output TidyCode.exe.asc TidyCode.exe

# Create and sign checksum
Get-FileHash -Algorithm SHA256 TidyCode.exe | Format-List > checksum.txt
gpg --clearsign checksum.txt
```

### What to Include in GitHub Releases

When creating a release, include:
1. `TidyCode.exe` - The executable
2. `TidyCode.exe.asc` - GPG signature
3. `TidyCode.exe.sha256.asc` - Signed checksum
4. `tidycode-public-key.asc` - Your public key
5. `VERIFY.txt` - Verification instructions

### Example Release Notes Template

```markdown
## Installation

Download `TidyCode.exe` and run it directly (portable version).

⚠️ **Windows SmartScreen Warning**: Since this is not code-signed with a
paid certificate, Windows will show a SmartScreen warning. This is normal
for open-source software. Click "More info" → "Run anyway".

## Verification (Optional)

For security-conscious users, verify the binary authenticity:

1. Download GPG signature files (*.asc)
2. Import public key: `gpg --import tidycode-public-key.asc`
3. Verify: `gpg --verify TidyCode.exe.asc TidyCode.exe`

See VERIFY.txt for detailed instructions.
```

## Windows Code Signing (When Ready)

### Recommended Providers

**Standard Code Signing:**
- Sectigo (formerly Comodo): ~$100-150/year
- DigiCert: ~$200/year
- SSL.com: ~$100/year

**EV Code Signing (Recommended for professional use):**
- DigiCert EV: ~$400/year
- SSL.com EV: ~$300/year

### Setup Process

1. **Purchase certificate**
   - Choose OV or EV based on budget
   - Complete identity verification (can take 1-7 days)
   - Receive certificate (PFX file for OV, hardware token for EV)

2. **Configure Tauri**

   Already set up in `tauri.conf.json`:
   ```json
   "windows": {
     "certificateThumbprint": null,  // Will be set automatically
     "digestAlgorithm": "sha256",
     "timestampUrl": "http://timestamp.digicert.com"
   }
   ```

3. **Sign during build**

   For OV certificate (PFX file):
   ```powershell
   # Set environment variables
   $env:TAURI_SIGNING_PRIVATE_KEY = "path\to\certificate.pfx"
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your-password"

   # Build (will auto-sign)
   npm run build:desktop:win:portable
   ```

   For EV certificate (hardware token):
   ```powershell
   # Use the existing script
   npm run build:desktop:win:signed
   ```

4. **Build SmartScreen Reputation**
   - EV certificates get instant trust
   - OV certificates need 3-6 months of downloads to build reputation
   - Keep same certificate across renewals to maintain reputation

## Comparison Summary

| Feature | GPG | OV Code Signing | EV Code Signing |
|---------|-----|-----------------|-----------------|
| Cost | Free | ~$150/year | ~$400/year |
| SmartScreen | ❌ No | ✅ After reputation | ✅ Immediate |
| Setup Time | 5 minutes | 1-3 days | 3-7 days |
| Technical Users | ✅ Good | ✅ Good | ✅ Good |
| General Users | ⚠️ Warnings | ✅ Good | ✅ Excellent |
| Verification | Manual | Automatic | Automatic |

## Recommendations by Distribution Stage

### Early Stage / Open Source Only
- ✅ GPG signing
- ✅ GitHub Releases with checksums
- ✅ Clear documentation about SmartScreen warnings

### Growing User Base (100+ users)
- ✅ GPG signing (keep it)
- ✅ OV Code Signing Certificate
- Start building SmartScreen reputation

### Professional / Commercial
- ✅ GPG signing (keep it)
- ✅ EV Code Signing Certificate
- Immediate trust for new users

## FAQ

**Q: Will GPG signing remove Windows warnings?**
A: No. Only Windows Authenticode certificates remove SmartScreen warnings.

**Q: Can I use a self-signed certificate?**
A: Technically yes, but it won't be trusted by Windows. Users would need to manually trust it (worse than no signing).

**Q: Do I need both GPG and code signing?**
A: No, but GPG adds an extra verification layer for security-conscious users and costs nothing.

**Q: How long to build SmartScreen reputation?**
A: With OV certificate: 3-6 months depending on download volume. With EV: immediate.

**Q: Can I use Let's Encrypt or similar free certificates?**
A: No. Code signing certificates require identity validation and cannot be obtained for free like SSL/TLS certificates.

## Resources

- GPG Windows: https://gnupg.org/download/
- GPG Documentation: https://gnupg.org/documentation/
- Keyserver: https://keys.openpgp.org/
- Sectigo Code Signing: https://sectigo.com/ssl-certificates-tls/code-signing
- DigiCert Code Signing: https://www.digicert.com/signing/code-signing-certificates
- Microsoft SmartScreen: https://learn.microsoft.com/en-us/windows/security/threat-protection/windows-defender-smartscreen/
