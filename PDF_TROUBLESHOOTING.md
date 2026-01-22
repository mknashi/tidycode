# PDF Viewer Troubleshooting Guide

## Issue: PDF Pages Not Loading in Desktop App

### Problem
When opening PDF files in the installed desktop application (DMG/AppImage/MSI), pages don't load and only show a loading spinner or error message.

### Root Cause
The PDF.js worker was configured to use a CDN URL which doesn't work in offline desktop applications.

### Solution Applied
Updated `/src/utils/pdfConfig.js` to use locally bundled worker files instead of CDN.

---

## Configuration Details

### Worker File Location
The PDF.js worker is now loaded from the local application bundle:
```
/pdf.worker.min.mjs
```

This file is automatically copied during build by `vite-plugin-static-copy`.

### CMap Files Location
Character mapping files for international PDF support:
```
/cmaps/
```

Contains 170+ bcmap files for various character encodings (Chinese, Japanese, Korean, etc.).

---

## Verification Steps

### 1. Check Build Output
After running `npm run build`, verify these files exist:

```bash
# Check worker file
ls -lh dist/pdf.worker.min.mjs

# Check cmaps directory
ls dist/cmaps/ | wc -l  # Should show ~170 files
```

### 2. Check Browser Console (Development)
When running the app, check the console for these log messages:

```
[PDF Config] Worker configured with version: 5.4.449
[PDF Config] Worker URL: http://localhost:5173/pdf.worker.min.mjs
[PDF Config] CMap URL: http://localhost:5173/cmaps/
[PDF Config] Base path: http://localhost:5173
[PDF Config] Is Tauri: true/false
```

### 3. Check Network Requests
In browser DevTools → Network tab:
- `pdf.worker.min.mjs` should load from local origin (not unpkg.com)
- CMap files should load from `/cmaps/` (not unpkg.com)
- Status should be `200 OK` for all PDF assets

---

## Common Issues & Solutions

### Issue 1: Worker Not Loading
**Symptoms**: Console error "Failed to load worker"

**Solutions**:
1. Clear browser cache: `Cmd+Shift+R` (Mac) or `Ctrl+F5` (Windows)
2. Rebuild the app: `npm run build:full`
3. Check if `dist/pdf.worker.min.mjs` exists (1.0MB file)

### Issue 2: "PDF.js Worker Not Found"
**Symptoms**: Error message about missing worker

**Solutions**:
1. Verify Vite config has `vite-plugin-static-copy` properly configured
2. Check `vite.config.js` includes:
   ```javascript
   viteStaticCopy({
     targets: [
       {
         src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
         dest: ''
       },
       {
         src: 'node_modules/pdfjs-dist/cmaps/*',
         dest: 'cmaps'
       }
     ]
   })
   ```

### Issue 3: API/Worker Version Mismatch
**Symptoms**: Error message like "The API version '5.4.296' does not match the Worker version '5.4.449'"

**Root Cause**: The `dist` folder contains an old PDF worker file from a previous build with a different version. This commonly happens when:
1. You pulled latest code that updated dependencies
2. You had previously built the app with an older version
3. The `dist` folder wasn't cleaned before rebuilding

**Solution**:
The project uses `pdfjs-dist` (v5.4.296) as a direct dependency to ensure compatibility across all platforms (macOS, Windows, Linux). This version matches the one used internally by `react-pdf` (v10.2.0).

**Fix the error**:
1. **Delete the dist folder**:
   ```bash
   # macOS/Linux
   rm -rf dist

   # Windows
   Remove-Item -Recurse -Force dist
   ```

2. **Rebuild completely**:
   ```bash
   npm run build:full
   ```

3. **Then build desktop app**:
   ```bash
   # macOS
   npm run build:desktop

   # Windows x64
   npm run build:desktop:win:x64

   # Windows ARM64
   npm run build:desktop:win:arm64
   ```

Configuration in `src/utils/pdfConfig.js`:
```javascript
const workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
```

The worker file is copied from the root `node_modules/pdfjs-dist` by `vite-plugin-static-copy`:
```javascript
// vite.config.js
viteStaticCopy({
  targets: [
    {
      src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      dest: ''
    },
    {
      src: 'node_modules/pdfjs-dist/cmaps/*',
      dest: 'cmaps'
    }
  ]
})
```

**If error persists**:
1. Verify pdfjs-dist is installed as a direct dependency:
   ```bash
   npm list pdfjs-dist
   # Should show: pdfjs-dist@5.4.296 (direct dependency)
   ```
2. Clear browser cache: `Cmd+Shift+R` (Mac) or `Ctrl+F5` (Windows)
3. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
4. Rebuild: `npm run build:full`

### Issue 4: Character Encoding Errors
**Symptoms**: "Missing CMap file" or garbled text in PDFs

**Solutions**:
1. Verify `dist/cmaps/` directory has 170+ files
2. Check network tab for 404 errors on bcmap files
3. Ensure `PDF_OPTIONS.cMapUrl` points to correct location

### Issue 5: Desktop App Shows Blank PDF
**Symptoms**: PDF loads in web but not in desktop app

**Solutions**:
1. Rebuild desktop app: `npm run tauri build`
2. Check Tauri config `frontendDist` points to `../dist`
3. Verify `window.__TAURI__` is defined in desktop app
4. Check console for path resolution errors

---

## File Structure

```
tidycode/
├── dist/                          # Build output
│   ├── pdf.worker.min.mjs        # 1.0MB worker file
│   ├── cmaps/                     # 170+ CMap files
│   │   ├── 78-EUC-H.bcmap
│   │   ├── Adobe-CNS1-0.bcmap
│   │   └── ...
│   └── assets/
│       └── pdf-viewer-*.js        # PDF viewer chunk (461KB)
│
├── src/
│   ├── utils/
│   │   └── pdfConfig.js          # Worker configuration
│   └── components/
│       └── PDFViewer.jsx         # PDF viewer component
│
├── vite.config.js                # Build configuration
└── src-tauri/
    └── tauri.conf.json           # Desktop app config
```

---

## Testing Checklist

### Web App Testing
- [ ] Open PDF in development mode (`npm run dev`)
- [ ] Check console for worker URL (should be localhost)
- [ ] Verify pages load correctly
- [ ] Test with multi-language PDF (Chinese/Japanese)
- [ ] Open PDF in production build (`npm run preview`)

### Desktop App Testing
- [ ] Build desktop app (`npm run tauri build`)
- [ ] Install and launch desktop app
- [ ] Open PDF file via File → Open
- [ ] Check browser console in DevTools (if accessible)
- [ ] Verify PDF loads without network requests
- [ ] Test offline (disconnect internet)

### Cross-Platform Testing
- [ ] macOS (DMG installer)
- [ ] Windows (MSI installer)
- [ ] Linux (AppImage/DEB)
- [ ] Web browser (Chrome, Firefox, Safari)

---

## Debug Mode

### Enable Detailed Logging
The PDF config already includes comprehensive logging:

```javascript
console.log('[PDF Config] Worker configured with version:', pdfjs.version);
console.log('[PDF Config] Worker URL:', workerSrc);
console.log('[PDF Config] CMap URL:', cMapUrl);
console.log('[PDF Config] Base path:', basePath);
console.log('[PDF Config] Is Tauri:', !!window.__TAURI__);
```

### Additional Debug Info
Check the PDF viewer component logs:

```javascript
[PDF] Creating PDF file object: {...}
[PDF] File starts with PDF signature: true/false
[PDF] Loaded N pages successfully
[PDF] Page dimensions: WIDTHxHEIGHT
```

---

## Performance Considerations

### Worker File Size
- `pdf.worker.min.mjs`: ~1.0MB (minified)
- Loaded once per session
- Runs in separate Web Worker thread
- No impact on main thread performance

### CMap Files
- 170 files totaling ~1.6MB
- Loaded on-demand for specific PDFs
- Only required for international character sets
- Cached after first load

### Optimization Tips
1. **Lazy Loading**: PDF viewer chunk (461KB) loads only when needed
2. **Code Splitting**: Separate bundle prevents blocking main app load
3. **Worker Threading**: PDF rendering doesn't block UI
4. **Page Virtualization**: Only renders visible pages (see continuous mode)

---

## Advanced Configuration

### Custom Worker Path
If you need to customize the worker location:

```javascript
// src/utils/pdfConfig.js
const workerSrc = `${window.location.origin}/custom/path/pdf.worker.min.mjs`;
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
```

### Custom CMap Location
To use a different CMap directory:

```javascript
// src/utils/pdfConfig.js
export const PDF_OPTIONS = {
  cMapUrl: `${window.location.origin}/custom/cmaps/`,
  cMapPacked: true,
};
```

### Disable CMap Loading (not recommended)
For PDFs without international characters:

```javascript
export const PDF_OPTIONS = {
  cMapUrl: null,
  cMapPacked: false,
};
```

**Warning**: This will cause errors when opening PDFs with CJK characters.

---

## Related Files

- **PDF Config**: `src/utils/pdfConfig.js`
- **PDF Viewer**: `src/components/PDFViewer.jsx`
- **SVG Viewer**: `src/components/SVGViewer.jsx`
- **Vite Config**: `vite.config.js`
- **Tauri Config**: `src-tauri/tauri.conf.json`
- **Licensing**: `LICENSES.md`

---

## Support & Resources

### PDF.js Documentation
- Official Docs: https://mozilla.github.io/pdf.js/
- GitHub: https://github.com/mozilla/pdf.js
- API Reference: https://mozilla.github.io/pdf.js/api/

### react-pdf Documentation
- Official Docs: https://github.com/wojtekmaj/react-pdf
- Examples: https://github.com/wojtekmaj/react-pdf/tree/main/sample

### Tauri Documentation
- Asset Handling: https://tauri.app/v1/guides/building/
- Configuration: https://tauri.app/v1/api/config/

---

## Known Limitations

1. **Password-Protected PDFs**: Not currently supported (shows error)
2. **PDF Forms**: Read-only, cannot fill or submit
3. **Annotations**: Display-only, cannot edit
4. **Digital Signatures**: Not verified
5. **3D Content**: Not supported
6. **Embedded Media**: Not supported

---

## Future Enhancements

Planned features:
- [ ] PDF text search
- [ ] PDF annotations
- [ ] Form filling support
- [ ] Print functionality
- [ ] Text selection and copy
- [ ] Page rotation
- [ ] Bookmarks support
- [ ] Password-protected PDF support

---

*Last Updated: 2025-12-25*
*PDF.js Version: 5.4.449*
*react-pdf Version: 10.2.0*
