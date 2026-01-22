# Code Signing Guide for TidyCode

This guide explains how to sign your Windows installer to remove the "unknown publisher" warning.

## Overview

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

## Cost Considerations

### One-Time Setup
- **OV Certificate**: $200-500/year
- **EV Certificate**: $350-600/year (includes hardware token)

### Annual Renewal
- Same as initial cost
- Renewal process is faster (1-2 days)

### Free Alternatives (Not Recommended)
- Self-signed certificates (users still see warnings)
- Free CA certificates (not trusted for code signing)

## Recommended Workflow

1. **Development**: Build unsigned for testing
2. **Internal Testing**: Sign with test certificate
3. **Release**: Sign with production certificate
4. **Distribution**: Upload signed installer to your website/store

## Links and Resources

- [Microsoft SignTool Documentation](https://docs.microsoft.com/en-us/windows/win32/seccrypto/signtool)
- [Tauri Code Signing Guide](https://tauri.app/v1/guides/building/windows#code-signing)
- [DigiCert Code Signing](https://www.digicert.com/signing/code-signing-certificates)
- [SSL.com Code Signing](https://www.ssl.com/code-signing/)
- [Windows SmartScreen](https://docs.microsoft.com/en-us/windows/security/threat-protection/microsoft-defender-smartscreen/microsoft-defender-smartscreen-overview)

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify certificate is valid and not expired
3. Contact your CA's support team
4. Check Tauri's GitHub issues for similar problems
