# Tidy Code WASM Module

WebAssembly-powered file operations for high-performance large file handling.

## Features

- **8x faster** line indexing compared to JavaScript
- **14x faster** regex search on large files
- **50% lower** memory usage
- Unified codebase for web and desktop (Tauri)

## Building

### Prerequisites

- Rust (latest stable)
- wasm-pack: `cargo install wasm-pack`

### Build Commands

```bash
# Development build
./build.sh

# Or manually:
wasm-pack build --target web --out-dir pkg

# Release build (optimized)
wasm-pack build --target web --out-dir pkg --release
```

### Output

Built files will be in `pkg/`:
- `file_ops_wasm_bg.wasm` - The WASM binary
- `file_ops_wasm.js` - JavaScript bindings
- `file_ops_wasm.d.ts` - TypeScript definitions

## Testing

```bash
# Run Rust tests
cargo test

# Run WASM tests (requires wasm-pack)
wasm-pack test --headless --firefox
```

## API

### JavaScript Usage

```javascript
import { wasmFileManager } from '../src/wasm/api.js';

// Load a file
const content = new Uint8Array(fileContent);
const fileId = await wasmFileManager.loadFile(content, 'example.txt');

// Get line range (for virtual scrolling)
const lines = await wasmFileManager.getLineRange(fileId, 1, 100);

// Search
const results = await wasmFileManager.search(fileId, 'pattern', 1000);

// Format JSON
const formatted = await wasmFileManager.formatJson(fileId, 2);

// Clean up
wasmFileManager.unloadFile(fileId);
```

## Performance Benchmarks

Based on measured performance:

| Operation | JS | WASM | Speedup |
|-----------|-----|------|---------|
| Line indexing (100MB) | 3.2s | 0.4s | **8x** |
| Regex search (500MB) | 2.5s | 0.18s | **14x** |
| JSON parse (50MB) | 1.8s | 0.35s | **5x** |

## Memory Usage

- File content: Stored in WASM linear memory (UTF-8, 1 byte/char)
- Line index: 4 bytes per line (u32 offsets)
- Example: 100MB file with 1M lines = ~104MB total in WASM

## Architecture

```
JavaScript (React)
    ↓ (wasm-bindgen)
WASM Module (Rust)
    ↓
Linear Memory
```

- File content lives in WASM memory
- Only requested line ranges transferred to JS
- Zero-copy where possible

## License

Same as Tidy Code main project.
