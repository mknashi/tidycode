# Large File Support

Tidy Code provides robust support for large files using a combination of WebAssembly (WASM) acceleration and a custom VirtualEditor component for files that exceed CodeMirror's performance limits.

## Overview

Large files are handled differently based on their size to ensure optimal performance:

| File Size | Strategy | Editor | Features |
|-----------|----------|--------|----------|
| < 5 MB | Direct load | CodeMirror | Full syntax highlighting, all features |
| 5 - 10 MB | WASM-indexed | CodeMirror | Full syntax highlighting, WASM search |
| 10 - 20 MB | WASM-indexed | CodeMirror | Syntax highlighting disabled, WASM search |
| 20 - 50 MB (web) / 100 MB (desktop) | WASM + Virtual | VirtualEditor | Virtual scrolling, WASM search, editing |
| > 50 MB (web) / > 100 MB (desktop) | Preview mode | VirtualEditor | 50/100 MB preview, read-only |

## Architecture

### File Loading Thresholds

```
┌─────────────────────────────────────────────────────────────────┐
│                        File Size Thresholds                      │
├─────────────────────────────────────────────────────────────────┤
│  5 MB   │ WASM_THRESHOLD - Start using WASM for file handling   │
│ 10 MB   │ FULL_FEATURES_LIMIT - Disable syntax highlighting     │
│ 20 MB   │ SAFE_FULL_LOAD_LIMIT - Switch to VirtualEditor        │
│ 50 MB   │ Web WASM_STORAGE_LIMIT - Show preview only            │
│100 MB   │ Desktop WASM_STORAGE_LIMIT - Show preview only        │
└─────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. WASM File Handler (`src/utils/wasmFileHandler.js`)

Handles large file operations using WebAssembly for near-native performance:

- **Line indexing**: Fast line offset calculation
- **Search**: Regex-powered search across large files
- **Chunk loading**: Efficient loading of file portions

#### 2. VirtualEditor (`src/components/VirtualEditor.jsx`)

A lightweight virtualized text editor using `react-window` for files that exceed CodeMirror's performance limits:

- **Virtual scrolling**: Only renders visible lines
- **Web Worker search**: Non-blocking search operations
- **Editing support**: Full text editing via textarea overlay
- **Line numbers**: Gutter with line numbers

### Data Flow

```
User Opens Large File
        ↓
Detect File Size
        ↓
┌───────────────────────────────────────┐
│ Size < 20MB?                          │
│   YES → Load with CodeMirror          │
│   NO  → Continue...                   │
├───────────────────────────────────────┤
│ Size < WASM_STORAGE_LIMIT?            │
│   YES → Load full file in VirtualEditor│
│   NO  → Load preview in VirtualEditor │
└───────────────────────────────────────┘
        ↓
Store in WASM Memory (if applicable)
        ↓
Display in Editor
```

## Features by Editor Type

### CodeMirror (< 20 MB)

- Full syntax highlighting (< 10 MB only)
- Vim mode support
- Code folding
- Auto-formatting
- Find and replace
- All standard editor features

### VirtualEditor (> 20 MB)

- Virtual scrolling (renders only visible lines)
- Line numbers
- Search with highlighting
- Find next/previous match
- Replace all
- Basic text editing
- Theme support (dark/light)

**Not available in VirtualEditor:**
- Syntax highlighting
- Vim mode
- Code folding
- Auto-formatting

## Performance Characteristics

### Memory Usage

| File Size | CodeMirror Memory | VirtualEditor Memory |
|-----------|-------------------|----------------------|
| 10 MB | ~50 MB | N/A |
| 50 MB | Crash likely | ~60 MB |
| 100 MB | Crash | ~110 MB |
| 500 MB | Crash | ~520 MB |

### Load Times

| File Size | Load Time (Desktop) | Load Time (Web) |
|-----------|---------------------|-----------------|
| 10 MB | < 500ms | < 800ms |
| 50 MB | < 2s | < 3s |
| 100 MB | < 3s | < 5s |

### Search Performance

WASM-powered search is significantly faster than JavaScript:

| File Size | WASM Search | JS Search |
|-----------|-------------|-----------|
| 50 MB | < 100ms | ~2s |
| 100 MB | < 200ms | ~5s |
| 500 MB | < 500ms | Crash |

## User Experience

### Status Bar Indicators

The status bar shows:
- **File size**: Displayed in human-readable format (Bytes, KB, MB, GB)
- **Line count**: Total number of lines
- **Cursor position**: Current line and column

### Vim Mode

Vim mode is **only available for files using CodeMirror** (< 20 MB). For larger files using VirtualEditor, the Vim toggle is disabled with a tooltip explaining why.

### Preview Mode

For very large files (> 50 MB web / > 100 MB desktop), only a preview is loaded:

- First 50 MB (web) or 100 MB (desktop) is displayed
- File is marked as truncated
- A warning message is shown
- File is read-only to prevent data loss

## Configuration

### Adjusting Thresholds

The thresholds are defined in `src/TidyCode.jsx`:

```javascript
const WASM_THRESHOLD = 5 * 1024 * 1024;        // 5 MB
const FULL_FEATURES_LIMIT = 10 * 1024 * 1024;  // 10 MB
const SAFE_FULL_LOAD_LIMIT = 20 * 1024 * 1024; // 20 MB
const WASM_STORAGE_LIMIT = isTauriDesktop
  ? 100 * 1024 * 1024   // 100 MB desktop
  : 50 * 1024 * 1024;   // 50 MB web
```

## Testing Large Files

A test file generator is included for testing large file support:

```bash
# Generate all test files (5MB, 15MB, 25MB, 60MB, 120MB)
npm run generate:test-files

# Generate specific formats
npm run generate:test-files -- --json
npm run generate:test-files -- --csv
npm run generate:test-files -- --xml
npm run generate:test-files -- --log

# Generate specific size
npm run generate:test-files -- --size=50 --json
```

Generated files are placed in `test-files/` directory (excluded from git).

### Test Scenarios

| Size | Expected Behavior |
|------|-------------------|
| 5 MB | Regular loading, full features |
| 15 MB | WASM loading, syntax highlighting disabled |
| 25 MB | VirtualEditor, full content |
| 60 MB | Web: 50MB preview / Desktop: VirtualEditor full |
| 120 MB | Web: 50MB preview / Desktop: 100MB preview |

|Size|	Web Behavior|	Desktop Behavior|
|----|--------------|-------------------|
|5MB|Regular loading|	Regular loading|
|15MB|	WASM + CodeMirror (no syntax)|	WASM + CodeMirror (no syntax)|
|25MB|	VirtualEditor (full)|	VirtualEditor (full)|
|60MB|	VirtualEditor (50MB preview)|	VirtualEditor (full)|
|120MB|	VirtualEditor (50MB preview)|	VirtualEditor (100MB preview)|

## Troubleshooting

### File Won't Open

- Check available system memory
- Try opening on desktop app (higher limits)
- For files > 1GB, consider using specialized log viewers

### Slow Performance

- Ensure WASM is loading (check browser console)
- Large files disable syntax highlighting for performance
- VirtualEditor is used for files > 20MB

### Search Not Working

- VirtualEditor uses Web Worker for search
- Check browser console for worker errors
- Regex syntax must be valid

### Vim Mode Unavailable

Vim mode only works with CodeMirror. Files > 20MB use VirtualEditor which doesn't support Vim bindings.

## Future Improvements

- [ ] Syntax highlighting for VirtualEditor (limited)
- [ ] Better editing support in preview mode
- [ ] File comparison (diff) for large files
- [ ] Streaming file loading
- [ ] Memory-mapped file support (desktop)
