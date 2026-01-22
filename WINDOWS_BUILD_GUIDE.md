# Windows Build Guide

## Prerequisites

Before building TidyCode on Windows, ensure you have:

1. **Node.js** (v18 or later) - [Download](https://nodejs.org/)
2. **Rust** (latest stable) - [Download](https://rustup.rs/)
3. **Visual Studio Build Tools** (for Windows desktop builds)
   - Install "Desktop development with C++" workload
   - Download from [Visual Studio](https://visualstudio.microsoft.com/downloads/)

## Common Build Errors and Solutions

### Error: "Cannot find package 'vite-plugin-static-copy'"

**Full Error Message:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vite-plugin-static-copy'
```

**Root Cause:**
The `node_modules` directory is missing the required dependencies, or they weren't installed after pulling the latest code.

**Solution:**

1. **Clean Install Dependencies**:
   ```powershell
   # Delete node_modules and package-lock.json
   Remove-Item -Recurse -Force node_modules
   Remove-Item -Force package-lock.json

   # Fresh install
   npm install
   ```

2. **Verify Installation**:
   ```powershell
   # Check if vite-plugin-static-copy is installed
   npm list vite-plugin-static-copy
   # Should show: vite-plugin-static-copy@3.1.4

   # Check if pdfjs-dist is installed
   npm list pdfjs-dist
   # Should show: pdfjs-dist@5.4.296
   ```

3. **Try Building Again**:
   ```powershell
   npm run build:desktop:win:arm64
   # Or for x64:
   npm run build:desktop:win:x64
   ```

---

### Error: PDF Worker Version Mismatch

**Full Error Message:**
```
The API version "5.4.296" does not match the Worker version "5.4.449"
```

**Root Cause:**
The `dist` folder contains an old PDF worker file from a previous build with a different version.

**Solution:**

**Option 1: Use the automated clean build script** (Recommended):
```powershell
npm run clean:build:win
```

This script will:
- Delete the dist folder
- Verify dependencies are installed
- Run a full build with WASM
- Verify the PDF worker is correctly installed

**Option 2: Manual cleanup**:

1. **Clean the dist folder**:
   ```powershell
   # Delete dist folder
   Remove-Item -Recurse -Force dist

   # Clean rebuild
   npm run build:full
   ```

2. **Verify worker version matches**:
   ```powershell
   # Check installed pdfjs-dist version
   npm list pdfjs-dist
   # Should show: pdfjs-dist@5.4.296

   # After build, check worker file exists
   dir dist\pdf.worker.min.mjs
   # Should be ~1.0MB
   ```

3. **If error persists**, completely clean and rebuild:
   ```powershell
   # Full clean
   Remove-Item -Recurse -Force node_modules,dist
   npm install
   npm run build:desktop:win:x64
   ```

**Prevention:**
Always run `npm run build:full` instead of just `npm run build` before building the desktop app to ensure the latest PDF worker is copied.

---

### Error: "WASM build failed" or Rust compilation errors

**Solution:**

1. **Update Rust**:
   ```powershell
   rustup update
   ```

2. **Add Windows targets**:
   ```powershell
   # For ARM64
   rustup target add aarch64-pc-windows-msvc

   # For x64
   rustup target add x86_64-pc-windows-msvc
   ```

3. **Force WASM rebuild**:
   ```powershell
   Remove-Item -Recurse -Force src-wasm\pkg
   npm run build:wasm:force
   ```

---

### Error: "beforeBuildCommand failed with exit code 1"

**Root Cause:**
The `npm run build:full` command (which runs before Tauri build) is failing.

**Solution:**

1. **Run build:full separately to see the actual error**:
   ```powershell
   npm run build:full
   ```

2. **Common causes**:
   - Missing dependencies → Run `npm install`
   - WASM not built → Delete `src-wasm/pkg/` and rebuild
   - Node.js version too old → Update to Node.js v18+

---

### Error: "Access denied" or permission errors

**Solution:**

1. **Run PowerShell as Administrator**:
   - Right-click PowerShell → "Run as Administrator"

2. **Disable antivirus temporarily**:
   - Some antivirus software blocks Rust/Tauri builds
   - Add exception for your workspace folder

3. **Check file locks**:
   - Close any programs that might have files open (VSCode, file explorer, etc.)

---

## Build Commands

### Web Build
```powershell
# Development
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### Desktop Build

#### Windows x64 (Intel/AMD 64-bit)
```powershell
npm run build:desktop:win:x64
```

Output: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/TidyCode_0.2.0_x64_en-US.msi`

#### Windows ARM64 (ARM processors)
```powershell
npm run build:desktop:win:arm64
```

Output: `src-tauri/target/aarch64-pc-windows-msvc/release/bundle/msi/TidyCode_0.2.0_arm64_en-US.msi`

#### Build Both
```powershell
npm run build:desktop:win:all
```

---

## Step-by-Step Build Process

### First Time Setup

1. **Clone the repository**:
   ```powershell
   git clone https://github.com/yourusername/tidycode.git
   cd tidycode
   ```

2. **Install dependencies**:
   ```powershell
   npm install
   ```

3. **Build WASM module** (one-time):
   ```powershell
   npm run build:wasm:force
   ```

4. **Verify everything works**:
   ```powershell
   npm run dev
   ```
   Open http://localhost:5173 in your browser

### Building Desktop App

1. **Make sure dependencies are up to date**:
   ```powershell
   npm install
   ```

2. **Build the desktop app**:
   ```powershell
   # For your architecture (x64 or ARM64)
   npm run build:desktop:win:x64
   # OR
   npm run build:desktop:win:arm64
   ```

3. **Install the MSI**:
   - Navigate to `src-tauri/target/[architecture]/release/bundle/msi/`
   - Double-click the `.msi` file to install

---

## Troubleshooting Checklist

If builds are failing, go through this checklist:

- [ ] Node.js version ≥ 18 (`node --version`)
- [ ] npm version ≥ 9 (`npm --version`)
- [ ] Rust installed (`rustc --version`)
- [ ] Windows target added (`rustup target list --installed`)
- [ ] Dependencies installed (`npm install`)
- [ ] `node_modules/vite-plugin-static-copy` exists
- [ ] `node_modules/pdfjs-dist` exists
- [ ] `src-wasm/pkg/` exists (if not, run `npm run build:wasm:force`)
- [ ] No file locks (close VSCode, file explorer, etc.)
- [ ] Running as Administrator (if permission errors)
- [ ] Antivirus not blocking builds

---

## Build Performance Tips

### Faster Builds

1. **Skip WASM rebuild if already built**:
   ```powershell
   # build:full automatically skips WASM if already built
   npm run build:full
   ```

2. **Use debug build for testing** (faster than release):
   ```powershell
   npm run test:smoke
   ```

3. **Parallel builds** (if building multiple architectures):
   ```powershell
   # Build x64 and ARM64 in parallel (requires 2 terminal windows)
   # Terminal 1:
   npm run build:desktop:win:x64

   # Terminal 2:
   npm run build:desktop:win:arm64
   ```

### Reduce Build Size

- Release builds are optimized and smaller
- Debug builds are larger but faster to compile
- MSI installers are compressed

---

## Environment Variables

### Optional: Configure Tauri

```powershell
# Use specific Rust toolchain
$env:RUSTUP_TOOLCHAIN="stable"

# Verbose output for debugging
$env:RUST_BACKTRACE="1"
$env:TAURI_DEBUG="1"
```

### Optional: Configure npm

```powershell
# Use specific registry (if behind corporate firewall)
npm config set registry https://registry.npmjs.org/

# Increase timeout for slow networks
npm config set fetch-timeout 300000
```

---

## Common File Paths

- **Source code**: `src/`
- **Tauri backend**: `src-tauri/`
- **WASM module**: `src-wasm/`
- **Build output**: `dist/` (web), `src-tauri/target/` (desktop)
- **MSI installers**: `src-tauri/target/[arch]/release/bundle/msi/`

---

## Getting Help

If you're still having issues:

1. **Check the error message carefully** - it usually tells you what's wrong
2. **Search GitHub issues** - someone may have had the same problem
3. **Create a new issue** with:
   - Full error message
   - Output of `node --version`, `npm --version`, `rustc --version`
   - Steps to reproduce
   - Your Windows version

---

## Related Documentation

- [PDF Troubleshooting Guide](PDF_TROUBLESHOOTING.md)
- [Main README](README.md)
- [Changelog](CHANGELOG.md)
- [Tauri Windows Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites#windows)

---

*Last Updated: 2025-12-25*
*TidyCode Version: 0.2.0*
