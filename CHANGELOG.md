# Changelog

All notable changes to TidyCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4] - 2026-01-12

### Added

#### YAML and TOML Format Support
- **Full YAML support** with validation, formatting, and structure view
  - Syntax validation using js-yaml library
  - Format/beautify with configurable indent and line width options
  - Structure view showing document hierarchy with clickable navigation
  - Auto-detection of YAML content from file extension or content patterns

- **Full TOML support** with validation, formatting, and structure view
  - Syntax validation using smol-toml library (browser-compatible)
  - Format/beautify with optional key sorting
  - Structure view showing sections, tables, and key-value pairs
  - Support for TOML-specific features: array of tables, inline tables, dates

#### Format Conversion
- **Bidirectional conversion** between JSON, XML, YAML, and TOML formats
  - Convert dropdown in toolbar with one-click conversion
  - Converted content opens in new tab (preserves original file)
  - Warning message advising users to review converted content
  - Current format option disabled in dropdown to prevent same-format conversion

- **Smart conversion adjustments** with user feedback
  - XML tag name sanitization (spaces replaced with underscores)
  - Invalid XML characters automatically fixed
  - TOML null value handling (converted to empty strings or removed)
  - Root array wrapping for TOML compatibility
  - All adjustments listed in information panel with clickable line navigation

#### UI Improvements
- **Resizable information panel** for conversion warnings and adjustments
  - Drag handle to resize panel height
  - Amber gradient background for better visibility
  - Compact styling with smaller fonts and reduced padding
  - Click any adjustment to jump to the affected line in editor

### Fixed
- TOML browser compatibility - switched from @iarna/toml to smol-toml
- Tabs Explorer visibility now defaults to true in web mode
- Structure view for YAML and TOML files (was showing dashes/blank lines)
- Information panel now appears in correct tab after conversion

### Dependencies Added
- `js-yaml@4.1.1` - YAML parsing and serialization
- `smol-toml@1.6.0` - Browser-compatible TOML parsing

---

## [0.2.0] - 2025-12-25

### Added

#### PDF Viewer
- **Full PDF viewing capabilities** with native rendering using PDF.js (v5.4.296)
  - Page navigation with prev/next buttons and jump-to-page input
  - Thumbnail sidebar for quick page navigation
  - Document outline/bookmarks view (when available)
  - Zoom controls (fit-to-width, fit-to-page, custom zoom levels)
  - Page counter display (current page / total pages)
  - Support for large PDFs with page virtualization (only renders visible pages)
  - Download button to save PDF files
  - Print support for PDF documents

- **PDF Search functionality**
  - Dedicated search panel with keyword input
  - Text highlighting with yellow background for search matches
  - Previous/Next navigation through search results
  - Search result counter display
  - Real-time search as you type
  - Multi-retry text layer rendering for reliable highlighting
  - Search keyword persistence across page navigation

- **Focus Mode for distraction-free viewing**
  - Toggle button to hide all UI panels (thumbnails, outline, search, file explorer, file system browser)
  - Floating focus mode button (Eye/EyeOff icon) always visible
  - Panel state restoration when exiting focus mode
  - Maximizes PDF viewing area for better readability

#### SVG Viewer
- **Interactive SVG viewing** with pan and zoom capabilities
  - Zoom controls (zoom in, zoom out, reset view)
  - Pan functionality with mouse drag
  - Fit-to-screen button
  - Download button to save SVG files
  - Support for small and large SVG files
  - Dark/Light theme support

#### Cross-Platform Clipboard Integration
- **Tauri native clipboard API** for desktop app
  - Eliminates browser permission prompts when pasting in editor
  - Seamless clipboard operations (Copy, Cut, Paste) using Ctrl/Cmd+C/X/V
  - Custom CodeMirror extension intercepts clipboard keypresses
  - Automatic fallback to browser API in web mode
  - Cross-platform utilities for clipboard read/write operations

#### File Type Support
- PDF file association (.pdf) with viewer role
- SVG file association already supported, now with dedicated viewer
- Binary file detection to prevent incorrect text rendering

### Changed

- **Find/Replace bar** now hidden when viewing PDF documents
- **File opening behavior** for PDFs - opens in dedicated viewer instead of text editor
- **Bundle optimization** with code splitting for PDF and SVG viewers
- **Vite configuration** updated to bundle PDF.js worker and CMap files locally (no CDN dependencies)

### Fixed

- Search text highlighting not appearing in PDF pages (implemented multi-retry approach for async text layers)
- "No results found" message showing while typing before search submission
- Find/Replace bar visible when viewing PDF files (corrected conditional rendering)
- Focus mode button disappearing after activation (created floating button)
- Parent panels (File Explorer, File System Browser) not closing in focus mode
- Clipboard permission prompts in desktop app when pasting content

### Technical Improvements

- **PDF.js Worker Configuration**: Local worker file bundled with application (1.0MB minified)
- **CMap Files**: 170+ character mapping files for international PDF support (~1.6MB total)
- **Performance Optimization**:
  - Page virtualization for large PDFs (only 5 pages in DOM at once)
  - Lazy loading of pages as user navigates
  - PDF.js caching for rendered pages
  - Code splitting reduces main bundle size
- **Platform Detection**: Enhanced `isDesktop()` utility for Tauri detection
- **Error Handling**: Graceful handling of corrupted PDFs and loading errors
- **Memory Management**: Proper cleanup of PDF.js resources and text layers

### Dependencies Added

- `react-pdf@10.2.0` - React wrapper for PDF.js
- `react-zoom-pan-pinch@3.7.0` - Pan and zoom for SVG viewer
- `vite-plugin-static-copy@3.1.4` - Bundle PDF.js worker and CMaps
- `@tauri-apps/plugin-clipboard-manager@2.3.2` - Native clipboard API for desktop

### Documentation

- Added `PDF_TROUBLESHOOTING.md` - Comprehensive troubleshooting guide for PDF viewer
- Added `LICENSES.md` - Third-party library licenses for PDF.js and react-pdf
- Updated file associations in Tauri configuration

### Security

- PDF rendering isolated in Web Worker thread (security sandbox)
- SVG content sanitization (future enhancement planned)
- No external CDN dependencies for PDF.js (all assets bundled locally)

---

## [0.1.1] - Previous Release

### Initial Features

- Multi-tab text editor with CodeMirror 6
- Syntax highlighting for 20+ programming languages
- JSON/XML formatting with validation
- CSV editing with preview
- Dark/Light theme support
- File Explorer and File System Browser
- Notes & Todo lists panels
- Desktop application support via Tauri
- AI integration (OpenAI, Claude, Ollama)
- LSP support for code intelligence
- VIM mode support
- Structure view for JSON/XML
- Auto-pairing for brackets and quotes
- Find & Replace functionality

---

## Links

- [Project Repository](https://github.com/yourusername/tidycode)
- [Report Issues](https://github.com/yourusername/tidycode/issues)
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [Tauri Documentation](https://tauri.app/)
