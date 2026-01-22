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

## See Also

- [WINDOWS_BUILD_GUIDE.md](../WINDOWS_BUILD_GUIDE.md) - Windows-specific build instructions
- [PDF_TROUBLESHOOTING.md](../PDF_TROUBLESHOOTING.md) - PDF viewer troubleshooting
- [package.json](../package.json) - All available npm scripts
