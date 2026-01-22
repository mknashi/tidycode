# WASM Production Build Fix

## Problem
Large files work in development build but not in production build.

## Root Cause
WASM files need to be served with the correct MIME type (`application/wasm`) in production environments.

## Fixes Applied

### 1. Express Server (serve.js)
Added MIME type definition for WASM files:
```javascript
// Set MIME type for WASM files
express.static.mime.define({'application/wasm': ['wasm']});
```

### 2. Render.com Deployment (render.yaml)
Added headers configuration:
```yaml
headers:
  - path: /*
    name: Cross-Origin-Embedder-Policy
    value: credentialless
  - path: /*
    name: Cross-Origin-Opener-Policy
    value: same-origin
  - path: /*.wasm
    name: Content-Type
    value: application/wasm
```

The COOP and COEP headers are also important for WASM to work with SharedArrayBuffer if needed in the future.

## Testing

### Local Testing
1. Build the production version:
   ```bash
   npm run build
   ```

2. Test with Express server:
   ```bash
   node serve.js
   # or
   npm start
   ```

3. Open http://localhost:3000 in a browser
4. Try opening a large file (20MB+)
5. Check browser console for WASM loading messages:
   - `[WASM] Loading module...`
   - `[WASM] Initialization successful`
   - `[WASM] Module loaded in XXms`

### Render Deployment Testing
1. Deploy to Render
2. Open the deployed app
3. Try opening a large file
4. Check browser console for WASM initialization

## File Size Thresholds
- ≤10MB: Full features with syntax highlighting
- 10-20MB: Full content, no syntax highlighting
- 20-100MB: Preview mode with WASM indexing (optimized performance)

## WASM Files Location
- Source: `src-wasm/pkg/`
- Built: `dist/assets/file_ops_wasm_bg-*.wasm` (~1.0MB)

## Expected Console Output (Success)
```
[WASM] Loading module...
[WASM] Attempting initialization with undefined (auto-detect)...
[WASM] import.meta.url: http://localhost:3000/assets/[hash].js
[WASM] Initialization successful
[WASM] Module loaded in 45.67ms
```

## Common Issues

### Issue: "Failed to load WASM module"
- Check browser console for MIME type errors
- Verify WASM file exists in `dist/assets/`
- Check network tab - WASM file should be served with `Content-Type: application/wasm`

### Issue: "SharedArrayBuffer is not defined"
- This is okay - SharedArrayBuffer is optional
- WASM will still work without it

### Issue: WASM loads in dev but not prod
- Verify build includes WASM files: `ls dist/assets/*.wasm`
- Check server MIME type configuration
- Verify CORS/COOP/COEP headers if needed
