# Native PDF Print Plugin Architecture & Usage

This document describes the native PDF print plugin (Tauri backend) and the reusable React dialog used by TidyCode.

## Overview

The solution is split into two layers:

1) **Tauri backend plugin** (`tauri-plugin-native-pdf-print`)  
   - Exposes commands to list printers, read supported media sizes, and submit print jobs.  
   - Uses OS-native spoolers (CUPS on macOS/Linux, Windows spooler on Windows).

2) **Reusable React component** (`src/components/NativePrintDialog.jsx`)  
   - Renders a PDF preview and page selection UI.  
   - Builds a new PDF with only selected pages (via `pdf-lib`).  
   - Calls the Tauri plugin to submit the print job.

This design keeps printing native, cross‑platform, and app‑controlled without external viewer apps.

## Backend Plugin Architecture (Tauri)

### Commands

- `print_pdf(options)`
- `print_pdf_bytes(options)`
- `get_printers()`
- `get_default_printer()`
- `get_printer_media(printer_name)`

### Key Data Structures

`PrintOptions`:
- `path` (string)
- `printer_name` (string | null)
- `job_name` (string | null)
- `copies` (number | null)
- `duplex` (string | null, values: `none`, `long`, `short`)
- `paper_size` (string | null) – uses printer-specific media keys
- `remove_after_print` (bool)

`PrintBytesOptions`:
- `data_base64` (string)
- same print options as above

`MediaOption`:
- `id` (string) – printer-native media key (e.g., `iso_a4_210x297mm`)
- `label` (string) – human-readable label if available
- `is_default` (bool)

### Platform Behavior

**macOS / Linux (CUPS)**  
- Uses `lp` for printing and `lpoptions -l` for media list.  
- `paper_size` is passed as `-o media=...`.  
- `duplex` uses CUPS `sides=two-sided-*` option.  

**Windows**  
- Uses Windows spooler and writes raw PDF bytes to the printer.  
- `get_printer_media` uses `System.Drawing.Printing.PrinterSettings` to list paper sizes.  

> Note: On Windows, raw PDF printing requires the printer/driver to accept PDF directly. If not, a PDF rendering pipeline is required.

### Permissions (Tauri v2)

Enable these permissions in `src-tauri/tauri.conf.json`:
- `native-pdf-print:default`
- `native-pdf-print:allow-get-printers`
- `native-pdf-print:allow-get-printer-media`
- `native-pdf-print:allow-print-pdf-bytes`

### Tauri Registration

Register the plugin in `src-tauri/src/lib.rs`:

```rust
.plugin(tauri_plugin_native_pdf_print::init())
```

Add the path dependency in `src-tauri/Cargo.toml`:

```toml
tauri-plugin-native-pdf-print = { path = "../tauri-plugin-native-pdf-print" }
```

## React Component Architecture

**Component**: `NativePrintDialog`
- Props:
  - `filePath` (string): absolute PDF path
  - `theme` (string): `dark` or `light`
  - `onClose` (function)

### Responsibilities

1) **Preview**: Uses `react-pdf` to render pages from `filePath`.
2) **Selection**: Manual, range, or all pages.
3) **Print packaging**: Uses `pdf-lib` to build a new PDF containing only selected pages.
4) **Submission**: Calls `print_pdf_bytes` via `@tauri-apps/api/core`.
5) **Printer metadata**: Loads printers and media sizes using plugin commands.

### Dependencies

- `react-pdf` (preview)
- `pdfjs-dist` (PDF worker)
- `pdf-lib` (page extraction)
- `@tauri-apps/api` (invoke)

### Integration Example

```jsx
<NativePrintDialog
  filePath={activeTab.absolutePath}
  theme={theme}
  onClose={() => setShowPrintDialog(false)}
/>
```

The PDF viewer sets `filePath` from the active tab and opens this dialog on Print.

## Usage Flow (End-to-End)

1) User opens a PDF in TidyCode.  
2) User clicks **Print** in the PDF viewer toolbar.  
3) `NativePrintDialog` opens and renders the PDF pages.  
4) User selects pages + options (printer, copies, duplex, paper size).  
5) Component builds a new PDF (selected pages) via `pdf-lib`.  
6) Component calls `print_pdf_bytes` with base64 data.  
7) Backend writes temp file and spools job via OS commands.

## Open Source Readiness

Yes, this plugin can be released as open source. The core code is self‑contained and uses standard dependencies with permissive licenses:
- `tauri` (MIT/Apache‑2.0)
- `pdf-lib` (MIT)
- `pdfjs-dist` (Apache‑2.0)
- `react-pdf` (MIT)

**Recommendation**: include a `LICENSE` in the plugin folder and clarify third‑party licenses in your project’s `LICENSES.md`.

## Limitations / Notes

- Windows raw PDF printing depends on printer/driver native PDF support.
- Paper sizes must be pulled from the printer’s supported media list; generic labels are not reliable.
- The UI expects an absolute file path; for in‑memory PDFs, a temporary file must be created first.

