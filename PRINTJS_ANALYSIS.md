# Print.js Library Analysis for TidyCode

## Overview

[Print.js](https://printjs.crabbly.com/) is a lightweight JavaScript library designed for printing PDF, HTML, images, and JSON data directly within web applications without leaving the interface.

## Key Features

- **PDF Printing**: Direct printing without download/open
- **HTML Printing**: Selective element printing by ID
- **Image Printing**: Single and batch image printing
- **JSON Printing**: Formatted data table printing
- **Modal Support**: Optional loading indicators
- **Lightweight**: Small footprint (~15KB)

## Installation

```bash
npm install print-js --save
```

```javascript
import printJS from 'print-js'
import 'print-js/dist/print.css'  // Required for modal
```

## Basic Usage for PDF

```javascript
// Simple PDF print
printJS('docs/file.pdf')

// With loading modal
printJS({
  printable: 'docs/file.pdf',
  type: 'pdf',
  showModal: true,
  modalMessage: 'Preparing document...'
})

// From base64 data
printJS({
  printable: base64Data,
  type: 'pdf',
  base64: true
})
```

## Critical Limitation: Same-Origin Policy

⚠️ **MAJOR ISSUE**: Print.js uses an iframe to load PDFs before printing, which means:

> "PDF files must be served from the same domain as your app is hosted under... it is limited by the Same Origin Policy."

### What This Means for TidyCode:

1. **Local File Access**: Cannot directly print PDFs from local file system
2. **Cross-Domain**: Cannot print PDFs from external URLs
3. **Iframe Dependency**: Relies on browser's ability to load PDFs in iframes

## Tauri-Specific Considerations

### Good News: CORS Not an Issue

According to [Tauri CORS discussions](https://github.com/tauri-apps/tauri/discussions/6898), Tauri's WebView **doesn't enforce CORS restrictions** by default:

> "In a Tauri app, the frontend runs in a custom WebView which doesn't enforce the same-origin policy by default"

### How This Helps:

- Can use `data:` URLs for base64 PDFs ✅
- Can use blob URLs ✅
- Can serve from Tauri's custom protocol (`tauri://`) ✅

### Potential Workarounds for Tauri:

#### Option 1: Base64 Encoding (Recommended for Print.js)

```javascript
// Convert PDF fileContent to base64
const base64Data = btoa(
  String.fromCharCode(...new Uint8Array(fileContent))
);

// Print using base64
printJS({
  printable: base64Data,
  type: 'pdf',
  base64: true,
  showModal: true
});
```

**Pros:**
- Works with Print.js
- No file system access needed
- No same-origin issues

**Cons:**
- Synchronous base64 conversion can block UI for large files
- Memory overhead (base64 is ~33% larger)

#### Option 2: Blob URL

```javascript
// Create blob from fileContent
const blob = new Blob([fileContent], { type: 'application/pdf' });
const blobUrl = URL.createObjectURL(blob);

// Print using blob URL
printJS(blobUrl);

// Cleanup
URL.revokeObjectURL(blobUrl);
```

**Pros:**
- Efficient memory usage
- No encoding overhead

**Cons:**
- May still hit same-origin restrictions in some browsers
- Blob URL lifecycle management

#### Option 3: Tauri Asset Protocol

Tauri provides an `asset://` protocol for loading local files:

```javascript
// Use Tauri's convertFileSrc
import { convertFileSrc } from '@tauri-apps/api/core';

const assetUrl = convertFileSrc('/path/to/file.pdf');
printJS(assetUrl);
```

**Pros:**
- Native Tauri integration
- Works with local files

**Cons:**
- Still uses iframe (may have issues)
- Browser PDF viewer dependency

## Testing Print.js with Current Setup

### Quick Test Implementation

```javascript
// In PDFViewer.jsx
import printJS from 'print-js';

const handlePrintWithPrintJS = useCallback(async () => {
  try {
    if (!fileContent) {
      console.error('[PDF] No file content available');
      return;
    }

    console.log('[PDF] Attempting print with Print.js');

    // Method 1: Try blob URL first (most efficient)
    const blob = new Blob([fileContent], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    printJS({
      printable: blobUrl,
      type: 'pdf',
      showModal: true,
      modalMessage: 'Preparing to print...',
      onPrintDialogClose: () => {
        console.log('[PDF] Print dialog closed');
        URL.revokeObjectURL(blobUrl);
      },
      onError: (error) => {
        console.error('[PDF] Print.js error:', error);

        // Fallback: Try base64 method
        console.log('[PDF] Trying base64 fallback...');
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(fileContent))
        );

        printJS({
          printable: base64,
          type: 'pdf',
          base64: true,
          showModal: true
        });
      }
    });

  } catch (error) {
    console.error('[PDF] Print.js failed:', error);
    alert(`Failed to print: ${error.message}`);
  }
}, [fileContent]);
```

## Browser Compatibility

Print.js officially supports:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ⚠️ Variable support for all features across browsers

Since Tauri uses the system webview:
- **macOS**: Uses WKWebView (Safari engine)
- **Windows**: Uses WebView2 (Chromium engine)
- **Linux**: Uses WebKitGTK

## Known Issues & Limitations

### 1. **Large PDF Files**

Base64 encoding large files can block the UI thread:

```javascript
// Solution: Use Web Workers for encoding
const encodeWorker = new Worker('base64-encoder.js');
encodeWorker.postMessage(fileContent);
encodeWorker.onmessage = (e) => {
  const base64 = e.data;
  printJS({ printable: base64, type: 'pdf', base64: true });
};
```

### 2. **No Print API Availability**

[Tauri lacks a native print API](https://github.com/tauri-apps/tauri/issues/4917), which is a known limitation when migrating from Electron.

### 3. **PDF Viewer Dependency**

Print.js relies on the browser's built-in PDF viewer:
- If PDF rendering fails in iframe, printing fails
- Some browsers may not support all PDF features

## Comparison: Print.js vs Native Approach

| Feature | Print.js | Native OS Commands |
|---------|----------|-------------------|
| **Installation** | npm install | No dependencies |
| **Implementation** | ~20 lines JS | ~100 lines Rust |
| **Browser Support** | Varies | N/A (OS-level) |
| **PDF Support** | Via iframe | Native viewer |
| **User Experience** | Browser print dialog | OS print dialog |
| **Performance** | Base64 overhead | No overhead |
| **Reliability** | Depends on browser | OS-guaranteed |
| **Cross-platform** | Yes (web/desktop) | Platform-specific code |
| **Large Files** | Potential issues | Handles well |

## Recommendation

### ✅ **Use Print.js for Web Version**

For the web version of TidyCode, Print.js is excellent:
```javascript
if (isWeb()) {
  printJS({ printable: base64Data, type: 'pdf', base64: true });
}
```

### ⚠️ **Consider Alternatives for Desktop**

For the Tauri desktop version, **Option 1: Native OS Commands** from the main plan is still superior because:

1. **No encoding overhead** - Large PDFs don't block UI
2. **Native OS dialogs** - Better UX (Preview on macOS, etc.)
3. **More reliable** - Doesn't depend on webview PDF support
4. **Simpler** - No base64/blob conversion needed

### 🎯 **Hybrid Approach (Best of Both Worlds)**

```javascript
const handlePrint = useCallback(async () => {
  if (isDesktop()) {
    // Desktop: Use native OS commands (from main plan)
    const tempPath = await invoke('save_temp_pdf', {
      data: Array.from(fileContent)
    });
    await invoke('print_pdf_native', { filePath: tempPath });
  } else {
    // Web: Use Print.js
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(fileContent))
    );
    printJS({
      printable: base64,
      type: 'pdf',
      base64: true,
      showModal: true
    });
  }
}, [fileContent]);
```

## Quick Test Plan

If you want to test Print.js quickly:

### 1. Install
```bash
npm install print-js --save
```

### 2. Add to PDFViewer.jsx
```javascript
import printJS from 'print-js';
import 'print-js/dist/print.css';
```

### 3. Test Both Methods
```javascript
// Test 1: Blob URL
const blob = new Blob([fileContent], { type: 'application/pdf' });
printJS(URL.createObjectURL(blob));

// Test 2: Base64
const base64 = btoa(String.fromCharCode(...new Uint8Array(fileContent)));
printJS({ printable: base64, type: 'pdf', base64: true });
```

### 4. Check Console
- Look for errors about iframe loading
- Check if print dialog appears
- Test with small and large PDFs

## Final Verdict

**Print.js is a good addition for the web version**, but:

- ❌ **Not a complete solution for desktop** - Still has performance and reliability issues
- ✅ **Good for web** - Simple, works well with base64
- 🔄 **Hybrid approach recommended** - Native commands for desktop, Print.js for web

The **Native OS Commands (Option 1)** from the original plan remains the best approach for desktop, with Print.js as a nice addition for the web version.

## Implementation Priority

1. **Phase 1**: Implement Native OS Commands for desktop (3-4 hours)
2. **Phase 2**: Add Print.js for web version (1 hour)
3. **Phase 3**: Test and refine both approaches (1 hour)

**Total**: 5-6 hours for complete cross-platform solution

---

## Sources

- [Print.js Official Site](https://printjs.crabbly.com/)
- [Print.js NPM Package](https://www.npmjs.com/package/print-js)
- [Print.js GitHub](https://github.com/crabbly/Print.js)
- [Tauri CORS Discussion](https://github.com/tauri-apps/tauri/discussions/6898)
- [Tauri Print API Feature Request](https://github.com/tauri-apps/tauri/issues/4917)
- [JavaScript PDF Printing Methods Comparison](https://www.syncfusion.com/blogs/post/javascript-pdf-printing-methods)
