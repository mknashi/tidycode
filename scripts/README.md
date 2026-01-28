# Build Scripts

This directory contains utility scripts for building TidyCode across different platforms.

## Available Scripts

### Clean Build Scripts

These scripts ensure a clean build with the correct PDF.js worker version by:
1. Deleting the `dist` folder
2. Verifying dependencies
3. Running a full build (WASM + Vite)
4. Verifying the PDF worker file is correctly installed

#### For Windows

```powershell
npm run clean:build:win
```

Or run directly:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/clean-build-windows.ps1
```

#### For macOS/Linux

```bash
npm run clean:build
```

Or run directly:
```bash
./scripts/clean-build.sh
```

---

## When to Use Clean Build Scripts

Use these scripts when:
- ❌ You get PDF worker version mismatch errors
- ❌ PDF files fail to load in the desktop app
- ❌ You pulled latest code that updated dependencies
- ❌ You switched branches with different PDF.js versions
- ✅ Before building a release version of the desktop app

## Script Details

### clean-build-windows.ps1

**Platform**: Windows (PowerShell)

**What it does**:
1. Removes `dist` folder if it exists
2. Checks if `pdfjs-dist` is installed (runs `npm install` if missing)
3. Runs `npm run build:full` (builds WASM + Vite)
4. Verifies `dist/pdf.worker.min.mjs` exists (~1.0 MB)
5. Verifies CMap files are present (170 files)

**Output**: Displays step-by-step progress with colored console messages

### clean-build.sh

**Platform**: macOS / Linux (Bash)

**What it does**: Same as Windows version, adapted for bash

**Note**: Script must be executable (`chmod +x scripts/clean-build.sh`)

---

## Other Scripts

### build-wasm.js

Manages WASM module compilation with smart caching.

**Features**:
- Checks if WASM is already built and up-to-date
- Skips rebuild if WASM is less than 60 minutes old
- Force rebuild by deleting `src-wasm/pkg/`

**Usage**:
```bash
npm run build:wasm        # Smart rebuild
npm run build:wasm:force  # Force rebuild
```

### prepare-lsp.js

Prepares Language Server Protocol files for the desktop build.

**Usage**:
```bash
npm run prepare:lsp
```

---

## Troubleshooting

### Windows: "Scripts are disabled on this system"

If you see this error when running PowerShell scripts:

```powershell
# Option 1: Run with bypass flag (recommended)
powershell -ExecutionPolicy Bypass -File scripts/clean-build-windows.ps1

# Option 2: Change execution policy (admin required)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### macOS/Linux: "Permission denied"

Make the script executable:

```bash
chmod +x scripts/clean-build.sh
./scripts/clean-build.sh
```

### PDF Worker Still Shows Version Mismatch

1. **Delete node_modules and reinstall**:
   ```bash
   rm -rf node_modules dist
   npm install
   npm run clean:build
   ```

2. **Verify correct version**:
   ```bash
   npm list pdfjs-dist
   # Should show: pdfjs-dist@5.4.296
   ```

3. **Check worker file after build**:
   ```bash
   # Should be ~1.0 MB
   ls -lh dist/pdf.worker.min.mjs
   ```

---

## Complete Build Workflow

### For Desktop App Release

**Windows**:
```powershell
# 1. Clean build
npm run clean:build:win

# 2. Build desktop app
npm run build:desktop:win:x64
# Or for ARM64:
npm run build:desktop:win:arm64
# Or both:
npm run build:desktop:win:all
```

**macOS**:
```bash
# 1. Clean build
npm run clean:build

# 2. Build desktop app
npm run build:desktop:mac
```

**Linux**:
```bash
# 1. Clean build
npm run clean:build

# 2. Build desktop app
npm run build:desktop:linux
```

---

---

## Code Signing Scripts

### GPG Signing for Releases

These scripts help you sign TidyCode releases with GPG signatures for integrity verification across all platforms.

#### setup-gpg.sh / setup-gpg.ps1

**Interactive wizard for generating and configuring GPG keys**

**Bash** (Linux/macOS/WSL/Git Bash):
```bash
bash scripts/setup-gpg.sh
```

**PowerShell** (Windows - recommended):
```powershell
.\scripts\setup-gpg.ps1
```

**Features**:
- Generates 4096-bit RSA GPG key
- Configures GPG to avoid SHA1 (deprecated in Debian Feb 2026)
- Exports public/private keys for backup
- Generates revocation certificate
- Uploads public key to keyservers
- Creates `.env.local` with key configuration

**Note**: If you don't have WSL installed on Windows, use the PowerShell version.

#### sign-release.sh / sign-release.ps1

**Sign release files with GPG signatures**

**Bash** (Linux/macOS/WSL/Git Bash):
```bash
# Auto-detect and sign all release files
bash scripts/sign-release.sh --auto

# Sign specific files
bash scripts/sign-release.sh file1.msi file2.AppImage

# Verify signatures
bash scripts/sign-release.sh --verify --auto
```

**PowerShell** (Windows):
```powershell
# Auto-detect and sign all release files
.\scripts\sign-release.ps1 -Auto

# Sign specific files
.\scripts\sign-release.ps1 -Files file1.msi,file2.AppImage

# Verify signatures
.\scripts\sign-release.ps1 -Verify -Auto
```

**What gets signed**:
- Windows: `.msi`, `.exe` installers
- macOS: `.dmg`, `.pkg` packages
- Linux: `.AppImage`, `.deb`, `.rpm` packages

**Created files**:
- `*.asc` - GPG signature for each file
- `SHA256SUMS` - Checksums for all files
- `SHA256SUMS.asc` - Signature of checksums
- `PUBLIC_KEY.asc` - Your public GPG key

#### Complete Release Workflow

**Windows (PowerShell)**:
```powershell
# 1. Build the app (clean build recommended)
npm run clean:build:win

# 2. Build desktop app
npm run build:desktop

# 3. Sign all release files
.\scripts\sign-release.ps1 -Auto

# 4. Verify signatures
.\scripts\sign-release.ps1 -Verify -Auto

# 5. Distribute from releases/ directory
```

**Linux/macOS (Bash)**:
```bash
# 1. Build the app (clean build recommended)
npm run clean:build

# 2. Build desktop app
npm run build:desktop

# 3. Sign all release files
bash scripts/sign-release.sh --auto

# 4. Verify signatures
bash scripts/sign-release.sh --verify --auto

# 5. Distribute from releases/ directory
```

For detailed GPG signing documentation, see [Code Signing Scripts README](./code-signing-README.md) or [docs/CODE_SIGNING.md](../docs/CODE_SIGNING.md).

---

## See Also

- [WINDOWS_BUILD_GUIDE.md](../WINDOWS_BUILD_GUIDE.md) - Windows-specific build instructions
- [PDF_TROUBLESHOOTING.md](../PDF_TROUBLESHOOTING.md) - PDF viewer troubleshooting
- [CODE_SIGNING.md](../docs/CODE_SIGNING.md) - Complete code signing guide (Windows/macOS/Linux)
- [package.json](../package.json) - All available npm scripts
