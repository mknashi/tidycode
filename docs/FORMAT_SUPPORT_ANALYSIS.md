# Format Support Analysis

## Current TidyCode Formatting & Validation Implementation

This document provides a comprehensive analysis of the existing formatting, validation, and structure view implementation in TidyCode, serving as the foundation for the YAML/TOML implementation plan.

---

## Table of Contents

1. [JSON Formatting & Validation](#json-formatting--validation)
2. [XML Formatting & Validation](#xml-formatting--validation)
3. [Format Detection Logic](#format-detection-logic)
4. [Structure View Panel](#structure-view-panel)
5. [Format Button Implementation](#format-button-implementation)
6. [Conversion Utilities](#conversion-utilities)
7. [Validation Error Display](#validation-error-display)
8. [Language Detection in CodeMirror](#language-detection-in-codemirror)
9. [Auto-Formatting Behavior](#auto-formatting-behavior)
10. [Key Files Reference](#key-files-reference)
11. [Current Gaps & Limitations](#current-gaps--limitations)

---

## JSON Formatting & Validation

### Current Implementation

- **Location:** `/src/TidyCode.jsx` (lines 4304-4355)
- **Formatting Method:** Uses native `JSON.stringify(parsed, null, 2)` with 2-space indentation
- **Validation:**
  - Primary: Native `JSON.parse()` for validation
  - Secondary: `looksLikeJSON()` function (lines 507-519) for content detection
  - Error Detection: `buildJSONErrorDetails()` (lines 4198-4279)

### Error Detection Features

- Finds trailing commas in arrays/objects
- Detects single quotes instead of double quotes
- Identifies missing commas between properties
- Locates exact line/column positions using position offset calculation
- Provides contextual lines (3 lines: error line + 1 before + 1 after)

### Validation Tips Provided

- Trailing commas (remove after last item)
- Missing quotes around property names
- Single vs double quote issues
- Missing commas between properties
- Unclosed braces/brackets

### Code Pattern

```javascript
// Detection
function looksLikeJSON(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// Formatting
function formatJSON(content) {
  const parsed = JSON.parse(content);
  return JSON.stringify(parsed, null, 2);
}
```

---

## XML Formatting & Validation

### Current Implementation

- **Location:** `/src/TidyCode.jsx` (lines 4357-4424)
- **Formatting Method:** Custom `formatXMLString()` function (lines 4497-4521)
  - Adds newlines after closing tags
  - Applies consistent 2-space indentation
  - Tracks indentation level via stack-based algorithm

### Validation

- Primary: Browser's `DOMParser.parseFromString(content, 'text/xml')`
- Secondary: `looksLikeXML()` function (lines 521-533) for detection
- Error Detection: `buildXMLErrorDetails()` (lines 4056-4123)
- Multi-error detection: `findMultipleXMLErrors()` (lines 3988-4055)

### XML Error Detection

- Unclosed tag detection using tag stack
- Mismatched closing tags (expects `<tag>` to match `</tag>`)
- Missing closing angle brackets
- Separates warnings from critical errors
- Provides line/column information for each error

### Validation Tips

- Unclosed tags (every `<tag>` needs `</tag>`)
- Missing closing angle brackets
- Unescaped special characters (`&`, `<`, `>`, `"`, `'`)
- Unquoted attribute values
- Invalid tag names
- Mismatched opening/closing tags

### Code Pattern

```javascript
// Detection
function looksLikeXML(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith('<?xml') ||
      (trimmed.startsWith('<') && /<\/?[\w-]+/.test(trimmed))) {
    return true;
  }
  return false;
}

// Validation
function validateXML(content) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  return !parseError;
}
```

---

## Format Detection Logic

### File Extension-Based Detection

**Location:** `getFileType()` function (lines 91-171)

| Extension | Type |
|-----------|------|
| `.json` | `json` |
| `.xml`, `.html`, `.htm`, `.svg` | `markup` |
| `.yaml`, `.yml`, `.toml`, `.ini` | `config` |
| `.md`, `.markdown` | `markdown` |
| `.csv`, `.tsv` | `csv` |

### Content-Based Detection

| Function | Purpose | Detection Method |
|----------|---------|------------------|
| `looksLikeJSON()` | JSON detection | Starts with `{` or `[`, validates via `JSON.parse()` |
| `looksLikeXML()` | XML detection | Checks for `<?xml` or tag patterns `<...>` and `</...>` |
| `detectCSVContent()` | CSV detection | Validates multi-row, multi-column structure |
| `detectMarkdownContent()` | Markdown detection | Matches 13+ markdown patterns |

### Auto-Format Trigger Logic

**Location:** Lines 3461-3476

```javascript
// When file opens: Auto-detects and formats JSON/XML files
// Only for small files (large files skip auto-formatting to prevent UI freeze)
if (fileType === 'json' || fileType === 'xml') {
  if (content.length < MAX_AUTO_FORMAT_SIZE) {
    formatContent({ autoTriggered: true });
  }
}
```

---

## Structure View Panel

### Location

- UI: Lines 8230-8290
- Rendering logic: Lines 5403-5462
- Calculation: Lines 6647-6676

### Features

#### JSON Structure (`buildJSONStructure()` - lines 682-777)

- Parses objects and arrays hierarchically
- Shows key-value pairs with truncated values
- Tracks array indices
- Expandable/collapsible nodes

#### XML Structure (`buildXMLStructure()` - lines 779-848)

- Parses tag hierarchy
- Tracks self-closing tags
- Shows duplicate tag indices (`<tag> [0]`, `<tag> [1]`)
- Handles comments and processing instructions

#### YAML Support

- Basic detection only (lines 6670-6672)
- Returns empty nodes (not yet fully implemented)

### UI Features

- Collapsible tree structure with +/- buttons
- Click-to-navigate: Clicking a node jumps to that line
- Active node highlighting with visual indicator
- Expand/Collapse All buttons
- Shows structure type badge (JSON, XML, YAML, Plain)
- Only visible for JSON/XML/YAML files (hidden for CSV/Markdown)

### Panel Dimensions

- Default width: 288px
- Resizable via drag handle
- Max height: full editor height
- Scrollable content area

### Structure Node Schema

```javascript
{
  key: string,        // Property name or tag name
  type: string,       // 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
  value?: string,     // Truncated value for primitives
  line?: number,      // Line number for navigation
  children?: Node[],  // Child nodes for objects/arrays
  expanded?: boolean  // UI state for collapse/expand
}
```

---

## Format Button Implementation

### Location

- Toolbar button: Lines 7800-7807
- Handler: Lines 4282-4302

### Button Details

```jsx
<button onClick={formatContent}>
  <Code2 icon /> Format
</button>
```

### Functionality

- **Auto-Detection:** `formatContent()` function intelligently routes to JSON or XML formatter
  - Starts with `<` → XML formatter
  - Otherwise → JSON formatter
- **Error Handling:** Shows full error panel with clickable error locations
- **Cursor Restoration:** Auto-saves cursor position before formatting and restores after

### States

| State | Visual | Behavior |
|-------|--------|----------|
| Normal | Default color | Click to format |
| Disabled | Grayed out | No active tab |
| Loading | Spinner | AI fix in progress |
| Error | Red highlight | Validation failed |

### Related Controls

- Structure Panel Toggle Button (adjacent to Format button)
- Shows only for JSON/XML files
- Saves visibility state

---

## Conversion Utilities

### Currently Available

| Feature | Implementation |
|---------|----------------|
| JSON formatting | Native `JSON.stringify()` |
| XML formatting | Custom `formatXMLString()` algorithm |
| CSV parsing | Custom parser with preview |
| Markdown to HTML | `marked` library |

### NOT Currently Implemented

- YAML formatting
- TOML formatting
- JSON ↔ YAML conversion
- XML ↔ JSON conversion
- Minification utilities
- Prettier integration
- Other serialization formats

### Libraries in Use

```json
{
  "@codemirror/lang-json": "for syntax highlighting",
  "@codemirror/lang-xml": "for syntax highlighting",
  "@codemirror/lang-html": "for syntax highlighting",
  "prismjs": "yaml, toml components loaded but not actively used",
  "marked": "markdown parsing"
}
```

---

## Validation Error Display

### Location

Lines 8720-8920 (full error panel)

### Components

- **Header:** Shows count of errors with AI Fix button
- **Error List Grid:** Each error is clickable to jump to location
- **Error Details per item:**
  - Error number
  - Badge: "PRIMARY ERROR" or "WARNING"
  - Line and column numbers
  - Full error message
  - Visual distinction (orange border for primary, yellow for warnings)

### Interactive Features

- Click any error to jump to that location in editor
- Keyboard accessible (Enter/Space to navigate)
- Visual focus ring (2px yellow outline)
- Close button to dismiss panel
- Retry button to reformat after manual fixes
- AI Fix button for automated corrections

### Error Message Object Structure

```javascript
{
  type: 'JSON' | 'XML',
  message: string,
  line: number | null,
  column: number | null,
  allErrors: [
    {
      line: number,
      column: number,
      message: string,
      isPrimary: boolean,
      severity: 'error' | 'warning'
    }
  ],
  context: [
    {
      lineNum: number,
      text: string,
      isError: boolean,
      column: number | null
    }
  ],
  tips: string[]
}
```

---

## Language Detection in CodeMirror

### Location

`/src/components/CodeMirrorEditor.jsx` lines 149-170

### Supported Languages

| Language | Extension |
|----------|-----------|
| JavaScript | `@codemirror/lang-javascript` |
| TypeScript | `@codemirror/lang-javascript` |
| Python | `@codemirror/lang-python` |
| Java | `@codemirror/lang-java` |
| C/C++ | `@codemirror/lang-cpp` |
| Rust | `@codemirror/lang-rust` |
| PHP | `@codemirror/lang-php` |
| SQL | `@codemirror/lang-sql` |
| XML/HTML | `@codemirror/lang-xml` |
| CSS | `@codemirror/lang-css` |
| JSON | `@codemirror/lang-json` |
| Markdown | `@codemirror/lang-markdown` |

### Extension Mapping Code

```javascript
function getLanguageExtension(language) {
  switch (language?.toLowerCase()) {
    case 'json': return json();
    case 'xml':
    case 'html':
    case 'markup': return xml();
    case 'javascript':
    case 'js': return javascript();
    // ... etc
    default: return javascript();
  }
}
```

---

## Auto-Formatting Behavior

### Auto-Formatting (on file open)

- **Condition:** File type is JSON/XML and file size < max threshold
- **Delay:** Applied immediately when file loads
- **Flag:** `autoTriggered: true` prevents cursor restoration and UI notifications

### Debounced Auto-Formatting (while typing)

- **Currently Disabled:** Code exists (lines 4426-4442) but commented out
- **Reason:** Interferes with user editing (reformats while typing)
- Can be re-enabled by uncommenting `queueAutoFormat()` call

### Manual Formatting

- Triggered by Format button or function call with `autoTriggered: false`
- Restores cursor position to original location after formatting
- Shows error panel if validation fails

---

## Key Files Reference

### Primary Files

| File | Purpose | Lines |
|------|---------|-------|
| `/src/TidyCode.jsx` | Main application, all formatting logic | ~10,068 |
| `/src/components/CodeMirrorEditor.jsx` | Editor component, language extensions | ~593 |

### Format-Related Functions in TidyCode.jsx

| Function | Line | Purpose |
|----------|------|---------|
| `getFileType()` | 91-171 | File extension detection |
| `looksLikeJSON()` | 507-519 | JSON content detection |
| `looksLikeXML()` | 521-533 | XML content detection |
| `buildJSONStructure()` | 682-777 | JSON structure tree builder |
| `buildXMLStructure()` | 779-848 | XML structure tree builder |
| `findMultipleXMLErrors()` | 3988-4055 | XML multi-error detection |
| `buildXMLErrorDetails()` | 4056-4123 | XML error message builder |
| `buildJSONErrorDetails()` | 4198-4279 | JSON error message builder |
| `formatContent()` | 4282-4302 | Main format handler |
| `formatJSON()` | 4304-4355 | JSON formatting |
| `formatXML()` | 4357-4424 | XML formatting |
| `formatXMLString()` | 4497-4521 | XML string formatter |

---

## Current Gaps & Limitations

### Missing Features

| Feature | Status | Notes |
|---------|--------|-------|
| YAML Formatting | Detected only | No actual formatting implemented |
| TOML Formatting | Detected only | No actual formatting implemented |
| YAML Structure View | Placeholder | Returns empty nodes |
| TOML Structure View | Not implemented | - |
| JSON Schema Validation | Not implemented | - |
| Custom Indentation | Hardcoded | Always 2 spaces |
| Format Options | Not implemented | No user settings |
| Minification | Not available | - |
| Format Conversions | Not available | JSON ↔ YAML, XML ↔ JSON not supported |

### HTML/XML Limitations

- Only basic indentation (no attribute wrapping)
- No preservation of comments in certain cases
- Self-closing tags may not be preserved

### Architecture Notes

- All formatting logic is in a single 10,000+ line file
- No separation of concerns for format handlers
- Tightly coupled to UI components
- Would benefit from refactoring into separate services

---

## Data Flow Summary

### File Load → Format

```
1. File loaded via file picker/drag-drop
2. File type detected via extension + content analysis
3. If JSON/XML small file → Auto-format triggered
4. Content added to editor
5. Structure View updated based on content
6. Syntax highlighting applied via CodeMirror extension
```

### Format Button Click

```
1. Get current tab content
2. Auto-detect format (JSON vs XML)
3. Validate content
4. If valid: Replace content with formatted version, update Structure View
5. If invalid: Build error details, display error panel with clickable errors
```

### Structure Panel Click

```
1. User clicks node
2. goToPosition(line, column) called
3. Content converted to index position
4. Editor focused and selection set
5. Scroll position updated if needed
```

---

## Recommendations for YAML/TOML Implementation

Based on this analysis, the recommended approach is:

1. **Create a unified FormatService** - Extract formatting logic from TidyCode.jsx into separate service classes
2. **Follow existing patterns** - Match the error detail structure and validation tip patterns
3. **Reuse Structure View architecture** - Implement `buildYAMLStructure()` and `buildTOMLStructure()` following the existing patterns
4. **Add CodeMirror language support** - Install appropriate language packages or create custom modes
5. **Maintain backward compatibility** - Keep existing JSON/XML functionality intact while adding new formats

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-07 | 1.0.0 | Initial analysis document |
