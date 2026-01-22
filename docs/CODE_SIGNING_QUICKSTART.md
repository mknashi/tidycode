# Code Signing Quick Start Guide

This is a quick-start guide to get your TidyCode installer signed. For comprehensive details, see [CODE_SIGNING.md](CODE_SIGNING.md).

## Why Code Signing?

Without code signing, Windows shows this warning:
```
⚠️ Windows protected your PC
   Microsoft Defender SmartScreen prevented an unrecognized app from starting.
   Running this app might put your PC at risk.

   Publisher: Unknown Publisher
```

With code signing:
```
✅ Publisher: Your Company Name
   This app has been verified and is safe to install.
```

## Quick Steps

### 1. Get a Certificate (One-time setup)

**Recommended: Buy an EV Certificate** (~$350-600/year)
- Instant Windows SmartScreen trust
- No warnings from day one
- Comes with hardware USB token

**Popular vendors:**
- [SSL.com](https://www.ssl.com/certificates/ev-code-signing/) - ~$350/year
- [DigiCert](https://www.digicert.com/signing/code-signing-certificates) - ~$500/year
- [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing) - ~$400/year

**What you'll need:**
- Business registration documents
- Valid business email
- Phone number
- 2-5 business days for verification

### 2. Install Your Certificate

**For EV Certificate (USB Token):**
1. Insert the USB token
2. Install the driver from your CA
3. Verify installation:
   ```powershell
   Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert
   ```

**For PFX/P12 File:**
1. Save certificate to a secure location (NOT in your project folder)
2. Set environment variables:
   ```powershell
   # Option 1: Set temporarily (current session only)
   $env:TAURI_SIGNING_PRIVATE_KEY_PATH = "C:\path\to\your-cert.pfx"
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your_password"

   # Option 2: Set permanently
   [System.Environment]::SetEnvironmentVariable('TAURI_SIGNING_PRIVATE_KEY_PATH', 'C:\path\to\cert.pfx', 'User')
   [System.Environment]::SetEnvironmentVariable('TAURI_SIGNING_PRIVATE_KEY_PASSWORD', 'your_password', 'User')
   ```

**Or install to Windows Certificate Store:**
```powershell
Import-PfxCertificate -FilePath "C:\path\to\cert.pfx" `
  -CertStoreLocation Cert:\CurrentUser\My `
  -Password (ConvertTo-SecureString -String "your_password" -AsPlainText -Force)
```

### 3. Build Signed Installer

**Method 1: Automatic (Recommended)**
```powershell
# Build and sign in one step
npm run build:desktop:win:signed
```

**Method 2: Sign Existing Installer**
```powershell
# Build first
npm run build:desktop:win

# Then sign
npm run sign:installer -- -InstallerPath "src-tauri\target\release\bundle\msi\TidyCode_0.2.1_x64_en-US.msi"
```

**Method 3: Manual with Certificate Path**
```powershell
.\scripts\sign-installer.ps1 `
  -InstallerPath "path\to\installer.msi" `
  -CertPath "C:\path\to\cert.pfx" `
  -CertPassword "your_password"
```

### 4. Verify Signature

**Check in PowerShell:**
```powershell
# Find SignTool
$signTool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter "signtool.exe" |
            Where-Object { $_.FullName -like "*\x64\*" } |
            Select-Object -First 1

# Verify
& $signTool.FullName verify /pa /v "path\to\installer.msi"
```

**Check in Windows Explorer:**
1. Right-click the `.msi` file
2. Properties → Digital Signatures tab
3. Should show your company name
4. Status: "This digital signature is OK"

## Troubleshooting

### Certificate Not Found
```powershell
# Check if certificate is installed
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert

# If empty, reinstall or set environment variables
```

### "Access Denied" or Permission Errors
```powershell
# Run PowerShell as Administrator
```

### SignTool Not Found
Install Windows SDK:
https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/

### Timestamp Server Unreachable
```powershell
# Try different timestamp servers in scripts/build-signed.ps1:
# - http://timestamp.digicert.com
# - http://timestamp.sectigo.com
# - http://timestamp.globalsign.com
```

### Still Shows "Unknown Publisher"
1. **For OV Certificates**: This is normal! SmartScreen reputation builds over time
   - Needs ~5,000+ downloads to build reputation
   - Can take weeks/months
   - Consider upgrading to EV certificate

2. **For EV Certificates**: Should work immediately
   - Verify certificate is EV type
   - Check certificate is valid and not expired
   - Ensure proper timestamping

## CI/CD Integration (GitHub Actions)

```yaml
name: Build and Sign

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Decode certificate
        run: |
          $cert = [System.Convert]::FromBase64String("${{ secrets.WINDOWS_CERTIFICATE }}")
          [System.IO.File]::WriteAllBytes("cert.pfx", $cert)

      - name: Build and sign
        env:
          TAURI_SIGNING_PRIVATE_KEY_PATH: cert.pfx
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.CERT_PASSWORD }}
        run: npm run build:desktop:win:signed

      - name: Clean up certificate
        if: always()
        run: Remove-Item cert.pfx -ErrorAction SilentlyContinue

      - name: Upload installer
        uses: actions/upload-artifact@v3
        with:
          name: windows-installer
          path: src-tauri/target/release/bundle/msi/*.msi
```

**Set GitHub Secrets:**
1. Go to repository Settings → Secrets and variables → Actions
2. Add secrets:
   - `WINDOWS_CERTIFICATE`: Base64-encoded certificate file
   - `CERT_PASSWORD`: Certificate password

**Encode certificate to base64:**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\cert.pfx"))
```

## Security Checklist

- [ ] Certificate file is NOT in git repository
- [ ] `.gitignore` includes `*.pfx`, `*.p12`, `.env.local`
- [ ] Environment variables are used (not hardcoded passwords)
- [ ] Certificate file has restricted permissions
- [ ] Using timestamping (configured in [tauri.conf.json](../src-tauri/tauri.conf.json))
- [ ] Certificate is backed up securely
- [ ] Calendar reminder set for renewal (30 days before expiry)

## Cost Summary

| Certificate Type | Initial Cost | Annual Renewal | SmartScreen Trust |
|-----------------|--------------|----------------|-------------------|
| OV Standard | $200-500 | Same | Gradual (~months) |
| EV Enhanced | $350-600 | Same | Immediate |

**Recommendation**: Start with EV certificate for immediate trust and better user experience.

## Next Steps

1. **Purchase certificate** from a CA (allow 2-5 business days)
2. **Install certificate** and set environment variables
3. **Test signing** on a development build
4. **Verify signature** shows your company name
5. **Set up CI/CD** for automated signing
6. **Document process** for your team

## Need Help?

- Full documentation: [CODE_SIGNING.md](CODE_SIGNING.md)
- Tauri docs: https://tauri.app/v1/guides/building/windows
- Windows SDK: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
- GitHub issues: https://github.com/your-repo/issues

---

**Important**: Never commit certificates, passwords, or private keys to version control!
