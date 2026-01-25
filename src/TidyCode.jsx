import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Plus, Minus, Save, Upload, ChevronLeft, ChevronRight, Search, Replace, Code2, StickyNote, CheckSquare, ChevronsLeft, ChevronsRight, GripVertical, Bold, Italic, Underline, Sun, Moon, Settings, ChevronDown, ChevronUp, Info, FileText, Braces, FileCode, Folder, FolderOpen, FolderPlus, Edit2, Trash2, Image as ImageIcon, Sparkles, Loader2, Maximize2, Minimize2, PanelLeftClose, PanelLeft, Check, XCircle, CaseSensitive, GitCompare, Layers, Terminal, HelpCircle, ArrowRightLeft } from 'lucide-react';
import { marked } from 'marked';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
// Import Prism language components
// Note: Order matters! Some languages have dependencies
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markup-templating'; // Required for PHP, JSP, etc.
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-perl';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-dart';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-ini';
import 'prismjs/components/prism-markdown';
import DiffViewerModal from './components/DiffViewerModal';
import DiffViewer from './components/DiffViewer';
import AISettingsModal from './components/AISettingsModal';
import OllamaSetupWizard from './components/OllamaSetupWizard';
import CodeMirrorEditor from './components/CodeMirrorEditor';
import VirtualEditor from './components/VirtualEditor';
import TabsExplorer from './components/TabsExplorer';
import FileSystemBrowser from './components/FileSystemBrowser';
import AdBanner from './components/AdBanner';
import TerminalPanel from './components/TerminalPanelWrapper';
import PDFViewer from './components/PDFViewer';
import SVGViewer from './components/SVGViewer';
import { HelpModal } from './components/help/HelpModal';
import { HELP_URLS } from './components/help/HelpContent';
import { formatService } from './services/formatters';
import { AI_PROVIDERS, GROQ_MODELS, OPENAI_MODELS, CLAUDE_MODELS } from './services/AIService';
import { isDesktop, getAIService } from './utils/platform';
import { loadSecureSettings, saveSecureSettings } from './utils/secureStorage';
import Tooltip from './components/Tooltip';
import CookieConsent from './components/CookieConsent';
import { openUrl } from './utils/openUrl';
import { EditorView } from '@codemirror/view';
import { loadFile as loadFileWithWasm, unloadFile as unloadWasmFile, getContentFromWasm, formatFileSize, shouldUseWasm, shouldWarnUser, searchInFile } from './utils/wasmFileHandler';
import { version as appVersion } from '../package.json';

const BRACE_PAIRS = {
  '{': '}',
  '[': ']',
  '(': ')'
};

const BRACE_LOOKUP = Object.entries(BRACE_PAIRS).reduce((acc, [open, close]) => {
  acc[close] = open;
  return acc;
}, {});

const INDENT_UNIT = '  ';
const DEFAULT_CSV_COLUMN_WIDTH = 140;
const MIN_CSV_COLUMN_WIDTH = 60;
const MAX_CSV_COLUMN_WIDTH = 420;
const DEFAULT_CSV_PREVIEW_HEIGHT = 220;
const MIN_CSV_PREVIEW_HEIGHT = 120;
const MAX_CSV_PREVIEW_HEIGHT = 420;
const DEFAULT_SEARCH_RESULTS_HEIGHT = 200;
const MIN_SEARCH_RESULTS_HEIGHT = 100;
const MAX_SEARCH_RESULTS_HEIGHT = 400;
const DEFAULT_FILE_EXPLORER_HEIGHT = 300;
const MIN_FILE_EXPLORER_HEIGHT = 150;
const MAX_FILE_EXPLORER_HEIGHT = 600;
const stripVirtualPrefix = (input = '') => input.replace(/^virtual:/, '');
const getSafeFileName = (name = '') => {
  const trimmed = stripVirtualPrefix(name.trim());
  return trimmed || 'untitled';
};

// File type detection utility
const getFileType = (filename = '') => {
  const name = (filename || '').toLowerCase();

  // PDF files
  if (name.endsWith('.pdf')) {
    return { type: 'pdf', shouldAutoFormat: false };
  }

  // SVG files (specific type for viewer, different from generic markup)
  if (name.endsWith('.svg')) {
    return { type: 'svg', shouldAutoFormat: false };
  }

  // Code/Script files that should not be auto-formatted as JSON/XML
  const codeExtensions = [
    '.js', '.jsx', '.ts', '.tsx',  // JavaScript/TypeScript
    '.php', '.php3', '.php4', '.php5', '.phtml',  // PHP
    '.py', '.pyw', '.pyx',  // Python
    '.rb', '.rbw',  // Ruby
    '.java', '.class',  // Java
    '.jsp', '.jspx',  // JSP
    '.go',  // Go
    '.rs',  // Rust
    '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx',  // C/C++
    '.cs',  // C#
    '.swift',  // Swift
    '.kt', '.kts',  // Kotlin
    '.scala',  // Scala
    '.m', '.mm',  // Objective-C
    '.pl', '.pm',  // Perl
    '.sh', '.bash', '.zsh', '.fish',  // Shell
    '.lua',  // Lua
    '.r', '.R',  // R
    '.dart',  // Dart
    '.sql',  // SQL
    '.vb', '.vbs',  // Visual Basic
    '.asm', '.s',  // Assembly
    '.f', '.f90', '.f95',  // Fortran
    '.pas',  // Pascal
    '.groovy', '.gradle'  // Groovy
  ];

  // Config files
  const configExtensions = [
    '.ini', '.conf', '.config', '.toml', '.yaml', '.yml',
    '.properties', '.env', '.cfg'
  ];

  // Markup files (excluding .svg which is handled separately above)
  const markupExtensions = [
    '.html', '.htm', '.xhtml', '.xml'
  ];

  // Markdown
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    return { type: 'markdown', shouldAutoFormat: false };
  }

  // Code files
  if (codeExtensions.some(ext => name.endsWith(ext))) {
    return { type: 'code', shouldAutoFormat: false };
  }

  // Config files
  if (configExtensions.some(ext => name.endsWith(ext))) {
    return { type: 'config', shouldAutoFormat: false };
  }

  // Markup files (can be auto-formatted as XML)
  if (markupExtensions.some(ext => name.endsWith(ext))) {
    return { type: 'markup', shouldAutoFormat: true };
  }

  // JSON files
  if (name.endsWith('.json')) {
    return { type: 'json', shouldAutoFormat: true };
  }

  // Plain text or unknown
  return { type: 'text', shouldAutoFormat: true };
};

// Binary file detection helper
const isBinaryFile = (filename = '') => {
  const name = (filename || '').toLowerCase();
  const binaryExtensions = [
    '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
    '.mp4', '.avi', '.mov', '.mp3', '.wav', '.ogg',
    '.zip', '.tar', '.gz', '.7z', '.rar',
    '.exe', '.dll', '.so', '.dylib'
  ];
  return binaryExtensions.some(ext => name.endsWith(ext));
};

// Detect language from content patterns
const detectLanguageFromContent = (content = '') => {
  if (!content || content.trim().length === 0) return null;

  const trimmed = content.trim();
  const firstLine = trimmed.split('\n')[0].trim();

  // JSON - starts with { or [
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) &&
      (trimmed.includes('"') || trimmed.includes(':'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch (e) {
      // Might still be JSON being typed
      if (trimmed.match(/^\s*[\{\[]/)) return 'json';
    }
  }

  // XML/HTML - starts with < and has tags
  if (trimmed.startsWith('<') && (trimmed.includes('</') || trimmed.includes('/>'))) {
    if (trimmed.match(/<(!DOCTYPE html|html|head|body|div|span|p|a|img)/i)) {
      return 'markup'; // HTML
    }
    return 'markup'; // XML
  }

  // PHP - starts with <?php
  if (trimmed.startsWith('<?php') || firstLine.includes('<?php')) {
    return 'php';
  }

  // Python - common patterns
  if (firstLine.startsWith('#!') && firstLine.includes('python')) return 'python';
  if (trimmed.match(/^(import |from .+ import |def |class |if __name__)/m)) return 'python';

  // JavaScript/TypeScript - common patterns
  if (trimmed.match(/^(import .+ from|export (default |const |function |class )|const .+ = |function |class |\/\/ |\/\*)/m)) {
    if (trimmed.includes(': ') && trimmed.match(/:\s*(string|number|boolean|any|void)/)) {
      return 'typescript'; // Has type annotations
    }
    if (trimmed.match(/<[A-Z][a-zA-Z]*.*>/)) {
      return 'jsx'; // Has JSX
    }
    return 'javascript';
  }

  // CSS - has selectors and properties
  if (trimmed.match(/[.#\w-]+\s*\{[\s\S]*:\s*[\s\S]*;?[\s\S]*\}/)) {
    return 'css';
  }

  // SQL - common keywords
  if (trimmed.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|FROM|WHERE|JOIN)\s+/im)) {
    return 'sql';
  }

  // Shell/Bash - shebang or common commands
  if (firstLine.startsWith('#!') && firstLine.match(/\/(bash|sh|zsh|fish)/)) return 'bash';
  if (trimmed.match(/^(echo|cd|ls|mkdir|rm|cp|mv|grep|awk|sed)\s+/m)) return 'bash';

  // Ruby - common patterns
  if (firstLine.startsWith('#!') && firstLine.includes('ruby')) return 'ruby';
  if (trimmed.match(/^(require |class .+ < |def |module |puts |end$)/m)) return 'ruby';

  // Go - package declaration
  if (trimmed.match(/^package\s+\w+/m) && trimmed.includes('func ')) return 'go';

  // Rust - common patterns
  if (trimmed.match(/^(fn |use |pub |struct |impl |mod |let mut )/m)) return 'rust';

  // Java/C#/C++ - common patterns
  if (trimmed.match(/^(public |private |protected |class |interface |namespace )/m)) {
    if (trimmed.includes('namespace')) return 'csharp';
    if (trimmed.includes('#include')) return 'cpp';
    return 'java';
  }

  // C - #include and common patterns
  if (trimmed.match(/^#include\s*[<"]/m) && !trimmed.match(/^(class |namespace )/m)) {
    return trimmed.includes('iostream') ? 'cpp' : 'c';
  }

  // YAML - starts with --- or has key: value
  if (trimmed.startsWith('---') || trimmed.match(/^[\w-]+:\s*[\w\s]/m)) {
    if (!trimmed.includes('{') && !trimmed.includes(';')) return 'yaml';
  }

  // Markdown - has markdown syntax
  if (trimmed.match(/^(#{1,6}\s|```|\*\*|__|\[.+\]\(.+\))/m)) return 'markdown';

  return null;
};

// Get Prism language identifier from filename
const getPrismLanguage = (filename = '') => {
  const name = (filename || '').toLowerCase();

  // JavaScript/TypeScript
  if (name.endsWith('.js')) return 'javascript';
  if (name.endsWith('.jsx')) return 'jsx';
  if (name.endsWith('.ts')) return 'typescript';
  if (name.endsWith('.tsx')) return 'tsx';

  // PHP
  if (name.endsWith('.php') || name.endsWith('.php3') || name.endsWith('.php4') ||
      name.endsWith('.php5') || name.endsWith('.phtml')) return 'php';

  // Python
  if (name.endsWith('.py') || name.endsWith('.pyw') || name.endsWith('.pyx')) return 'python';

  // Ruby
  if (name.endsWith('.rb') || name.endsWith('.rbw')) return 'ruby';

  // Java
  if (name.endsWith('.java') || name.endsWith('.class')) return 'java';

  // JSP
  if (name.endsWith('.jsp') || name.endsWith('.jspx')) return 'markup';

  // Go
  if (name.endsWith('.go')) return 'go';

  // Rust
  if (name.endsWith('.rs')) return 'rust';

  // C/C++
  if (name.endsWith('.c') || name.endsWith('.h')) return 'c';
  if (name.endsWith('.cpp') || name.endsWith('.hpp') || name.endsWith('.cc') ||
      name.endsWith('.cxx')) return 'cpp';

  // C#
  if (name.endsWith('.cs')) return 'csharp';

  // Swift
  if (name.endsWith('.swift')) return 'swift';

  // Kotlin
  if (name.endsWith('.kt') || name.endsWith('.kts')) return 'kotlin';

  // Scala
  if (name.endsWith('.scala')) return 'scala';

  // Objective-C
  if (name.endsWith('.m') || name.endsWith('.mm')) return 'objectivec';

  // Perl
  if (name.endsWith('.pl') || name.endsWith('.pm')) return 'perl';

  // Shell
  if (name.endsWith('.sh') || name.endsWith('.bash') || name.endsWith('.zsh') ||
      name.endsWith('.fish')) return 'bash';

  // Lua
  if (name.endsWith('.lua')) return 'lua';

  // R
  if (name.endsWith('.r') || name.endsWith('.R')) return 'r';

  // Dart
  if (name.endsWith('.dart')) return 'dart';

  // SQL
  if (name.endsWith('.sql')) return 'sql';

  // Visual Basic
  if (name.endsWith('.vb') || name.endsWith('.vbs')) return 'vbnet';

  // Assembly
  if (name.endsWith('.asm') || name.endsWith('.s')) return 'asm6502';

  // Markup
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'markup';
  if (name.endsWith('.xml')) return 'markup';
  if (name.endsWith('.svg')) return 'markup';

  // Styles
  if (name.endsWith('.css')) return 'css';

  // Data formats
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml';
  if (name.endsWith('.toml')) return 'toml';
  if (name.endsWith('.ini') || name.endsWith('.conf') || name.endsWith('.config')) return 'ini';

  // Markdown
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';

  // Groovy
  if (name.endsWith('.groovy') || name.endsWith('.gradle')) return 'groovy';

  // Default
  return null;
};

const LogoMark = ({ size = 24, className = '' }) => (
  <img
    src="/tidycode-logo.svg"
    width={size}
    height={size}
    alt="Tidy Code logo"
    className={className}
    style={{ width: size, height: size, objectFit: 'contain' }}
    draggable="false"
  />
);

const htmlEntityDecode = (input = '') => {
  const doc = new DOMParser().parseFromString(input, 'text/html');
  return doc.documentElement.textContent || '';
};
const stripHtml = (input = '') => htmlEntityDecode(input.replace(/<[^>]*>/g, ' ')).trim();
const stripAnchors = (input = '') => input.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1');
const escapeHtml = (input = '') => input
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const linkifyHtml = (input = '') => {
  const regex = /((https?:\/\/)[^\s<]+)/gi;
  return input.replace(regex, (match) => `<a href="${match}" target="_blank" rel="noreferrer">${match}</a>`);
};

const parseCSV = (text = '', delimiter = ',') => {
  if (!text) return [];
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(current);
      current = '';
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
        rows.push(row);
      }
      row = [];
    } else {
      current += char;
    }
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
  }
  if (row.length > 0 && (row.length > 1 || row[0] !== '')) {
    rows.push(row);
  }
  return rows;
};

const computeCsvRowRanges = (text = '') => {
  if (!text) return [];
  const ranges = [];
  let inQuotes = false;
  let rowStart = 0;
  let rowStartLine = 1;
  let currentLine = 1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === '\n' || char === '\r') {
      if (!inQuotes) {
        // End the CSV row if we're not inside quotes
        let rowEnd = i;
        if (char === '\r' && text[i + 1] === '\n') {
          i++;
        }
        ranges.push({ start: rowStart, end: rowEnd, lineNumber: rowStartLine });
        rowStart = i + 1;
        currentLine++;
        rowStartLine = currentLine;
      } else {
        // We're inside quotes - just increment the line counter
        if (char === '\r' && text[i + 1] === '\n') {
          i++;
        }
        currentLine++;
      }
    }
  }

  if (rowStart < text.length) {
    ranges.push({ start: rowStart, end: text.length, lineNumber: rowStartLine });
  } else if (text.length === 0) {
    ranges.push({ start: 0, end: 0, lineNumber: 1 });
  }

  return ranges;
};

const serializeCSV = (rows = [], delimiter = ',') => {
  if (!rows || rows.length === 0) return '';
  const escapeCell = (cell = '') => {
    const needsQuotes = /[",\n\r]/.test(cell);
    const escaped = cell.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };
  return rows.map(row => row.map(cell => escapeCell(cell ?? '')).join(delimiter)).join('\n');
};

const looksLikeJSON = (text = '') => {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const startsWith = trimmed[0];
  if (startsWith !== '{' && startsWith !== '[') return false;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null;
  } catch (error) {
    return false;
  }
};

const looksLikeXML = (text = '') => {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Check for XML declaration or opening tag
  if (trimmed.startsWith('<?xml') || (trimmed.startsWith('<') && trimmed.includes('>'))) {
    // Basic check: should have opening and closing tags
    const hasOpeningTag = /<[\w]/.test(trimmed);
    const hasClosingTag = /<\/[\w]/.test(trimmed) || /\/>/.test(trimmed);
    return hasOpeningTag && hasClosingTag;
  }
  return false;
};

const detectCSVContent = (text = '', filename = '') => {
  if (!text) return false;
  const trimmed = String(text).trim();
  if (!trimmed) return false;

  // Don't detect as CSV if this is a markdown file
  if (filename && (filename.toLowerCase().endsWith('.md') || filename.toLowerCase().endsWith('.markdown'))) {
    return false;
  }

  // Don't detect as CSV if it looks like markdown
  if (trimmed.startsWith('#') || trimmed.includes('##') || trimmed.includes('###')) {
    return false;
  }

  // Don't detect as CSV if it looks like JSON (valid or invalid)
  if (looksLikeJSON(trimmed)) return false;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return false;

  // Don't detect as CSV if it looks like XML (valid or invalid)
  if (looksLikeXML(trimmed)) return false;
  if (trimmed.startsWith('<')) return false;

  if (!trimmed.includes(',')) return false;
  const rows = parseCSV(text);
  if (!rows || rows.length < 2) return false;
  const columnCounts = rows.map(row => row.length);
  const maxColumns = Math.max(...columnCounts);
  const minColumns = Math.min(...columnCounts);
  if (!Number.isFinite(maxColumns) || maxColumns < 2) return false;
  const allowedVariance = Math.max(1, Math.floor(maxColumns * 0.2));
  if (maxColumns - minColumns > allowedVariance) return false;
  return true;
};

const detectMarkdownContent = (text = '', filename = '') => {
  if (!text && !filename) return false;

  // Check file extension first
  if (filename && filename.toLowerCase().endsWith('.md')) return true;

  if (!text) return false;
  const trimmed = String(text).trim();
  if (!trimmed) return false;

  // Don't detect as markdown if it looks like JSON or XML
  if (looksLikeJSON(trimmed) || looksLikeXML(trimmed)) return false;
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('<')) return false;

  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s+/m,           // Headers
    /^\*{1,3}[^*]+\*{1,3}/m, // Bold/italic
    /^_{1,3}[^_]+_{1,3}/m,   // Bold/italic with underscores
    /^\[.+\]\(.+\)/m,        // Links
    /^!\[.+\]\(.+\)/m,       // Images
    /^>\s+/m,                // Blockquotes
    /^-{3,}$/m,              // Horizontal rules
    /^\*{3,}$/m,             // Horizontal rules
    /^```/m,                 // Code blocks
    /^`[^`]+`/m,             // Inline code
    /^\s*[-*+]\s+/m,         // Unordered lists
    /^\s*\d+\.\s+/m,         // Ordered lists
    /^\|.+\|/m,              // Tables
  ];

  let matchCount = 0;
  for (const pattern of markdownPatterns) {
    if (pattern.test(trimmed)) {
      matchCount++;
      if (matchCount >= 2) return true; // Need at least 2 markdown patterns
    }
  }

  return false;
};

const getLineColumnFromIndex = (text, index) => {
  const safeIndex = Math.max(0, Math.min(index, text.length));
  const textBeforeCursor = text.substring(0, safeIndex);
  const lines = textBeforeCursor.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column, index: safeIndex };
};

const getIndexFromLineColumn = (text, targetLine, targetColumn) => {
  const lines = text.split('\n');
  let index = 0;
  const line = Math.max(1, targetLine || 1);
  const column = Math.max(1, targetColumn || 1);

  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    index += lines[i].length + 1;
  }

  return Math.min(index + column - 1, text.length);
};

const findMatchingBraces = (text, cursorPos) => {
  if (!text || cursorPos === null || cursorPos === undefined) return null;

  let index = Math.max(0, cursorPos - 1);
  let char = text[index];

  if (!BRACE_PAIRS[char] && !BRACE_LOOKUP[char]) {
    index = cursorPos;
    char = text[index];
  }

  if (!BRACE_PAIRS[char] && !BRACE_LOOKUP[char]) return null;

  if (BRACE_PAIRS[char]) {
    const matchChar = BRACE_PAIRS[char];
    let depth = 0;
    for (let i = index; i < text.length; i++) {
      if (text[i] === char) depth++;
      else if (text[i] === matchChar) {
        depth--;
        if (depth === 0) {
          return {
            open: { ...getLineColumnFromIndex(text, index), char, role: 'open' },
            close: { ...getLineColumnFromIndex(text, i), char: matchChar, role: 'close' }
          };
        }
      }
    }
  } else {
    const matchChar = BRACE_LOOKUP[char];
    let depth = 0;
    for (let i = index; i >= 0; i--) {
      if (text[i] === char) depth++;
      else if (text[i] === matchChar) {
        depth--;
        if (depth === 0) {
          return {
            open: { ...getLineColumnFromIndex(text, i), char: matchChar, role: 'open' },
            close: { ...getLineColumnFromIndex(text, index), char, role: 'close' }
          };
        }
      }
    }
  }

  return null;
};

const buildJSONStructure = (text) => {
  let counter = 0;
  const rootNodes = [];
  const stack = [];
  const createNode = (label, line) => ({
    id: `json-${counter++}-${line}`,
    label,
    line,
    children: []
  });

  const attachNode = (node) => {
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.node.children.push(node);
    } else {
      rootNodes.push(node);
    }
  };

  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const lineNum = index + 1;
    if (!trimmed) return;

    if (/^[}\]]/.test(trimmed)) {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if ((trimmed.startsWith('}') && top.type === 'object') ||
            (trimmed.startsWith(']') && top.type === 'array')) {
          stack.pop();
          break;
        }
        stack.pop();
      }
      return;
    }

    if (stack.length === 0 && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
      const node = createNode(trimmed.startsWith('{') ? '{ }' : '[ ]', lineNum);
      rootNodes.push(node);
      stack.push({ node, type: trimmed.startsWith('{') ? 'object' : 'array', index: 0, prefix: '' });
      return;
    }

    const keyMatch = trimmed.match(/^"([^"]+)"\s*:\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1];
      const rest = keyMatch[2];
      if (rest.startsWith('{')) {
        const node = createNode(`${key} { }`, lineNum);
        attachNode(node);
        if (!rest.includes('}')) {
          stack.push({ node, type: 'object' });
        }
      } else if (rest.startsWith('[')) {
        const node = createNode(`${key} [ ]`, lineNum);
        attachNode(node);
        if (!rest.includes(']')) {
          stack.push({ node, type: 'array', index: 0, prefix: key });
        }
      } else {
        const valueSnippet = rest.replace(/,$/, '').trim();
        attachNode(createNode(`${key}: ${valueSnippet}`, lineNum));
      }
      return;
    }

    const parent = stack[stack.length - 1];
    if (!parent) return;

    if (parent.type === 'array') {
      const currentIndex = parent.index || 0;
      parent.index = currentIndex + 1;
      const prefixLabel = parent.prefix ? `${parent.prefix}[${currentIndex}]` : `[${currentIndex}]`;
      if (trimmed.startsWith('{')) {
        const node = createNode(`${prefixLabel} { }`, lineNum);
        parent.node.children.push(node);
        if (!trimmed.includes('}')) {
          stack.push({ node, type: 'object' });
        }
      } else if (trimmed.startsWith('[')) {
        const node = createNode(`${prefixLabel} [ ]`, lineNum);
        parent.node.children.push(node);
        if (!trimmed.includes(']')) {
          stack.push({ node, type: 'array', index: 0, prefix: prefixLabel });
        }
      } else {
        parent.node.children.push(createNode(`${prefixLabel} ${trimmed.replace(/,$/, '')}`, lineNum));
      }
    }
  });

  return rootNodes;
};

const buildXMLStructure = (text) => {
  let counter = 0;
  const rootNodes = [];
  const stack = [];
  const lines = text.split('\n');

  const createNode = (label, line) => ({
    id: `xml-${counter++}-${line}`,
    label,
    line,
    children: []
  });

  const attachNode = (node) => {
    if (stack.length > 0) {
      stack[stack.length - 1].node.children.push(node);
    } else {
      rootNodes.push(node);
    }
  };
  const incrementSiblingIndex = (tag) => {
    const parent = stack[stack.length - 1];
    if (!parent) return { label: '', index: null, parentRef: null, tag };
    const childCounts = parent.childCounts || (parent.childCounts = {});
    const showMap = parent.showIndices || (parent.showIndices = {});
    childCounts[tag] = (childCounts[tag] || 0) + 1;
    const currentIndex = childCounts[tag] - 1;
    let label = '';
    if (showMap[tag]) {
      label = `[${currentIndex}]`;
    }
    return { label, index: currentIndex, parentRef: parent, tag };
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const lineNum = index + 1;
    if (!trimmed) return;
    if (trimmed.startsWith('<!--') || trimmed.startsWith('<?')) return;

    const closingMatch = trimmed.match(/^<\/([\w:\-\.]+)>/);
    if (closingMatch) {
      while (stack.length) {
        const top = stack.pop();
        if (top.tag === closingMatch[1]) break;
      }
      return;
    }

    const openMatch = trimmed.match(/^<([\w:\-\.]+)([^>]*)>/);
    if (openMatch && !trimmed.startsWith('</')) {
      const tag = openMatch[1];
      const inlineClose = trimmed.includes(`</${tag}>`);
      const selfClosing = /\/>\s*$/.test(trimmed);
      const { label: indexLabel, parentRef } = incrementSiblingIndex(tag);
      const label = indexLabel ? `<${tag}> ${indexLabel}` : `<${tag}>`;
      const node = createNode(label, lineNum);
      attachNode(node);
      if (parentRef) {
        parentRef.showIndices = parentRef.showIndices || {};
        parentRef.showIndices[tag] = true;
      }
      if (!selfClosing && !inlineClose) {
        stack.push({ node, tag, childCounts: {}, showIndices: {} });
      }
    }
  });

  return rootNodes;
};

const createDefaultNotesState = () => {
  const firstNoteId = 1;
  const firstFolderId = 1;
  return {
    notes: [{ id: firstNoteId, folderId: null, title: '', content: '', images: [], createdAt: Date.now(), updatedAt: Date.now(), archived: false }],
    folders: [],
    nextNoteId: firstNoteId + 1,
    nextFolderId: firstFolderId + 1,
    activeFolderId: null,
    activeNoteId: null,
    viewMode: 'tiles'
  };
};

const createDefaultTodosState = () => {
  const firstId = 1;
  return {
    tabs: [{ id: firstId, title: 'List 1', items: [] }],
    activeId: firstId,
    nextId: firstId + 1
  };
};

const loadNotesState = () => {
  const fallback = createDefaultNotesState();
  if (typeof window === 'undefined' || !window?.localStorage) return fallback;
  const storage = window.localStorage;

  const sanitizeNote = (note) => ({
    id: typeof note.id === 'number' ? note.id : Number(note.id) || Date.now(),
    folderId: note.folderId !== undefined ? (note.folderId === null ? null : Number(note.folderId)) : null,
    title: typeof note.title === 'string' ? note.title : '',
    content: typeof note.content === 'string' ? note.content : '',
    images: Array.isArray(note.images) ? note.images : [],
    createdAt: typeof note.createdAt === 'number' ? note.createdAt : Date.now(),
    updatedAt: typeof note.updatedAt === 'number' ? note.updatedAt : Date.now(),
    archived: Boolean(note.archived)
  });

  const sanitizeFolder = (folder) => ({
    id: typeof folder.id === 'number' ? folder.id : Number(folder.id) || Date.now(),
    parentId: folder.parentId !== undefined ? (folder.parentId === null ? null : Number(folder.parentId)) : null,
    name: typeof folder.name === 'string' ? folder.name : 'Untitled Folder',
    expanded: typeof folder.expanded === 'boolean' ? folder.expanded : true
  });

  try {
    const saved = storage.getItem('tidycode-notes-state-v2') || storage.getItem('neonotepad-notes-state-v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.notes)) {
        const notes = parsed.notes.map(sanitizeNote);
        const folders = Array.isArray(parsed.folders) ? parsed.folders.map(sanitizeFolder) : [];
        const noteIds = notes.map(n => Number(n.id) || 0);
        const folderIds = folders.map(f => Number(f.id) || 0);

        return {
          notes,
          folders,
          nextNoteId: Number.isFinite(parsed.nextNoteId) && parsed.nextNoteId > 0 ? parsed.nextNoteId : Math.max(0, ...noteIds) + 1,
          nextFolderId: Number.isFinite(parsed.nextFolderId) && parsed.nextFolderId > 0 ? parsed.nextFolderId : Math.max(0, ...folderIds) + 1,
          activeFolderId: parsed.activeFolderId !== undefined ? (parsed.activeFolderId === null ? null : Number(parsed.activeFolderId)) : null,
          activeNoteId: parsed.activeNoteId !== undefined ? (parsed.activeNoteId === null ? null : Number(parsed.activeNoteId)) : null,
          viewMode: parsed.viewMode === 'tiles' || parsed.viewMode === 'list' ? parsed.viewMode : 'tiles'
        };
      }
    }

    // Legacy migration from old tab-based structure
    const legacySaved = storage.getItem('tidycode-notes-state') || storage.getItem('neonotepad-notes-state');
    if (legacySaved) {
      const parsed = JSON.parse(legacySaved);
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        const notes = parsed.tabs.map((tab, idx) => ({
          id: typeof tab.id === 'number' ? tab.id : idx + 1,
          folderId: null,
          title: typeof tab.title === 'string' ? tab.title : '',
          content: typeof tab.content === 'string' ? tab.content : '',
          images: Array.isArray(tab.images) ? tab.images : [],
          createdAt: Date.now() - (parsed.tabs.length - idx) * 1000,
          updatedAt: Date.now() - (parsed.tabs.length - idx) * 1000
        }));
        const noteIds = notes.map(n => n.id);
        return {
          notes,
          folders: [],
          nextNoteId: Math.max(...noteIds) + 1,
          nextFolderId: 1,
          activeFolderId: null,
          activeNoteId: null,
          viewMode: 'tiles'
        };
      }
    }
  } catch (error) {
    console.warn('Failed to load saved notes, resetting storage.', error);
  }
  return fallback;
};

const loadTodosState = () => {
  const fallback = createDefaultTodosState();
  if (typeof window === 'undefined' || !window?.localStorage) return fallback;
  const storage = window.localStorage;
  const sanitizeTabs = (tabs) => tabs.map(tab => ({
    id: typeof tab.id === 'number' ? tab.id : Number(tab.id) || Date.now(),
    title: typeof tab.title === 'string' ? tab.title : `List ${tab.id}`,
    items: Array.isArray(tab.items) ? tab.items.map(item => ({
      id: typeof item.id === 'number' ? item.id : Number(item.id) || Date.now(),
      text: typeof item.text === 'string' ? item.text : '',
      dueDate: item.dueDate || null,
      completedDate: item.completedDate || null,
      done: Boolean(item.done)
    })) : []
  }));

  try {
    const saved = storage.getItem('tidycode-todos-state') || storage.getItem('neonotepad-todos-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        const tabs = sanitizeTabs(parsed.tabs);
        const ids = tabs.map(tab => Number(tab.id) || 0);
        const candidateActive = Number(parsed.activeId);
        const nextCandidate = Number(parsed.nextId);
        return {
          tabs,
          activeId: tabs.find(tab => tab.id === candidateActive)?.id ?? tabs[0].id,
          nextId: Number.isFinite(nextCandidate) && nextCandidate > 0 ? nextCandidate : Math.max(...ids) + 1
        };
      }
    }

    const legacyTabs = storage.getItem('tidycode-todos') || storage.getItem('neonotepad-todos');
    if (legacyTabs) {
      const parsed = JSON.parse(legacyTabs);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const tabs = sanitizeTabs(parsed);
        const ids = tabs.map(tab => Number(tab.id) || 0);
        const legacyActive = Number(storage.getItem('tidycode-active-todo') || storage.getItem('neonotepad-active-todo'));
        storage.removeItem('tidycode-todos');
        storage.removeItem('tidycode-active-todo');
        storage.removeItem('neonotepad-todos');
        storage.removeItem('neonotepad-active-todo');
        return {
          tabs,
          activeId: tabs.find(tab => tab.id === legacyActive)?.id ?? tabs[0].id,
          nextId: Math.max(...ids) + 1
        };
      }
    }
  } catch (error) {
    console.warn('Failed to load saved todos, resetting storage.', error);
  }
  return fallback;
};

const loadThemePreference = () => {
  if (typeof window === 'undefined' || !window?.localStorage) return 'dark';
  try {
    return window.localStorage.getItem('tidycode-theme') || window.localStorage.getItem('neonotepad-theme') || 'dark';
  } catch {
    return 'dark';
  }
};

const loadFontSizePreference = () => {
  if (typeof window === 'undefined' || !window?.localStorage) return 'xs';
  try {
    return window.localStorage.getItem('tidycode-fontSize') || window.localStorage.getItem('neonotepad-fontSize') || 'xs';
  } catch {
    return 'xs';
  }
};

const getFontSizeClass = (size) => {
  const sizeMap = {
    '2xs': 'text-[10px]',
    'xs': 'text-xs',
    'sm': 'text-sm',
    'base': 'text-base'
  };
  return sizeMap[size] || 'text-xs';
};

const getLineHeight = (size) => {
  const lineHeightMap = {
    '2xs': 'leading-tight',
    'xs': 'leading-snug',
    'sm': 'leading-normal',
    'base': 'leading-relaxed'
  };
  return lineHeightMap[size] || 'leading-snug';
};

const RichTextEditor = ({ value, onChange, aiService, aiSettings, notify }) => {
  const editorRef = useRef(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [aiSuggestion, setAISuggestion] = useState(null);
  const [originalContent, setOriginalContent] = useState('');
  const notifyUser = notify || ((msg) => msg && alert(msg));

  useEffect(() => {
    if (!editorRef.current) return;
    const normalized = linkifyHtml(stripAnchors(value || ''));
    if (editorRef.current.innerHTML !== normalized) {
      editorRef.current.innerHTML = normalized;
    }
    if ((value || '') !== normalized) {
      onChange(normalized);
    }
  }, [value, onChange]);

  const exec = (command) => {
    document.execCommand(command, false, null);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const stripped = stripAnchors(html);
    const linkified = linkifyHtml(stripped);
    if (linkified !== html) {
      editorRef.current.innerHTML = linkified;
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    onChange(linkified);
  };

  const formatAIResponse = (text) => {
    // Check if the text contains markdown formatting
    const hasMarkdown = /[#*_`\[\]]/g.test(text) || /^[-*+]\s/m.test(text) || /^\d+\.\s/m.test(text);

    if (hasMarkdown) {
      // Text appears to be markdown, parse it
      try {
        const html = marked.parse(text, { breaks: true });
        return html;
      } catch (e) {
        console.error('Error parsing markdown:', e);
        // Fall through to plain text formatting
      }
    }

    // Format as plain text for better readability
    let formatted = text.replace(/([.!?])\s*/g, '$1 ');

    // Handle line breaks and paragraphs
    formatted = formatted.split('\n').map(line => line.trim()).filter(line => line).join('\n\n');

    // Remove excessive spacing
    formatted = formatted.replace(/\s{3,}/g, '  ');

    return formatted;
  };

  const handleAITransform = async (action) => {
    if (!aiService || !editorRef.current) return;

    setIsAIProcessing(true);
    setShowAIMenu(false);

    try {
      // Get text content without HTML tags
      const textContent = editorRef.current.innerText || editorRef.current.textContent || '';
      if (!textContent.trim()) {
        notifyUser('Please enter some text first');
        setIsAIProcessing(false);
        return;
      }

      // Store original content
      setOriginalContent(textContent);

      const transformed = await aiService.transformText(textContent, action, aiSettings);

      // Format the AI response
      const formatted = formatAIResponse(transformed);

      // Show suggestion for accept/reject
      setAISuggestion(formatted);
    } catch (error) {
      console.error('AI transformation error:', error);
      notifyUser(`AI transformation failed: ${error.message}`);
    } finally {
      setIsAIProcessing(false);
    }
  };

  const handleAcceptSuggestion = () => {
    if (!editorRef.current || !aiSuggestion) return;

    // Update editor with the AI suggestion
    // Check if it's HTML (markdown rendered) or plain text
    if (aiSuggestion.startsWith('<')) {
      editorRef.current.innerHTML = aiSuggestion;
      onChange(aiSuggestion);
    } else {
      editorRef.current.innerText = aiSuggestion;
      onChange(aiSuggestion);
    }

    // Clear suggestion
    setAISuggestion(null);
    setOriginalContent('');
  };

  const handleRejectSuggestion = () => {
    // Restore original content
    if (editorRef.current && originalContent) {
      editorRef.current.innerText = originalContent;
      onChange(originalContent);
    }

    // Clear suggestion
    setAISuggestion(null);
    setOriginalContent('');
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded">
      <div className="flex items-center justify-between gap-2 border-b border-gray-800 px-2 py-1 text-gray-400">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => exec('bold')} className="p-1 hover:text-white" title="Bold"><Bold className="w-4 h-4" /></button>
          <button type="button" onClick={() => exec('italic')} className="p-1 hover:text-white" title="Italic"><Italic className="w-4 h-4" /></button>
          <button type="button" onClick={() => exec('underline')} className="p-1 hover:text-white" title="Underline"><Underline className="w-4 h-4" /></button>
        </div>
        {aiService && aiSettings?.provider !== 'tinyllm' && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAIMenu(!showAIMenu)}
              disabled={isAIProcessing || aiSuggestion}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${(isAIProcessing || aiSuggestion) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800 hover:text-white'}`}
              title="AI Tools"
            >
              {isAIProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>AI</span>
            </button>
            {showAIMenu && !aiSuggestion && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-10 min-w-[160px]">
                <button
                  type="button"
                  onClick={() => handleAITransform('improve')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                >
                  Improve Writing
                </button>
                <button
                  type="button"
                  onClick={() => handleAITransform('rewrite')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                >
                  Rewrite
                </button>
                <button
                  type="button"
                  onClick={() => handleAITransform('rephrase')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                >
                  Rephrase
                </button>
                <button
                  type="button"
                  onClick={() => handleAITransform('fix-grammar')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                >
                  Fix Grammar
                </button>
                <button
                  type="button"
                  onClick={() => handleAITransform('summarize')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                >
                  Summarize
                </button>
                <button
                  type="button"
                  onClick={() => handleAITransform('expand')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                >
                  Expand
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Suggestion Preview */}
      {aiSuggestion && (
        <div className="border-b border-gray-700 bg-gray-800 p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-gray-200">AI Suggestion</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAcceptSuggestion}
                className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition-colors"
                title="Accept Suggestion"
              >
                <Check className="w-3 h-3" />
                Accept
              </button>
              <button
                type="button"
                onClick={handleRejectSuggestion}
                className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
                title="Reject Suggestion"
              >
                <XCircle className="w-3 h-3" />
                Reject
              </button>
            </div>
          </div>
          <div
            className="bg-gray-900 rounded p-3 text-gray-200 text-sm max-h-[200px] overflow-y-auto prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: aiSuggestion.startsWith('<') ? aiSuggestion : `<pre style="white-space: pre-wrap; margin: 0;">${aiSuggestion}</pre>` }}
          />
        </div>
      )}

      <div
        ref={editorRef}
        className="min-h-[160px] px-3 py-2 focus:outline-none"
        contentEditable={!aiSuggestion}
        onInput={handleInput}
      />
    </div>
  );
};

const TidyCode = () => {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [nextId, setNextId] = useState(1);
  const openPathsRef = useRef(new Set()); // Tracks already-open absolute paths
  const openingPathsRef = useRef(new Set()); // Tracks paths currently being opened to avoid duplicates
  const nextIdRef = useRef(1); // Track next ID synchronously
  const [pendingAutoFormat, setPendingAutoFormat] = useState(null);
  const pendingEditorFocusTabIdRef = useRef(null);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const tabCursorPositionsRef = useRef(new Map()); // Map<tabId, { pos, line, column }>
  const [tipsCollapsed, setTipsCollapsed] = useState(true);
  const [braceMatch, setBraceMatch] = useState(null);
  const [findValue, setFindValue] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  // Tab-specific state stored as maps keyed by tab ID
  const [tabSearchResults, setTabSearchResults] = useState({});
  const [tabShowSearchResults, setTabShowSearchResults] = useState({});
  const [tabErrorMessages, setTabErrorMessages] = useState({});
  const [structureCollapsed, setStructureCollapsed] = useState({});
  const requestEditorFocus = useCallback((tabId) => {
    if (tabId == null) return;
    pendingEditorFocusTabIdRef.current = tabId;
  }, []);
  const requestEditorFocusOnNextActive = useCallback(() => {
    pendingEditorFocusTabIdRef.current = 'any';
  }, []);

  // Computed values for current tab's state
  const searchResults = activeTabId ? (tabSearchResults[activeTabId] || []) : [];
  const showSearchResults = activeTabId ? (tabShowSearchResults[activeTabId] || false) : false;
  const errorMessage = activeTabId ? (tabErrorMessages[activeTabId] || null) : null;

  // Helper functions to update tab-specific state
  const setSearchResults = (results) => {
    if (activeTabId) {
      setTabSearchResults(prev => ({ ...prev, [activeTabId]: results }));
    }
  };

  const setShowSearchResults = (show) => {
    if (activeTabId) {
      setTabShowSearchResults(prev => ({ ...prev, [activeTabId]: show }));
    }
  };

  const setErrorMessage = (error) => {
    if (activeTabId) {
      setTabErrorMessages(prev => ({ ...prev, [activeTabId]: error }));
    }
  };
  const [structurePanelVisible, setStructurePanelVisible] = useState(true);
  const [showConvertDropdown, setShowConvertDropdown] = useState(false);
  const convertDropdownRef = useRef(null);
  const [infoPanelHeight, setInfoPanelHeight] = useState(150);
  const infoPanelResizing = useRef(false);
  const [currentPanel, setCurrentPanel] = useState('dev');
  const initialNotesStateRef = useRef(loadNotesState());
  const initialTodosStateRef = useRef(loadTodosState());
  const [notes, setNotes] = useState(initialNotesStateRef.current.notes);
  const [folders, setFolders] = useState(initialNotesStateRef.current.folders);
  const [activeFolderId, setActiveFolderId] = useState(initialNotesStateRef.current.activeFolderId);
  const [activeNoteId, setActiveNoteId] = useState(initialNotesStateRef.current.activeNoteId);
  const [nextNoteId, setNextNoteId] = useState(initialNotesStateRef.current.nextNoteId);
  const [nextFolderId, setNextFolderId] = useState(initialNotesStateRef.current.nextFolderId);
  const [notesViewMode, setNotesViewMode] = useState(initialNotesStateRef.current.viewMode || 'tiles');
  const [openNoteModalId, setOpenNoteModalId] = useState(null);
  const [isQuickNoteExpanded, setIsQuickNoteExpanded] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickNoteTitle, setQuickNoteTitle] = useState('');
  const [quickNoteImages, setQuickNoteImages] = useState([]);
  const [isQuickNoteAIProcessing, setIsQuickNoteAIProcessing] = useState(false);
  const [showQuickNoteAIMenu, setShowQuickNoteAIMenu] = useState(false);
  const [quickNoteAISuggestion, setQuickNoteAISuggestion] = useState(null);
  const [quickNoteOriginalText, setQuickNoteOriginalText] = useState('');
  const [todoTabs, setTodoTabs] = useState(initialTodosStateRef.current.tabs);
  const [activeTodoTabId, setActiveTodoTabId] = useState(initialTodosStateRef.current.activeId);
  const [nextTodoId, setNextTodoId] = useState(initialTodosStateRef.current.nextId);
  const [notesSidebarWidth, setNotesSidebarWidth] = useState(288);
  const [todoSidebarWidth, setTodoSidebarWidth] = useState(256);
  const [csvPreviewHeight, setCsvPreviewHeight] = useState(DEFAULT_CSV_PREVIEW_HEIGHT);
  const [csvColumnWidths, setCsvColumnWidths] = useState({});
  const [isCsvEditorCollapsed, setIsCsvEditorCollapsed] = useState(false);
  const [csvEditMap, setCsvEditMap] = useState({});
  const [activeCsvRowIndex, setActiveCsvRowIndex] = useState(null);
  const [csvDetectionMessage, setCsvDetectionMessage] = useState(null);
  const [csvDetectionLocks, setCsvDetectionLocks] = useState({});
  const [markdownDetectionMessage, setMarkdownDetectionMessage] = useState(null);
  const [markdownPreviewHeight, setMarkdownPreviewHeight] = useState(DEFAULT_CSV_PREVIEW_HEIGHT);
  const [isMarkdownPreviewCollapsed, setIsMarkdownPreviewCollapsed] = useState(false);
  const [appMessage, setAppMessage] = useState(null);
  const appMessageTimeoutRef = useRef(null);

  const showTransientMessage = useCallback((message, tone = 'info') => {
    if (!message) return;
    if (appMessageTimeoutRef.current) {
      clearTimeout(appMessageTimeoutRef.current);
    }
    setAppMessage({ message, tone });
    appMessageTimeoutRef.current = setTimeout(() => setAppMessage(null), 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (appMessageTimeoutRef.current) {
        clearTimeout(appMessageTimeoutRef.current);
      }
    };
  }, []);
  const [searchResultsHeight, setSearchResultsHeight] = useState(DEFAULT_SEARCH_RESULTS_HEIGHT);
  const [tabsExplorerHeight, setTabsExplorerHeight] = useState(DEFAULT_FILE_EXPLORER_HEIGHT);
  const [theme, setTheme] = useState(loadThemePreference);
  const [fontSize, setFontSize] = useState(loadFontSizePreference);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [aboutInfo, setAboutInfo] = useState(null);
  const [autoPairingEnabled, setAutoPairingEnabled] = useState(true);
  const [moveMenuFolderId, setMoveMenuFolderId] = useState(null);

  // Help modal state
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpContentType, setHelpContentType] = useState(null); // 'welcome', 'tips', 'documentation', 'releases'

  // Privacy banner state (show once for new users)
  const [showPrivacyBanner, setShowPrivacyBanner] = useState(() => {
    const dismissed = localStorage.getItem('privacy-banner-dismissed');
    return !dismissed && !isDesktop(); // Only show in web mode and if not dismissed
  });

  // VIM mode state
  const [vimEnabled, setVimEnabled] = useState(() => {
    const saved = localStorage.getItem('vim-mode-enabled');
    return saved === 'true';
  });
  const [vimMode, setVimMode] = useState('normal'); // 'normal', 'insert', 'visual'
  const [vimRegister, setVimRegister] = useState(''); // For yank/delete operations
  const [vimVisualStart, setVimVisualStart] = useState(null); // Visual mode start position

  // AI Fix state
  const [aiFixState, setAIFixState] = useState({
    isLoading: false,
    fixedContent: null,
    originalContent: null,
    showDiff: false,
    error: null,
    progress: null
  });
  const [showAISettings, setShowAISettings] = useState(false);
  const [showOllamaSetup, setShowOllamaSetup] = useState(false);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [diffTabsData, setDiffTabsData] = useState({ left: null, right: null });

  // PDF/SVG Viewer state
  const [showPDFViewer, setShowPDFViewer] = useState(false);
  const [showSVGViewer, setShowSVGViewer] = useState(false);
  const [pdfViewerData, setPDFViewerData] = useState(null);
  const [svgViewerData, setSVGViewerData] = useState(null);

  const [showTabsExplorer, setShowTabsExplorer] = useState(() => {
    // Always show Tabs Explorer by default (both web and desktop)
    console.log('[Panel Init] Tabs Explorer should show: true');
    return true;
  });
  const [showFileSystemBrowser, setShowFileSystemBrowser] = useState(() => {
    const value = isDesktop();
    console.log('[Panel Init] File System Browser should show:', value);
    return value;
  });
  const [fileSystemBrowserRootPath, setFileSystemBrowserRootPath] = useState('');
  const [fileSystemBrowserSelectedFile, setFileSystemBrowserSelectedFile] = useState('');
  // Ref to suppress FileSystemBrowser scroll when selection comes from TabsExplorer
  const suppressFileSystemBrowserScrollRef = useRef(false);
  // Ref to TabsExplorer for scrolling to active tab
  const tabsExplorerRef = useRef(null);
  const [showTerminalPanel, setShowTerminalPanel] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const [quickOpenResults, setQuickOpenResults] = useState([]);
  const [quickOpenSelectedIndex, setQuickOpenSelectedIndex] = useState(0);
  const [vimWasEnabledBeforeQuickOpen, setVimWasEnabledBeforeQuickOpen] = useState(false);

  const [aiSettings, setAISettings] = useState(() => {
    // Default settings - use TinyLLM (free, browser-based, no API key needed)
    return {
      provider: AI_PROVIDERS.TINYLLM,
      groqApiKey: '',
      groqModel: GROQ_MODELS['llama-3.3-70b'].id,
      openaiApiKey: '',
      openaiModel: 'gpt-4o-mini',
      claudeApiKey: '',
      claudeModel: 'claude-3-5-haiku-20241022',
      ollamaModel: 'llama3.1:8b', // Desktop only - best for large files
      enableLSP: false,
      lspConfig: {
        javascript: { mode: 'bundled', customCommand: '' },
        typescript: { mode: 'bundled', customCommand: '' },
        python: { mode: 'bundled', customCommand: '' },
        rust: { mode: 'bundled', customCommand: '' },
        java: { mode: 'bundled', customCommand: '' },
        cpp: { mode: 'bundled', customCommand: '' },
        php: { mode: 'bundled', customCommand: '' }
      }
    };
  });
  // AI Service instance (platform-aware)
  const [aiService, setAIService] = useState(null);
  const [dragFolderId, setDragFolderId] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [dragNoteId, setDragNoteId] = useState(null);
  const [dragOverNoteFolderId, setDragOverNoteFolderId] = useState(null);
  const noteDragPreviewRef = useRef(null);
  const isNoteDragging = dragNoteId !== null;
  const isFolderDragging = dragFolderId !== null;
  const [structureWidth, setStructureWidth] = useState(288);
  const [leftPanelWidth, setLeftPanelWidth] = useState(280); // Width of file explorer/file system browser panel
  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoDueDate, setNewTodoDueDate] = useState('');
  const [isNavCollapsed, setIsNavCollapsed] = useState(true);
  const [draggedTabId, setDraggedTabId] = useState(null);
  const [dragOverTabId, setDragOverTabId] = useState(null);
  const [tabContextMenu, setTabContextMenu] = useState(null);
  const textareaRef = useRef(null);
  const codeMirrorRef = useRef(null);
  const autoFormatTimeoutRef = useRef(null);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const braceOverlayRef = useRef(null);
  const errorOverlayRef = useRef(null);
  const syntaxOverlayRef = useRef(null);
  const terminalPanelRef = useRef(null);
  const lineNumberRef = useRef(null);
  const pendingCursorRef = useRef(null);
  const lastCursorRef = useRef({ line: 1, column: 1 });
  const cursorUpdateThrottleRef = useRef(null);
  const braceMatchCacheRef = useRef({ contentHash: null, pos: null, result: null });
  const braceMatchThrottleRef = useRef(null);
  const structureRef = useRef(null);
  const activeStructureNodeRef = useRef(null);
  const structureDragState = useRef({ active: false, startX: 0, startWidth: 288 });
  const leftPanelDragState = useRef({ active: false, startX: 0, startWidth: 280 }); // For file explorer/file system panel
  const notesSidebarDragState = useRef({ active: false, startX: 0, startWidth: 288 });
  const todoSidebarDragState = useRef({ active: false, startX: 0, startWidth: 256 });
  const csvPreviewDragState = useRef({ active: false, startY: 0, startHeight: DEFAULT_CSV_PREVIEW_HEIGHT });
  const csvColumnDragState = useRef({ active: false, startX: 0, startWidth: DEFAULT_CSV_COLUMN_WIDTH, columnIndex: null, tabId: null });
  const markdownPreviewDragState = useRef({ active: false, startY: 0, startHeight: DEFAULT_CSV_PREVIEW_HEIGHT });
  const searchResultsDragState = useRef({ active: false, startY: 0, startHeight: DEFAULT_SEARCH_RESULTS_HEIGHT });
  const csvPreviewRowRefs = useRef(new Map());
  const csvEditorRowRefs = useRef(new Map());
  const csvDetectionMessageTimeoutRef = useRef(null);
  const markdownDetectionMessageTimeoutRef = useRef(null);
  const settingsMenuRef = useRef(null);
  const newTodoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const markdownPreviewRef = useRef(null);
  const quickNoteInputRef = useRef(null);
  const quickNoteContainerRef = useRef(null);
  const noteModalRef = useRef(null);
  const tabContainerRef = useRef(null);
  const tabElementRefs = useRef(new Map());
  const syncScrollVisuals = useCallback(() => {
    if (!textareaRef.current) return;
    const scrollTop = textareaRef.current.scrollTop;
    const scrollLeft = textareaRef.current.scrollLeft;

    if (syntaxOverlayRef.current) {
      syntaxOverlayRef.current.style.transform = `translate(${-scrollLeft}px, -${scrollTop}px)`;
    }
    if (braceOverlayRef.current) {
      braceOverlayRef.current.style.transform = `translate(${-scrollLeft}px, -${scrollTop}px)`;
    }
    if (errorOverlayRef.current) {
      errorOverlayRef.current.style.transform = `translate(${-scrollLeft}px, -${scrollTop}px)`;
    }
    if (lineNumberRef.current) {
      lineNumberRef.current.style.transform = `translateY(-${scrollTop}px)`;
    }
  }, []);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    return () => {
      if (csvDetectionMessageTimeoutRef.current) {
        clearTimeout(csvDetectionMessageTimeoutRef.current);
      }
      if (markdownDetectionMessageTimeoutRef.current) {
        clearTimeout(markdownDetectionMessageTimeoutRef.current);
      }
    };
  }, []);

  // Persist VIM mode preference
  useEffect(() => {
    localStorage.setItem('vim-mode-enabled', vimEnabled);
  }, [vimEnabled]);

  // Update File Browser selected file when active tab changes
  useEffect(() => {
    if (activeTabId !== null) {
      const activeTab = tabs.find(tab => tab.id === activeTabId);
      if (activeTab && (activeTab.absolutePath || activeTab.filePath)) {
        const filePath = activeTab.absolutePath || activeTab.filePath;
        console.log('[FileSystemBrowser] Active tab changed to:', activeTab.title, 'path:', filePath);
        setFileSystemBrowserSelectedFile(filePath);
      } else {
        // Clear selection if active tab has no file path
        setFileSystemBrowserSelectedFile('');
      }
    }
  }, [activeTabId, tabs]);

  // Create refs for functions that will be called from menu handlers
  const createNewTabRef = useRef(null);
  const saveFileRef = useRef(null);
  const saveFileAsRef = useRef(null);
  const closeTabRef = useRef(null);

  // Listen for native menu events (desktop only)
  useEffect(() => {
    if (!isDesktop()) {
      console.log('[Menu] Not desktop, skipping menu listeners');
      return;
    }

    console.log('[Menu] Setting up menu event listeners...');
    const unlisten = [];
    let isSubscribed = true;

    const setupMenuListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        if (!isSubscribed) return;

        console.log('[Menu] Successfully imported Tauri event API');

        // File menu
        const unlistenNewFile = await listen('menu:new_file', () => {
          console.log('[Menu Event] New File triggered');
          createNewTabRef.current?.();
        });
        unlisten.push(unlistenNewFile);

        const unlistenOpenFile = await listen('menu:open_file', () => {
          console.log('[Menu Event] Open File triggered');
          if (isDesktop()) {
            openFileWithDialog();
          } else {
            fileInputRef.current?.click();
          }
        });
        unlisten.push(unlistenOpenFile);

        const unlistenOpenRecent = await listen('menu:open_recent_item', (event) => {
          const filePath = event?.payload;
          console.log('[Menu Event] Open Recent triggered for', filePath);
          if (filePath) {
            openFileIfNotOpen(filePath);
          }
        });
        unlisten.push(unlistenOpenRecent);

        const unlistenSaveFile = await listen('menu:save_file', () => {
          console.log('[Menu Event] Save File triggered');
          saveFileRef.current?.();
        });
        unlisten.push(unlistenSaveFile);

        const unlistenSaveAs = await listen('menu:save_as', () => {
          console.log('[Menu Event] Save As triggered');
          saveFileAsRef.current?.();
        });
        unlisten.push(unlistenSaveAs);

        const unlistenCloseTab = await listen('menu:close_tab', () => {
          console.log('[Menu Event] Close Tab triggered');
          // Get current activeTabId from the callback
          setActiveTabId(currentId => {
            if (currentId && closeTabRef.current) {
              closeTabRef.current(currentId);
            }
            return currentId;
          });
        });
        unlisten.push(unlistenCloseTab);

        // Edit menu
        const unlistenUndo = await listen('menu:undo', () => {
          console.log('[Menu Event] Undo triggered');
          document.execCommand('undo');
        });
        unlisten.push(unlistenUndo);

        const unlistenRedo = await listen('menu:redo', () => {
          console.log('[Menu Event] Redo triggered');
          document.execCommand('redo');
        });
        unlisten.push(unlistenRedo);

        const unlistenCut = await listen('menu:cut', () => {
          console.log('[Menu Event] Cut triggered');
          document.execCommand('cut');
        });
        unlisten.push(unlistenCut);

        const unlistenCopy = await listen('menu:copy', () => {
          console.log('[Menu Event] Copy triggered');
          document.execCommand('copy');
        });
        unlisten.push(unlistenCopy);

        const unlistenPaste = await listen('menu:paste', () => {
          console.log('[Menu Event] Paste triggered');
          document.execCommand('paste');
        });
        unlisten.push(unlistenPaste);

        const unlistenFind = await listen('menu:find', () => {
          console.log('[Menu Event] Find triggered');
          // Don't handle if VIM mode is active and editor has focus
          // This allows Ctrl-f to work as VIM page-down
          if (vimEnabled && codeMirrorRef.current?.getView) {
            try {
              const view = codeMirrorRef.current.getView();
              if (view && view.dom.contains(document.activeElement)) {
                console.log('[Menu Event] Ignoring Find - VIM mode active with editor focused');
                return;
              }
            } catch (e) {
              // Ignore errors, proceed with find
            }
          }
          setShowFindReplace(true);
        });
        unlisten.push(unlistenFind);

        const unlistenReplace = await listen('menu:replace', () => {
          console.log('[Menu Event] Replace triggered');
          setShowFindReplace(true);
        });
        unlisten.push(unlistenReplace);

        // View menu
        const unlistenToggleExplorer = await listen('menu:toggle_explorer', () => {
          // Don't handle if VIM mode is active and editor has focus
          // This allows Ctrl-b to work as VIM page-up
          if (vimEnabled && codeMirrorRef.current?.getView) {
            try {
              const view = codeMirrorRef.current.getView();
              if (view && view.dom.contains(document.activeElement)) {
                console.log('[Menu Event] Ignoring Toggle Explorer - VIM mode active with editor focused');
                return;
              }
            } catch (e) {
              // Ignore errors, proceed with toggle
            }
          }
          setShowTabsExplorer(prev => !prev);
        });
        unlisten.push(unlistenToggleExplorer);

        const unlistenToggleSidebar = await listen('menu:toggle_sidebar', () => {
          setStructurePanelVisible(prev => !prev);
        });
        unlisten.push(unlistenToggleSidebar);

        const unlistenNewTerminal = await listen('menu:new_terminal', () => {
          setShowTerminalPanel(true);
          // Always create a new terminal when menu option is clicked
          setTimeout(() => {
            if (terminalPanelRef.current) {
              terminalPanelRef.current.addTerminal();
            }
          }, 100);
        });
        unlisten.push(unlistenNewTerminal);

        const unlistenToggleTerminal = await listen('menu:toggle_terminal', () => {
          setShowTerminalPanel(prev => !prev);
        });
        unlisten.push(unlistenToggleTerminal);

        const unlistenIncreaseFont = await listen('menu:increase_font', () => {
          console.log('[Menu Event] Increase Font triggered');
          setFontSize(current => {
            const sizes = ['2xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl'];
            const currentIndex = sizes.indexOf(current);
            if (currentIndex < sizes.length - 1) {
              return sizes[currentIndex + 1];
            }
            return current;
          });
        });
        unlisten.push(unlistenIncreaseFont);

        const unlistenDecreaseFont = await listen('menu:decrease_font', () => {
          console.log('[Menu Event] Decrease Font triggered');
          setFontSize(current => {
            const sizes = ['2xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl'];
            const currentIndex = sizes.indexOf(current);
            if (currentIndex > 0) {
              return sizes[currentIndex - 1];
            }
            return current;
          });
        });
        unlisten.push(unlistenDecreaseFont);

        // Preferences / Settings
        const unlistenPreferences = await listen('menu:preferences', () => {
          console.log('[Menu Event] Preferences triggered');
          setIsSettingsOpen(true);
        });
        unlisten.push(unlistenPreferences);

        const unlistenAbout = await listen('menu:about', (event) => {
          console.log('[Menu Event] About triggered', event?.payload);
          setAboutInfo(event?.payload || null);
          setShowAboutModal(true);
        });
        unlisten.push(unlistenAbout);

        // Help menu listeners
        const unlistenHelpWelcome = await listen('menu:help_welcome', async () => {
          console.log('[Menu Event] Help Welcome triggered');
          if (isDesktop()) {
            // Open external URL in default browser for desktop
            await openUrl(HELP_URLS.welcome);
          } else {
            // Show modal for web
            setHelpContentType('welcome');
            setShowHelpModal(true);
          }
        });
        unlisten.push(unlistenHelpWelcome);

        const unlistenHelpTips = await listen('menu:help_tips', async () => {
          console.log('[Menu Event] Help Tips triggered');
          if (isDesktop()) {
            await openUrl(HELP_URLS.tips);
          } else {
            setHelpContentType('tips');
            setShowHelpModal(true);
          }
        });
        unlisten.push(unlistenHelpTips);

        const unlistenHelpDocs = await listen('menu:help_docs', async () => {
          console.log('[Menu Event] Help Documentation triggered');
          if (isDesktop()) {
            await openUrl(HELP_URLS.documentation);
          } else {
            setHelpContentType('documentation');
            setShowHelpModal(true);
          }
        });
        unlisten.push(unlistenHelpDocs);

        const unlistenHelpReleases = await listen('menu:help_releases', async () => {
          console.log('[Menu Event] Help Release Notes triggered');
          if (isDesktop()) {
            await openUrl(HELP_URLS.releases);
          } else {
            setHelpContentType('releases');
            setShowHelpModal(true);
          }
        });
        unlisten.push(unlistenHelpReleases);

        // Edit extras
        const unlistenDelete = await listen('menu:delete', () => {
          console.log('[Menu Event] Delete triggered');
          document.execCommand('delete');
        });
        unlisten.push(unlistenDelete);

        const unlistenSelectAll = await listen('menu:select_all', () => {
          console.log('[Menu Event] Select All triggered');
          document.execCommand('selectAll');
        });
        unlisten.push(unlistenSelectAll);

        // Window / view controls (desktop only)
        const { appWindow } = await import('@tauri-apps/api/window');

        const unlistenCloseWindow = await listen('menu:close_window', () => {
          console.log('[Menu Event] Close Window triggered');
          appWindow.close();
        });
        unlisten.push(unlistenCloseWindow);

        const unlistenToggleFullscreen = await listen('menu:toggle_fullscreen', async () => {
          try {
            const isFullscreen = await appWindow.isFullscreen();
            await appWindow.setFullscreen(!isFullscreen);
          } catch (err) {
            console.error('[Menu Event] Failed to toggle fullscreen', err);
          }
        });
        unlisten.push(unlistenToggleFullscreen);

        const unlistenMinimize = await listen('menu:minimize_window', () => {
          appWindow.minimize();
        });
        unlisten.push(unlistenMinimize);

        const unlistenZoom = await listen('menu:zoom_window', async () => {
          try {
            const isMaximized = await appWindow.isMaximized();
            if (isMaximized) {
              await appWindow.unmaximize();
            } else {
              await appWindow.maximize();
            }
          } catch (err) {
            console.error('[Menu Event] Failed to toggle zoom', err);
          }
        });
        unlisten.push(unlistenZoom);

        const unlistenBringAllToFront = await listen('menu:bring_all_to_front', async () => {
          try {
            await appWindow.show();
            await appWindow.setFocus();
          } catch (err) {
            console.error('[Menu Event] Failed to bring window to front', err);
          }
        });
        unlisten.push(unlistenBringAllToFront);

        const unlistenHideApp = await listen('menu:hide_app', () => {
          appWindow.hide();
        });
        unlisten.push(unlistenHideApp);

        const unlistenHideOthers = await listen('menu:hide_others', () => {
          // Single-window app: treat hide others same as hide self
          appWindow.hide();
        });
        unlisten.push(unlistenHideOthers);

        const unlistenShowAll = await listen('menu:show_all', async () => {
          try {
            await appWindow.show();
            await appWindow.setFocus();
          } catch (err) {
            console.error('[Menu Event] Failed to show window', err);
          }
        });
        unlisten.push(unlistenShowAll);

        console.log(`[Menu] Successfully registered ${unlisten.length} menu event listeners`);
      } catch (error) {
        console.error('[Menu] Failed to setup menu listeners:', error);
      }
    };

    setupMenuListeners();

    // Cleanup
    return () => {
      isSubscribed = false;
      unlisten.forEach(fn => fn());
    };
  }, []); // Empty deps - refs will always have latest functions

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    if (!body) return;
    body.classList.remove('theme-dark', 'theme-light');
    const applied = theme === 'dark' ? 'theme-dark' : 'theme-light';
    body.classList.add(applied);
    if (typeof window !== 'undefined' && window?.localStorage) {
      try {
        window.localStorage.setItem('tidycode-theme', theme);
      } catch {
        // ignore storage errors
      }
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window?.localStorage) {
      try {
        window.localStorage.setItem('tidycode-fontSize', fontSize);
      } catch {
        // ignore storage errors
      }
    }
  }, [fontSize]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const handleClick = (event) => {
      if (!settingsMenuRef.current) return;
      if (!settingsMenuRef.current.contains(event.target)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isSettingsOpen]);

  // Auto-focus on todo input when panel is opened
  useEffect(() => {
    if (currentPanel === 'todo' && newTodoInputRef.current) {
      newTodoInputRef.current.focus();
    }
  }, [currentPanel]);

  useEffect(() => {
    if (isQuickNoteExpanded && quickNoteInputRef.current) {
      quickNoteInputRef.current.focus();
    }
  }, [isQuickNoteExpanded]);

  useEffect(() => {
    if (!openNoteModalId) return;
    const handleModalClickOutside = (event) => {
      if (noteModalRef.current && noteModalRef.current.contains(event.target)) return;
      setOpenNoteModalId(null);
    };
    document.addEventListener('mousedown', handleModalClickOutside);
    return () => document.removeEventListener('mousedown', handleModalClickOutside);
  }, [openNoteModalId]);

  useEffect(() => {
    const handleMoveMenuOutside = (event) => {
      const target = event.target;
      if (target?.closest?.('[data-move-menu="true"]')) return;
      if (target?.closest?.('[data-move-toggle="true"]')) return;
      if (moveMenuFolderId !== null) setMoveMenuFolderId(null);
    };
    document.addEventListener('mousedown', handleMoveMenuOutside);
    return () => document.removeEventListener('mousedown', handleMoveMenuOutside);
  }, [moveMenuFolderId]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => {
      if (tabContextMenu) {
        setTabContextMenu(null);
      }
    };

    if (tabContextMenu) {
      document.addEventListener('mousedown', handleClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [tabContextMenu]);

  // Close convert dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (convertDropdownRef.current && !convertDropdownRef.current.contains(e.target)) {
        setShowConvertDropdown(false);
      }
    };

    if (showConvertDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showConvertDropdown]);

  // Keyboard shortcuts for Save and Save As
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + S for Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        saveFile();
      }
      // Ctrl/Cmd + Shift + S for Save As
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 's') {
        e.preventDefault();
        saveFileAs();
      }
      // Ctrl/Cmd + P for Quick Open (desktop only)
      if ((e.ctrlKey || e.metaKey) && e.key === 'p' && isDesktop()) {
        e.preventDefault();
        e.stopPropagation(); // Stop event from reaching CodeMirror Vim handler

        // If Vim mode is enabled, temporarily disable it
        if (vimEnabled) {
          setVimWasEnabledBeforeQuickOpen(true);
          setVimEnabled(false);
        }

        setShowQuickOpen(true);
        setQuickOpenQuery('');
        setQuickOpenSelectedIndex(0);
      }
    };

    // Use capture phase to intercept before CodeMirror's Vim extension
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [activeTabId, tabs, vimEnabled]); // Dependencies to ensure we have latest data

  // Load tabs from localStorage on mount
  useEffect(() => {
    const loadTabs = () => {
      const savedTabs = localStorage.getItem('notepad-tabs');
      const savedActiveId = localStorage.getItem('notepad-active-tab');

      if (savedTabs) {
        try {
          const parsed = JSON.parse(savedTabs);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Ensure content is always a string, preserve PDF flag
            const sanitizedTabs = parsed.map(tab => ({
              ...tab,
              content: String(tab.content || ''),
              title: String(tab.title || 'Untitled'),
              absolutePath: tab.absolutePath || null,
              isPDF: tab.isPDF || false
            }));

            // Deduplicate by absolutePath when available and ensure unique IDs
            const seenPaths = new Set();
            const seenIds = new Set();
            let nextIdCandidate = 1;
            const deduped = [];

            for (const tab of sanitizedTabs) {
              const pathKey = tab.absolutePath ? normalizeForComparison(tab.absolutePath) : null;
              if (pathKey && seenPaths.has(pathKey)) {
                continue; // skip duplicate of same file
              }

              let id = tab.id;
              if (typeof id !== 'number' || seenIds.has(id)) {
                id = nextIdCandidate;
                nextIdCandidate += 1;
              }
              seenIds.add(id);
              if (pathKey) seenPaths.add(pathKey);

              deduped.push({ ...tab, id, absolutePath: pathKey || null });
            }

            const effectiveActiveId = (() => {
              const desired = savedActiveId ? parseInt(savedActiveId, 10) : deduped[0]?.id;
              if (deduped.find(t => t.id === desired)) return desired || null;
              return deduped[0]?.id || null;
            })();

            const next = Math.max(...deduped.map(t => t.id), nextIdCandidate - 1, 0) + 1;

            setTabs(deduped);
            setActiveTabId(effectiveActiveId);
            setNextId(next);
            nextIdRef.current = next;
            return;
          }
        } catch (error) {
          console.warn('Failed to load saved tabs, resetting storage.', error);
          localStorage.removeItem('notepad-tabs');
          localStorage.removeItem('notepad-active-tab');
        }
      }
      // Create Welcome tab on first access
      const welcomeTab = {
        id: 1,
        title: 'Welcome',
        content: '',
        isModified: false,
        filePath: null
      };
      setTabs([welcomeTab]);
      setActiveTabId(welcomeTab.id);
      setNextId(2);
      nextIdRef.current = 2;
    };

    loadTabs();
  }, []);

  // Reload PDF content for restored PDF tabs (desktop mode only)
  // In web mode, PDFs are restored via IndexedDB file handles in the TabRestore logic
  useEffect(() => {
    if (!isDesktop()) return; // Only run in desktop mode

    const reloadPDFTabs = async () => {
      for (const tab of tabs) {
        if (tab.isPDF && !tab.pdfContent && tab.absolutePath) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            try {
              await invoke('store_security_bookmark', { filePath: tab.absolutePath });
            } catch (error) {
              console.warn('[PDF reload] Failed to store security bookmark:', error);
            }
            const { readFile } = await import('./utils/fileReader');
            const content = await readFile(tab.absolutePath);

            setTabs(prevTabs => prevTabs.map(t =>
              t.id === tab.id
                ? { ...t, pdfContent: content instanceof Uint8Array ? content : new Uint8Array(content) }
                : t
            ));
          } catch (error) {
            console.error(`Failed to reload PDF tab: ${tab.title}`, error);
          }
        }
      }
    };

    reloadPDFTabs();
  }, [tabs.length]); // Only run when tabs array length changes (on initial load)

  // Save tabs to localStorage whenever they change (debounced for performance)
  useEffect(() => {
    if (tabs.length === 0) return;

    // Debounce localStorage writes to prevent excessive disk I/O on Windows
    const timeoutId = setTimeout(() => {
      try {
        // Sanitize tabs to only include serializable properties
        // For large files or files with absolutePath, don't save content (will reload from disk)
        const sanitizedTabs = tabs.map(tab => {
          // Don't save content if file is from disk (has absolutePath) or content is large
          const shouldSaveContent = !tab.absolutePath &&
                                   (!tab.content || tab.content.length < 100000); // 100KB limit

          return {
            id: tab.id,
            title: tab.title,
            content: shouldSaveContent ? tab.content : '',
            isModified: tab.isModified,
            filePath: tab.filePath,
            absolutePath: tab.absolutePath ? normalizeForComparison(tab.absolutePath) : null,
            isPDF: tab.isPDF || false  // Save PDF flag so we can reload it properly
          };
        });
        localStorage.setItem('notepad-tabs', JSON.stringify(sanitizedTabs));
        if (activeTabId !== null) {
          localStorage.setItem('notepad-active-tab', activeTabId.toString());
        }
      } catch (error) {
        console.warn('Failed to save tabs to localStorage:', error);
        // If still failing, try to clear old data and save minimal state
        try {
          localStorage.removeItem('notepad-tabs');
          localStorage.removeItem('notepad-active-tab');
        } catch (e) {
          console.error('Failed to clear localStorage:', e);
        }
      }
    }, 300); // 300ms debounce - balances responsiveness with performance

    return () => clearTimeout(timeoutId);
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window?.localStorage) return;

    // Debounce notes state saves for better performance
    const timeoutId = setTimeout(() => {
      try {
        window.localStorage.setItem('tidycode-notes-state-v2', JSON.stringify({
          notes,
          folders,
          nextNoteId,
          nextFolderId,
          activeFolderId,
          activeNoteId,
          viewMode: notesViewMode
        }));
      } catch (error) {
        console.warn('Failed to save notes', error);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [notes, folders, nextNoteId, nextFolderId, activeFolderId, activeNoteId, notesViewMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window?.localStorage) return;

    // Debounce todos state saves for better performance
    const timeoutId = setTimeout(() => {
      try {
        window.localStorage.setItem('tidycode-todos-state', JSON.stringify({
          tabs: todoTabs,
          activeId: activeTodoTabId,
          nextId: nextTodoId
        }));
      } catch (error) {
        console.warn('Failed to save todos', error);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [todoTabs, activeTodoTabId, nextTodoId]);

  // Load AI settings on mount (async decryption)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await loadSecureSettings();
        if (settings) {
          setAISettings(prev => ({ ...prev, ...settings }));
        }
      } catch (error) {
        console.warn('Failed to load AI settings', error);
      }
    };
    loadSettings();
  }, []);

  // Save AI settings to localStorage (async encryption)
  useEffect(() => {
    if (typeof window === 'undefined' || !window?.localStorage) return;

    const saveSettings = async () => {
      try {
        await saveSecureSettings(aiSettings);
      } catch (error) {
        console.warn('Failed to save AI settings', error);
      }
    };

    // Only save if settings have values (not initial empty state)
    if (aiSettings.provider) {
      saveSettings();
    }
  }, [aiSettings]);

  // Initialize AI service based on platform
  useEffect(() => {
    const initAIService = async () => {
      try {
        const service = await getAIService();
        setAIService(service);

        // Note: Ollama is optional - users can configure AI providers in settings
        // We don't automatically prompt for Ollama setup on first launch
      } catch (error) {
        console.error('Failed to initialize AI service:', error);
      }
    };
    initAIService();
  }, []); // Run once on mount

  // Helper to select the first plausible file arg (skip flags/empties)
  const pickFileArg = useCallback((args) => {
    if (!Array.isArray(args)) return null;
    const candidates = args.filter(a => {
      if (typeof a !== 'string') return false;
      const trimmed = a.trim();
      if (!trimmed || trimmed.startsWith('-')) return false;
      const lower = trimmed.toLowerCase();
      // Ignore the executable path (single-instance argv includes it as the first entry)
      if (lower.endsWith('.exe') || lower.includes('tidycode.exe')) return false;
      return true;
    });
    return candidates[0] || null;
  }, []);

  // Normalize file paths for consistent comparisons
  const normalizePath = useCallback((pathStr = '') => {
    if (!pathStr) return '';
    let cleaned = pathStr.trim();

    // Strip surrounding quotes (Windows "open with" can pass quoted paths)
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1);
    }

    // Handle file:// URIs
    if (cleaned.startsWith('file://')) {
      try {
        const url = new URL(cleaned);
        cleaned = url.pathname || '';
        // On Windows file://C:/path comes through as "/C:/path" - drop leading slash
        if (/^\/[A-Za-z]:\//.test(cleaned)) {
          cleaned = cleaned.slice(1);
        }
      } catch {
        cleaned = cleaned.replace(/^file:\/\//, '');
      }
    }

    // Strip Windows \\?\ or /?/ extended-length prefixes that can break downstream handling
    if (/^\/\?\//.test(cleaned)) {
      cleaned = cleaned.replace(/^\/\?\//, '');
    }
    if (/^\\\\\?\\/.test(cleaned)) {
      cleaned = cleaned.replace(/^\\\\\?\\/, '');
    }

    // Decode percent-encoded characters (e.g., spaces)
    try {
      cleaned = decodeURIComponent(cleaned);
    } catch {
      // ignore decode failures; keep original
    }

    cleaned = cleaned.replace(/\\/g, '/');
    if (cleaned.length > 1) {
      cleaned = cleaned.replace(/\/+$/, ''); // Drop trailing slashes except root
    }
    cleaned = cleaned.replace(/\/{2,}/g, '/'); // Collapse duplicate separators
    return cleaned;
  }, []);

  // Normalize further for comparisons (e.g., lower-case drive letter on Windows)
  const normalizeForComparison = useCallback((pathStr = '') => {
    const normalized = normalizePath(pathStr);
    if (!normalized) return '';
    // Lowercase drive letter on Windows to avoid C: vs c: duplicates
    const driveMatch = normalized.match(/^([A-Za-z]:)(\/.*)?$/);
    if (driveMatch) {
      return `${driveMatch[1].toLowerCase()}${driveMatch[2] || ''}`;
    }
    return normalized;
  }, [normalizePath]);

  // Canonicalize a path (via backend) and normalize it for stable comparisons
  const canonicalizeAndNormalizePath = useCallback(async (pathStr = '') => {
    // In web mode, just normalize; no backend available
    if (typeof window !== 'undefined' && !window.__TAURI_INTERNALS__) {
      return normalizeForComparison(pathStr);
    }
    const normalized = normalizePath(pathStr);
    if (!normalized) return '';
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const canonical = await invoke('canonicalize_path', { path: normalized });
      // canonical on Windows may return \\?\C:\... ; strip the prefix after canonicalizing
      return normalizePath(canonical) || normalized;
    } catch (err) {
      console.warn('[canonicalizeAndNormalizePath] Failed to canonicalize, using normalized path:', normalized, err);
      return normalized;
    }
  }, [normalizeForComparison, normalizePath]);

  const recordRecentFile = useCallback(async (pathStr) => {
    if (!pathStr || typeof window === 'undefined') return;
    const normalized = String(pathStr).trim();
    const looksRealPath =
      normalized.startsWith('/') ||
      normalized.startsWith('\\') ||
      /^[A-Za-z]:[\\/]/.test(normalized);
    if (normalized.startsWith('virtual:') || !looksRealPath) {
      return; // Skip virtual or non-filesystem paths
    }
    if (!window.__TAURI__ && !window.__TAURI_INTERNALS__) {
      return; // Not running in Tauri; skip
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('record_recent_file', { path: normalized });
      console.log('[RecentFiles] Recorded recent file:', normalized);
    } catch (err) {
      console.warn('[RecentFiles] Failed to record recent file', err);
    }
  }, []);

  const handleMissingRecentFile = useCallback(async (filePath, messageOverride = null) => {
    const cleanedPath = normalizePath(filePath);
    const note = messageOverride || `File not found: ${cleanedPath || filePath}`;
    showTransientMessage(note, 'warn');

    if (typeof window === 'undefined') return;
    if (!window.__TAURI__ && !window.__TAURI_INTERNALS__) return;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('remove_recent_file', { path: cleanedPath || filePath });
      console.log('[RecentFiles] Pruned missing entry:', cleanedPath || filePath);
    } catch (err) {
      console.warn('[RecentFiles] Failed to prune missing recent file entry:', err);
    }
  }, [normalizePath, showTransientMessage]);

  // Quick Open: Fuzzy matching for file search
  const fuzzyMatch = useCallback((query, text) => {
    if (!query) return { score: 0, matches: [] };

    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Exact match gets highest score
    if (textLower === queryLower) return { score: 1000, matches: [] };

    // Starts with query gets high score
    if (textLower.startsWith(queryLower)) return { score: 500, matches: [] };

    // Contains query gets medium score
    if (textLower.includes(queryLower)) return { score: 250, matches: [] };

    // Fuzzy matching - check if all characters in query appear in order
    let queryIndex = 0;
    let score = 0;
    const matches = [];

    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        matches.push(i);
        // Consecutive matches get bonus points
        if (queryIndex > 0 && matches[queryIndex - 1] === i - 1) {
          score += 5;
        }
        score += 1;
        queryIndex++;
      }
    }

    // If not all characters matched, return 0
    if (queryIndex !== queryLower.length) return { score: 0, matches: [] };

    // Boost score for matches at word boundaries
    const fileName = text.split(/[/\\]/).pop() || '';
    const fileNameLower = fileName.toLowerCase();
    if (fileNameLower.startsWith(queryLower)) score += 100;

    return { score, matches };
  }, []);

  // Quick Open: Recursively scan files in directory
  const scanFilesRecursive = useCallback(async (dirPath, maxDepth = 5, currentDepth = 0) => {
    if (currentDepth >= maxDepth) return [];

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const entries = await invoke('read_directory', { path: dirPath });

      const files = [];
      const directories = [];

      // Separate files and directories
      for (const entry of entries) {
        // Skip hidden files and common ignore patterns
        const name = entry.name;
        if (name.startsWith('.') ||
            name === 'node_modules' ||
            name === 'dist' ||
            name === 'build' ||
            name === 'target' ||
            name === '__pycache__' ||
            name === '.git') {
          continue;
        }

        if (entry.is_dir) {
          directories.push(entry.path);
        } else {
          files.push({
            name: entry.name,
            path: entry.path,
            directory: dirPath
          });
        }
      }

      // Recursively scan subdirectories
      for (const subDir of directories) {
        const subFiles = await scanFilesRecursive(subDir, maxDepth, currentDepth + 1);
        files.push(...subFiles);
      }

      return files;
    } catch (error) {
      console.warn(`[QuickOpen] Failed to scan directory ${dirPath}:`, error);
      return [];
    }
  }, []);

  // Quick Open: Search files
  const searchFiles = useCallback(async (query) => {
    if (!query || !isDesktop()) {
      setQuickOpenResults([]);
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');

      // Get root directory from file system browser or use current directory
      let rootPath = fileSystemBrowserRootPath;

      if (!rootPath) {
        // Try to get from active tab's path
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab?.absolutePath) {
          const pathParts = activeTab.absolutePath.split(/[/\\]/);
          pathParts.pop(); // Remove filename
          rootPath = pathParts.join('/');
        }
      }

      // If still no root path, use home directory as fallback
      if (!rootPath) {
        try {
          rootPath = await invoke('get_home_directory');
          console.log('[QuickOpen] Using home directory as fallback:', rootPath);
        } catch (e) {
          console.warn('[QuickOpen] Failed to get home directory:', e);
        }
      }

      if (!rootPath) {
        console.log('[QuickOpen] No root path available');
        setQuickOpenResults([]);
        return;
      }

      console.log('[QuickOpen] Scanning from:', rootPath);

      // Scan files recursively with increased depth for better coverage
      const allFiles = await scanFilesRecursive(rootPath, 5);

      console.log(`[QuickOpen] Found ${allFiles.length} files`);

      // Filter and score files
      const results = allFiles
        .map(file => {
          const { score, matches } = fuzzyMatch(query, file.name);
          return { ...file, score, matches };
        })
        .filter(file => file.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50); // Limit to top 50 results

      console.log(`[QuickOpen] Matched ${results.length} files`);
      setQuickOpenResults(results);
      setQuickOpenSelectedIndex(0);
    } catch (error) {
      console.error('[QuickOpen] Search failed:', error);
      setQuickOpenResults([]);
    }
  }, [fuzzyMatch, scanFilesRecursive, fileSystemBrowserRootPath, tabs, activeTabId]);

  // Quick Open: Close modal and restore Vim mode if it was enabled
  const closeQuickOpen = useCallback(() => {
    setShowQuickOpen(false);

    // Restore Vim mode if it was enabled before opening Quick Open
    if (vimWasEnabledBeforeQuickOpen) {
      setVimEnabled(true);
      setVimWasEnabledBeforeQuickOpen(false);
    }
  }, [vimWasEnabledBeforeQuickOpen]);

  const ensureTabForPath = useCallback(async ({ filePath, preloadedContent = null, displayName = null, skipAutoFormat = false, virtualPathFallback = null, fileHandle = null }) => {
    if (!filePath && !virtualPathFallback) return null;
    const normalizedPath = filePath ? await canonicalizeAndNormalizePath(filePath) : normalizeForComparison(virtualPathFallback);
    const pathKey = normalizeForComparison(normalizedPath);
    const fileName = getSafeFileName(displayName || (normalizedPath.split(/[/\\]/).pop() || 'untitled'));

    // Already open? focus it
    const existing = tabsRef.current.find(tab => tab.absolutePath && normalizeForComparison(tab.absolutePath) === pathKey);
    if (existing) {
      setActiveTabId(existing.id);
      requestEditorFocus(existing.id);
      setTimeout(() => scrollTabIntoView(existing.id), 0);
      await recordRecentFile(normalizedPath);
      return existing.id;
    }

    // Attach real path to an untitled tab with matching filename
    const filenameMatch = tabsRef.current.find(tab => !tab.absolutePath && tab.filePath === fileName);
    if (filenameMatch) {
      setTabs(prev => prev.map(tab => tab.id === filenameMatch.id ? { ...tab, absolutePath: normalizedPath } : tab));
      setActiveTabId(filenameMatch.id);
      requestEditorFocus(filenameMatch.id);
      setTimeout(() => scrollTabIntoView(filenameMatch.id), 0);
      await recordRecentFile(normalizedPath);
      return filenameMatch.id;
    }

    if (openingPathsRef.current.has(pathKey)) {
      console.log('[ensureTabForPath] Already opening, skipping duplicate:', pathKey);
      return null;
    }

    openingPathsRef.current.add(pathKey);
    openPathsRef.current.add(pathKey);

    try {
      // Check if this is a PDF or SVG file that should be opened in a viewer
      const fileType = getFileType(fileName);

      if (fileType.type === 'pdf') {
        // Open PDF in a tab instead of modal
        let content = preloadedContent;
        if (content === null || content === undefined) {
          if (typeof window !== 'undefined' && !window.__TAURI_INTERNALS__) {
            throw new Error('Cannot read PDF file in browser mode without preloadedContent');
          }
          const { readFile } = await import('./utils/fileReader');
          showTransientMessage(`Loading ${fileName}...`, 'info');
          content = await readFile(normalizedPath);
        }

        const newTabId = nextIdRef.current;
        nextIdRef.current += 1;

        const newTab = {
          id: newTabId,
          title: fileName,
          content: '', // Don't store PDF content as text
          pdfContent: content instanceof Uint8Array ? content : new Uint8Array(content),
          isPDF: true,
          isModified: false,
          filePath: fileName,
          absolutePath: normalizedPath,
          wasmFileHandle: null,
          isWasmBacked: false
        };

        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTabId);
        requestEditorFocus(newTabId);
        setTimeout(() => scrollTabIntoView(newTabId), 0);
        await recordRecentFile(normalizedPath);
        openingPathsRef.current.delete(pathKey);
        return newTabId;
      }

      // SVG Viewer functionality deferred - open as text for now
      // if (fileType.type === 'svg') {
      //   // Open SVG in viewer instead of tab
      //   let content = preloadedContent;
      //   if (content === null || content === undefined) {
      //     if (typeof window !== 'undefined' && !window.__TAURI_INTERNALS__) {
      //       throw new Error('Cannot read SVG file in browser mode without preloadedContent');
      //     }
      //     const { readFile } = await import('./utils/fileReader');
      //     showTransientMessage(`Loading ${fileName}...`, 'info');
      //     content = await readFile(normalizedPath);
      //   }

      //   const textContent = typeof content === 'string'
      //     ? content
      //     : new TextDecoder().decode(new Uint8Array(content));

      //   setSVGViewerData({
      //     content: textContent,
      //     fileName: fileName,
      //     filePath: normalizedPath
      //   });
      //   setShowSVGViewer(true);
      //   await recordRecentFile(normalizedPath);
      //   openingPathsRef.current.delete(pathKey);
      //   return null; // Don't create tab
      // }

      let content = preloadedContent;
      if (content === null || content === undefined) {
        if (typeof window !== 'undefined' && !window.__TAURI_INTERNALS__) {
          throw new Error('Cannot read file content in browser mode without preloadedContent');
        }

        // Use smart file reader that automatically handles large files
        const { readFile } = await import('./utils/fileReader');

        // Show loading message for large files
        showTransientMessage(`Loading ${fileName}...`, 'info');

        content = await readFile(normalizedPath, {
          onProgress: (progress, bytesRead, totalBytes) => {
            if (totalBytes > 10 * 1024 * 1024) { // Only show progress for files > 10MB
              showTransientMessage(
                `Loading ${fileName}... ${progress}% (${formatFileSize(bytesRead)} / ${formatFileSize(totalBytes)})`,
                'info'
              );
            }
          }
        });
      }

      const newTabId = nextIdRef.current;
      nextIdRef.current += 1;

      // Detect file size FIRST before creating string (critical for performance)
      const contentBytes = typeof content === 'string'
        ? new TextEncoder().encode(content)
        : new Uint8Array(content);
      const fileSize = contentBytes.length;

      // Hard limit: refuse files larger than 100MB without WASM
      // (WASM is currently disabled, so this prevents crashes)
      const MAX_FILE_SIZE_WITHOUT_WASM = 100 * 1024 * 1024; // 100MB
      if (fileSize > MAX_FILE_SIZE_WITHOUT_WASM) {
        showTransientMessage(`File too large (${formatFileSize(fileSize)}). Maximum size: ${formatFileSize(MAX_FILE_SIZE_WITHOUT_WASM)}`, 'error');
        openingPathsRef.current.delete(pathKey);
        openPathsRef.current.delete(pathKey);
        return null;
      }

      const useWasm = shouldUseWasm(fileSize);

      let wasmFileHandle = null;
      let displayContent;
      let isTruncated = false;
      let useVirtualEditor = false;

      if (useWasm) {
        // WASM path - avoid creating full string to prevent freezing
        try {
          console.log(`[WASM] Loading large file (${formatFileSize(fileSize)}): ${fileName}`);
          showTransientMessage(`Loading large file (${formatFileSize(fileSize)})...`, 'info');

          wasmFileHandle = await loadFileWithWasm(contentBytes, fileName, {
            onProgress: (percent, message) => {
              console.log(`[WASM Progress] ${percent}% - ${message}`);
            }
          });

          console.log(`[WASM] File loaded in ${wasmFileHandle.loadTime.toFixed(0)}ms, ${wasmFileHandle.lineCount.toLocaleString()} lines indexed`);

          // Smart loading strategy based on file size and platform
          // CodeMirror 6 has built-in virtual scrolling but still needs reasonable limits
          const isTauriDesktop = window.__TAURI_INTERNALS__ !== undefined;

          // Research shows CodeMirror 6 handles files well up to these limits:
          // - 10MB: Smooth with full features (syntax highlighting, LSP, etc.)
          // - 20MB: Works well if syntax highlighting disabled
          // - 50MB+: Initial document creation freezes UI thread
          // Strategy: Load up to 20MB fully, larger files show chunked preview
          const FULL_FEATURES_LIMIT = 10 * 1024 * 1024; // 10MB - full features
          const SAFE_FULL_LOAD_LIMIT = 20 * 1024 * 1024; // 20MB - safe to load entirely without freezing
          const WASM_STORAGE_LIMIT = isTauriDesktop ? 100 * 1024 * 1024 : 50 * 1024 * 1024; // Max file size for WASM storage

          console.log(`[WASM] Platform: ${isTauriDesktop ? 'Desktop' : 'Web'}, File size: ${formatFileSize(fileSize)}`);
          console.log(`[WASM] Limits: Full features < ${formatFileSize(FULL_FEATURES_LIMIT)}, Safe load < ${formatFileSize(SAFE_FULL_LOAD_LIMIT)}, WASM storage < ${formatFileSize(WASM_STORAGE_LIMIT)}`);

          if (fileSize <= SAFE_FULL_LOAD_LIMIT) {
            // File is small enough to load fully without freezing
            console.log('[WASM] File within safe load limits - loading full content');
            console.log(`[WASM] Will ${fileSize > FULL_FEATURES_LIMIT ? 'DISABLE' : 'ENABLE'} syntax highlighting for performance`);

            try {
              const { getContentFromWasm } = await import('./utils/wasmFileHandler.js');
              console.log('[WASM] Retrieving full content from WASM...');
              const startTime = performance.now();

              displayContent = await getContentFromWasm(wasmFileHandle);

              const loadTime = performance.now() - startTime;
              console.log(`[WASM] Loaded full content in ${loadTime.toFixed(0)}ms, length: ${displayContent?.length}`);

              if (fileSize > FULL_FEATURES_LIMIT) {
                showTransientMessage(`Loaded ${formatFileSize(fileSize)} - syntax highlighting disabled for performance`, 'info');
              } else {
                showTransientMessage(`Loaded ${formatFileSize(fileSize)} - ${wasmFileHandle.lineCount.toLocaleString()} lines`, 'success');
              }
            } catch (error) {
              console.error('[WASM] Failed to get full content:', error);
              displayContent = '[Error loading file from WASM]';
            }
          } else if (fileSize <= WASM_STORAGE_LIMIT) {
            // File is too large for CodeMirror but can use VirtualEditor
            // VirtualEditor uses react-window for efficient virtualized rendering
            console.log(`[WASM] File exceeds CodeMirror safe limit (${formatFileSize(SAFE_FULL_LOAD_LIMIT)}) - will use VirtualEditor`);

            try {
              const { getContentFromWasm } = await import('./utils/wasmFileHandler.js');
              console.log('[WASM] Retrieving full content for VirtualEditor...');
              const startTime = performance.now();

              displayContent = await getContentFromWasm(wasmFileHandle);

              const loadTime = performance.now() - startTime;
              console.log(`[WASM] Loaded full content in ${loadTime.toFixed(0)}ms for VirtualEditor`);

              // Mark as using VirtualEditor (not truncated - full content loaded)
              useVirtualEditor = true;
              showTransientMessage(`Loaded ${formatFileSize(fileSize)} - using virtual scrolling editor`, 'info');
            } catch (error) {
              console.error('[WASM] Failed to load content for VirtualEditor:', error);
              displayContent = '[Error loading file from WASM]';
            }
          } else {
            // File exceeds WASM storage limit - load preview in VirtualEditor
            // Desktop: preview up to 100MB, Web: preview up to 50MB
            const PREVIEW_LIMIT = isTauriDesktop ? 100 * 1024 * 1024 : 50 * 1024 * 1024;

            console.log(`[WASM] File exceeds WASM storage limit (${formatFileSize(WASM_STORAGE_LIMIT)}) - loading ${formatFileSize(PREVIEW_LIMIT)} preview`);

            try {
              // Decode preview in chunks to prevent UI freeze
              const previewBytes = contentBytes.slice(0, PREVIEW_LIMIT);
              const chunkSize = 512 * 1024; // 512KB chunks
              displayContent = '';
              const decoder = new TextDecoder();

              for (let offset = 0; offset < previewBytes.length; offset += chunkSize) {
                const chunk = previewBytes.slice(offset, Math.min(offset + chunkSize, previewBytes.length));
                const isLastChunk = offset + chunkSize >= previewBytes.length;
                displayContent += decoder.decode(chunk, { stream: !isLastChunk });

                // Yield to UI thread every chunk
                if (offset + chunkSize < previewBytes.length) {
                  await new Promise(resolve => setTimeout(resolve, 0));
                }
              }

              // Mark as preview mode with VirtualEditor
              useVirtualEditor = true;
              isTruncated = true;

              console.log(`[WASM] Loaded ${formatFileSize(displayContent.length)} preview for very large file (${formatFileSize(fileSize)} total)`);
              showTransientMessage(`Large file (${formatFileSize(fileSize)}) - showing ${formatFileSize(PREVIEW_LIMIT)} preview`, 'info');
            } catch (error) {
              console.error('[WASM] Failed to load preview:', error);
              displayContent = '[Error loading file preview]';
            }
          }

        } catch (error) {
          console.error('[WASM] Failed to load file with WASM:', error);
          showTransientMessage('Large file loaded (WASM unavailable)', 'warning');
          // Fall back to regular loading below
        }
      }

      // Regular path for small files OR if WASM failed
      if (!useWasm || !wasmFileHandle) {
        let contentString;

        if (typeof content === 'string') {
          contentString = content;
        } else {
          // For files over 10MB, decode in chunks to avoid blocking UI
          const DECODE_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
          if (contentBytes.length > 10 * 1024 * 1024) {
            console.log(`[FileLoader] Decoding ${formatFileSize(fileSize)} in chunks...`);
            showTransientMessage(`Decoding ${fileName}...`, 'info');

            const decoder = new TextDecoder();
            const chunks = [];

            try {
              for (let offset = 0; offset < contentBytes.length; offset += DECODE_CHUNK_SIZE) {
                const chunk = contentBytes.slice(offset, Math.min(offset + DECODE_CHUNK_SIZE, contentBytes.length));
                const isLastChunk = offset + DECODE_CHUNK_SIZE >= contentBytes.length;

                console.log(`[FileLoader] Decoding chunk at offset ${formatFileSize(offset)}, chunk size ${formatFileSize(chunk.length)}`);
                chunks.push(decoder.decode(chunk, { stream: !isLastChunk }));

                // Update progress
                const progress = Math.round((offset + chunk.length) / contentBytes.length * 100);
                console.log(`[FileLoader] Progress: ${progress}%`);
                showTransientMessage(`Decoding ${fileName}... ${progress}%`, 'info');

                // Yield to browser after each chunk to prevent freezing
                await new Promise(resolve => setTimeout(resolve, 10));
              }
              console.log(`[FileLoader] Decoding complete, joining ${chunks.length} chunks`);
            } catch (decodeError) {
              console.error('[FileLoader] Chunked decode failed:', decodeError);
              throw new Error(`Failed to decode file: ${decodeError.message}`);
            }

            contentString = chunks.join('');
            showTransientMessage(`Loaded ${formatFileSize(fileSize)}`, 'success');
          } else {
            // Small file - decode directly
            contentString = new TextDecoder().decode(contentBytes);
          }
        }

        displayContent = contentString;

        // Auto-format for small files only
        if (!skipAutoFormat) {
          setPendingAutoFormat({ tabId: newTabId, content: contentString, fileName });
        }
      }

      const newTab = {
        id: newTabId,
        title: fileName,
        content: displayContent,
        fullContent: null, // Never store large content in React state
        isModified: false,
        filePath: fileName,
        absolutePath: normalizedPath,
        // WASM metadata
        wasmFileHandle: wasmFileHandle,
        fileSize: fileSize,
        isLargeFile: useWasm && wasmFileHandle !== null,
        isTruncated: isTruncated,
        useVirtualEditor: useVirtualEditor
      };

      console.log('[WASM] Creating tab with:', {
        tabId: newTabId,
        fileName,
        contentLength: displayContent?.length,
        isLargeFile: newTab.isLargeFile,
        isTruncated: newTab.isTruncated,
        useVirtualEditor: newTab.useVirtualEditor,
        hasWasmHandle: !!wasmFileHandle
      });

      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTabId);
      console.log('[WASM] Tab created and activated');
      requestEditorFocus(newTabId);
      setNextId(nextIdRef.current); // Sync state with ref
      setTimeout(() => scrollTabIntoView(newTabId), 0);
      console.log('[ensureTabForPath] Opened new tab for path:', normalizedPath);
      await recordRecentFile(normalizedPath);
      return newTabId;
    } catch (error) {
      console.error('[ensureTabForPath] Failed to open file:', normalizedPath, error);
      openPathsRef.current.delete(pathKey);
      throw error;
    } finally {
      openingPathsRef.current.delete(pathKey);
    }
  }, [canonicalizeAndNormalizePath, normalizeForComparison, recordRecentFile]);

  // Open a file only if it's not already open; otherwise focus its tab
  const openFileIfNotOpen = useCallback(async (filePath) => {
    try {
      await ensureTabForPath({ filePath });
    } catch (err) {
      console.warn('[openFileIfNotOpen] Failed to open path:', filePath, err);
      const errText = typeof err === 'string' ? err : err?.message || String(err);
      const lower = errText.toLowerCase();
      const notFound = lower.includes('failed to read file') && (
        lower.includes('cannot find the file') ||
        lower.includes('no such file') ||
        lower.includes('os error 2')
      );
      if (notFound && filePath) {
        await handleMissingRecentFile(filePath, 'File is missing. It has been removed from the Recent list.');
        return;
      }
      showTransientMessage(`Failed to open file: ${errText}`, 'error');
    }
  }, [ensureTabForPath, handleMissingRecentFile, showTransientMessage]);

  // Reload file content for restored tabs that have absolutePath but no content
  // This runs once after initial tab restoration
  // Works on all platforms: Windows, macOS, and Linux
  const hasReloadedFilesRef = useRef(false);
  useEffect(() => {
    // Only reload once on mount, not on subsequent tab changes
    if (hasReloadedFilesRef.current) return;

    const tabsToReload = tabs.filter(tab =>
      tab.absolutePath && (!tab.content || tab.content.length === 0)
    );

    if (tabsToReload.length === 0) return;

    // Mark as reloaded to prevent running again
    hasReloadedFilesRef.current = true;

    const reloadFiles = async () => {
      // Check platform first
      const isDesktopMode = typeof window !== 'undefined' && window.__TAURI_INTERNALS__;

      console.log(`[TabRestore] Found ${tabsToReload.length} tabs to reload`);

      // Browser mode: Try to restore from IndexedDB file handles
      if (!isDesktopMode) {
        console.log('[TabRestore] Browser mode: Attempting to restore from IndexedDB file handles');

        try {
          const { getFileHandle, readFileFromHandle } = await import('./utils/fileHandleStorage.js');

          for (const tab of tabsToReload) {
            // Skip legacy virtual: paths - they were from before IndexedDB storage existed
            if (tab.absolutePath?.startsWith('virtual:')) {
              console.log(`[TabRestore] Skipping legacy virtual path (no file handle): ${tab.absolutePath}`);
              console.log(`[TabRestore] Please re-open the file to enable restoration on future page loads`);
              continue;
            }

            // Only process browser: prefixed paths (current implementation)
            if (!tab.absolutePath?.startsWith('browser:')) {
              console.log(`[TabRestore] Skipping non-browser path: ${tab.absolutePath}`);
              continue;
            }

            try {
              console.log(`[TabRestore] Attempting to restore: ${tab.absolutePath}`);

              // Get file handle from IndexedDB
              const fileHandle = await getFileHandle(tab.absolutePath);

              if (!fileHandle) {
                console.log(`[TabRestore] No file handle found for: ${tab.absolutePath}`);
                console.log(`[TabRestore] File may have been opened in a different browser session`);
                continue;
              }

              // Try to read the file (only if we already have permission)
              // For PDF files, read as binary data
              if (tab.isPDF) {
                const { hasFilePermission } = await import('./utils/fileHandleStorage.js');
                const hasPermission = await hasFilePermission(fileHandle);

                if (!hasPermission) {
                  throw new Error('Permission not granted - user interaction required');
                }

                const file = await fileHandle.getFile();
                const arrayBuffer = await file.arrayBuffer();
                const pdfContent = new Uint8Array(arrayBuffer);

                // Update tab with PDF content
                setTabs(prev => prev.map(t =>
                  t.id === tab.id
                    ? { ...t, pdfContent, isModified: false }
                    : t
                ));

                console.log(`[TabRestore] Successfully restored PDF: ${tab.title}`);
              } else {
                const content = await readFileFromHandle(fileHandle);

                // Update tab with restored content
                setTabs(prev => prev.map(t =>
                  t.id === tab.id
                    ? { ...t, content, isModified: false }
                    : t
                ));

                console.log(`[TabRestore] Successfully restored: ${tab.title}`);
              }
            } catch (error) {
              // Permission not granted - we need to get the file handle again for the catch block
              if (error.message?.includes('Permission not granted')) {
                console.log(`[TabRestore] Permission needed for: ${tab.title}`);
                console.log(`[TabRestore] File handle stored - will load when user clicks tab`);

                // Get file handle again to store it
                const fileHandle = await getFileHandle(tab.absolutePath);

                if (fileHandle) {
                  // Store the file handle with the tab for later use
                  setTabs(prev => prev.map(t =>
                    t.id === tab.id
                      ? {
                          ...t,
                          fileHandle: fileHandle,
                          needsPermission: true, // Flag to show permission UI
                          content: '' // Keep empty until permission granted
                        }
                      : t
                  ));
                }
              } else {
                console.warn(`[TabRestore] Failed to restore ${tab.title}:`, error);
              }
            }
          }
        } catch (error) {
          console.error('[TabRestore] Failed to load file handle storage:', error);
        }

        return;
      }

      // Desktop mode: Reload from file system
      console.log('[TabRestore] Desktop mode: Reloading from file system');

      for (const tab of tabsToReload) {
        try {
          console.log(`[TabRestore] Reloading file: ${tab.absolutePath}`);

          // Import file reader and load the file
          const { readFile } = await import('./utils/fileReader');
          const content = await readFile(tab.absolutePath);

          console.log('[TabRestore] Raw content type:', typeof content, 'isArray:', Array.isArray(content));

          // Get file size to determine if we need WASM
          // Handle different content types that might be returned
          let contentBytes;
          let contentString;

          if (typeof content === 'string') {
            contentString = content;
            contentBytes = new TextEncoder().encode(content);
          } else if (content instanceof Uint8Array) {
            contentBytes = content;
            contentString = new TextDecoder().decode(content);
          } else if (Array.isArray(content)) {
            // If it's a regular array, convert to Uint8Array
            contentBytes = new Uint8Array(content);
            contentString = new TextDecoder().decode(contentBytes);
          } else {
            // Unknown type - try to handle it
            console.warn('[TabRestore] Unexpected content type, attempting conversion');
            contentString = String(content);
            contentBytes = new TextEncoder().encode(contentString);
          }

          const fileSize = contentBytes.length;
          console.log(`[TabRestore] Loaded ${formatFileSize(fileSize)} for ${tab.title}`);

          // Check if file needs WASM (>5MB)
          const useWasm = shouldUseWasm(fileSize);

          if (useWasm) {
            // Use WASM for large files - need to set up WASM handle
            console.log(`[TabRestore] Setting up WASM for large file: ${tab.title}`);

            try {
              const wasmFileHandle = await loadFileWithWasm(contentBytes, tab.title, {
                onProgress: (percent, message) => {
                  console.log(`[TabRestore WASM] ${percent}% - ${message}`);
                }
              });

              console.log('[TabRestore] WASM file handle created:', wasmFileHandle);

              // For WASM files, load preview content
              const { getContentFromWasm } = await import('./utils/wasmFileHandler.js');
              const displayContent = await getContentFromWasm(wasmFileHandle);

              console.log(`[TabRestore] WASM content loaded, length: ${displayContent.length}`);

              // Update tab with WASM handle and content
              setTabs(prev => prev.map(t =>
                t.id === tab.id
                  ? {
                      ...t,
                      content: displayContent,
                      isModified: false,
                      wasmFileHandle: wasmFileHandle,
                      fileSize: fileSize,
                      isLargeFile: true
                    }
                  : t
              ));
            } catch (wasmError) {
              console.error(`[TabRestore] WASM loading failed for ${tab.title}:`, wasmError);
              // Fall back to regular string loading (contentString is already decoded above)
              setTabs(prev => prev.map(t =>
                t.id === tab.id
                  ? { ...t, content: contentString, isModified: false }
                  : t
              ));

              // Trigger auto-formatting for JSON/XML files (even in fallback)
              setPendingAutoFormat({ tabId: tab.id, content: contentString, fileName: tab.title });
            }
          } else {
            // Regular file - contentString is already decoded above
            console.log(`[TabRestore] Regular file loaded, length: ${contentString.length}`);

            // Update the tab with the loaded content
            setTabs(prev => prev.map(t =>
              t.id === tab.id
                ? { ...t, content: contentString, isModified: false }
                : t
            ));

            // Trigger auto-formatting for JSON/XML files
            setPendingAutoFormat({ tabId: tab.id, content: contentString, fileName: tab.title });
          }
        } catch (error) {
          console.warn(`[TabRestore] Failed to reload ${tab.absolutePath}:`, error);
          // Update tab to show error message
          setTabs(prev => prev.map(t =>
            t.id === tab.id
              ? { ...t, content: `Error loading file: ${error.message}\n\nPath: ${tab.absolutePath}` }
              : t
          ));
        }
      }
    };

    // Small delay to allow UI to render first
    setTimeout(() => reloadFiles(), 100);
  }, [tabs]); // Run when tabs changes

  // Keep a quick lookup of currently open paths
  useEffect(() => {
    const set = new Set();
    tabs.forEach(tab => {
      if (tab.absolutePath) {
        set.add(normalizeForComparison(tab.absolutePath));
      }
    });
    openPathsRef.current = set;
    tabsRef.current = tabs;
  }, [tabs, normalizeForComparison]);

  // Note: Permission handling is now done via UI button in renderEditorWorkspace
  // This avoids the "User activation required" error when using useEffect

  // Handle file associations (files opened via OS)
  useEffect(() => {
    // Only run in desktop/Tauri environment
    if (!isDesktop()) {
      return;
    }

    let pendingInterval;

    const loadCliFile = async () => {
      console.log('[loadCliFile] ===== CHECKING CLI ARGUMENTS =====');
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const args = await invoke('get_cli_args');
        console.log('[loadCliFile] Got CLI args:', JSON.stringify(args, null, 2));
        console.log('[loadCliFile] Number of args:', args?.length);
        const filePath = pickFileArg(args);
        console.log('[loadCliFile] Picked file path:', filePath);
        if (filePath) {
          openFileIfNotOpen(filePath);
        } else {
          console.log('[loadCliFile] No file path found in CLI args');
        }
      } catch (error) {
        console.error('[loadCliFile] Failed to open file from CLI args:', error);
      }
    };

    const drainPendingOpens = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const pending = await invoke('take_pending_file_opens');
        if (Array.isArray(pending)) {
          for (const filePath of pending) {
            openFileIfNotOpen(filePath);
          }
        }
      } catch (err) {
        console.warn('[pending-file-open] Failed to drain pending opens:', err);
      }
    };

    loadCliFile();
        // Drain any queued "open with" requests after startup
        drainPendingOpens();
    // Poll a few times during first seconds to catch late backend delivery
    let attempts = 0;
    pendingInterval = setInterval(async () => {
      attempts += 1;
      await loadCliFile();
      await drainPendingOpens();
      if (attempts >= 5) {
        clearInterval(pendingInterval);
      }
    }, 800);

    return () => {
      if (pendingInterval) {
        clearInterval(pendingInterval);
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickFileArg, openFileIfNotOpen]);

  // Listen for single-instance events (file opened when app already running)
  useEffect(() => {
    // Only run in desktop/Tauri environment
    if (!isDesktop()) {
      return;
    }

    let unlisten;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen('single-instance', (event) => {
          console.log('[single-instance] Received event:', event);
          const payload = event?.payload || {};
          const args = payload.args || payload?.Args || [];
          console.log('[single-instance] Args:', args);
          const filePath = pickFileArg(args);
          console.log('[single-instance] Picked file path:', filePath);
          if (filePath) {
            openFileIfNotOpen(filePath);
          }
        });
      } catch (error) {
        console.warn('[Tidy Code] single-instance listener failed:', error);
      }
    })();
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [pickFileArg, tabs, openFileIfNotOpen]);

  // Listen for file drop events (drag files from Finder/File Explorer into the app)
  // Uses Tauri v2 webview.onDragDropEvent() API
  useEffect(() => {
    // Only run in desktop/Tauri environment
    if (!isDesktop()) {
      return;
    }

    let dragDropUnlisten;
    let fileOpenUnlisten;
    (async () => {
      try {
        // Use the Tauri v2 webview drag-drop API
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        const webview = getCurrentWebview();

        // Listen for drag-drop events on the webview
        dragDropUnlisten = await webview.onDragDropEvent((event) => {
          console.log('[drag-drop] Event received:', event.payload.type);

          if (event.payload.type === 'drop') {
            // Files were dropped
            const paths = event.payload.paths || [];
            console.log('[drag-drop] Files dropped:', paths);

            if (Array.isArray(paths) && paths.length > 0) {
              // Open all dropped files
              paths.forEach((filePath, index) => {
                console.log(`[drag-drop] Opening file ${index + 1}/${paths.length}:`, filePath);
                openFileIfNotOpen(filePath);
              });
            }
          } else if (event.payload.type === 'over') {
            // Files hovering over the window (could show visual feedback)
            console.log('[drag-drop] Files hovering at position:', event.payload.position);
          } else if (event.payload.type === 'leave') {
            // Files dragged away from window
            console.log('[drag-drop] Files dragged away');
          }
        });
        console.log('[Tidy Code] drag-drop listener registered successfully');

        // Also listen for tauri://file-open events (for "Open With" / file associations)
        try {
          const { listen } = await import('@tauri-apps/api/event');
          fileOpenUnlisten = await listen('tauri://file-open', (event) => {
            console.log('[file-open] ===== FILE OPEN EVENT RECEIVED =====');
            console.log('[file-open] Full event:', JSON.stringify(event, null, 2));
            const paths = event?.payload || [];
            if (Array.isArray(paths) && paths.length > 0) {
              paths.forEach(filePath => openFileIfNotOpen(filePath));
            }
          });
          console.log('[Tidy Code] file-open listener registered successfully');
        } catch (e) {
          console.log('[Tidy Code] file-open listener not available (this is OK)');
        }
      } catch (error) {
        console.warn('[Tidy Code] drag-drop listener failed:', error);
      }
    })();
    return () => {
      if (dragDropUnlisten) {
        dragDropUnlisten();
      }
      if (fileOpenUnlisten) {
        fileOpenUnlisten();
      }
    };
  }, [openFileIfNotOpen]);

  // Update cursor position when tab changes
  useEffect(() => {
    if (textareaRef.current) {
      updateCursorPosition();
    }
  }, [activeTabId]);

  useEffect(() => {
    return () => {
      if (autoFormatTimeoutRef.current) {
        clearTimeout(autoFormatTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (errorMessage) {
      setTipsCollapsed(true);
    }
  }, [errorMessage?.message, errorMessage?.type]);

  useEffect(() => {
    if (!errorMessage) return;
    const priorityError = errorMessage.allErrors?.find(e => e.isPrimary && e.line) ||
      errorMessage.allErrors?.find(e => e.line) ||
      (errorMessage.line ? { line: errorMessage.line } : null);
    if (priorityError?.line) {
      scrollLineIntoView(priorityError.line);
    }
  }, [errorMessage]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const handleScroll = () => {
      requestAnimationFrame(syncScrollVisuals);
    };
    textarea.addEventListener('scroll', handleScroll);
    syncScrollVisuals();
    return () => {
      textarea.removeEventListener('scroll', handleScroll);
    };
  }, [activeTabId, syncScrollVisuals]);

  useEffect(() => {
    if (!pendingCursorRef.current) return;
    const cursor = pendingCursorRef.current;
    pendingCursorRef.current = null;
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const textarea = textareaRef.current;
      const text = textarea.value;
      const index = getIndexFromLineColumn(text, cursor.line, cursor.column);
      textarea.focus();
      textarea.setSelectionRange(index, index);
      updateCursorPosition(text);
      syncScrollVisuals();
    });
  }, [tabs, activeTabId]);

  // Auto-format JSON/XML when a file is opened
  useEffect(() => {
    if (!pendingAutoFormat) return;

    const { tabId, content, fileName } = pendingAutoFormat;
    setPendingAutoFormat(null);

    const trimmed = String(content).trim();
    const fileType = getFileType(fileName);

    // Only auto-format if file type allows it
    if (fileType.shouldAutoFormat) {
      if (fileType.type === 'json' || looksLikeJSON(trimmed) || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        formatJSON({ tabId, content, autoTriggered: true });
      } else if (fileType.type === 'markup' || looksLikeXML(trimmed) || trimmed.startsWith('<')) {
        formatXML({ tabId, content, autoTriggered: true });
      }
    }
  }, [pendingAutoFormat]);

  // Auto-focus editor when a newly created tab becomes active
  useEffect(() => {
    if (pendingEditorFocusTabIdRef.current !== activeTabId && pendingEditorFocusTabIdRef.current !== 'any') return;
    const attemptFocus = () => {
      if (codeMirrorRef.current) {
        codeMirrorRef.current.focus();
        pendingEditorFocusTabIdRef.current = null;
        return true;
      }
      return false;
    };

    if (!attemptFocus()) {
      const timer = setTimeout(attemptFocus, 60);
      return () => clearTimeout(timer);
    }
  }, [activeTabId, tabs]);

  // Always focus editor when active tab changes (covers manual tab clicks/navigation)
  useEffect(() => {
    if (!activeTabId) return;
    const saved = tabCursorPositionsRef.current.get(activeTabId);
    const tryFocus = () => {
      if (codeMirrorRef.current) {
        codeMirrorRef.current.focus();
        if (saved && typeof saved.pos === 'number') {
          requestAnimationFrame(() => {
            const view = codeMirrorRef.current?.getView?.();
            if (view) {
              const docLength = view.state.doc.length;
              // Validate position is within document bounds
              const validPos = Math.max(0, Math.min(saved.pos, docLength));

              // Batch selection and scroll in single transaction
              view.dispatch({
                selection: { anchor: validPos, head: validPos },
                effects: EditorView.scrollIntoView(validPos, { y: 'center', yMargin: 0 })
              });

              setCursorPosition({ line: saved.line, column: saved.column });
              lastCursorRef.current = { line: saved.line, column: saved.column };
            } else {
              // Fallback if view not available
              codeMirrorRef.current?.setSelection(saved.pos, saved.pos);
            }
          });
        }
        return true;
      }
      return false;
    };
    if (!tryFocus()) {
      const timer = setTimeout(tryFocus, 40);
      return () => clearTimeout(timer);
    }
  }, [activeTabId]);

  const createNewTab = () => {
    // Use ref to get ID synchronously, bypassing React's state batching
    const newTabId = nextIdRef.current;
    nextIdRef.current += 1;

    const newTab = {
      id: newTabId,
      title: `Untitled-${newTabId}`,
      content: '',
      isModified: false, // Start as unmodified, will become modified when user types
      filePath: null
    };

    setTabs(currentTabs => [...currentTabs, newTab]);
    setActiveTabId(newTab.id);
    requestEditorFocus(newTabId);
    setNextId(nextIdRef.current); // Sync state with ref
    // Scroll the new tab into view after it's been added to the DOM
    setTimeout(() => scrollTabIntoView(newTabId), 0);
  };

  // Keep ref updated
  createNewTabRef.current = createNewTab;

  const closeTab = async (tabId) => {
    console.log('[closeTab] Called with tabId:', tabId);

    // Check if tab has unsaved changes BEFORE calling setTabs
    const tabToClose = tabs.find(t => t.id === tabId);
    console.log('[closeTab] Tab to close:', tabToClose ? { id: tabToClose.id, title: tabToClose.title, isModified: tabToClose.isModified } : 'NOT FOUND');

    if (tabToClose && tabToClose.isModified) {
      console.log('[closeTab] Tab has unsaved changes, showing confirm dialog');

      let shouldClose = false;

      // Use Tauri dialog in desktop mode, native confirm in web mode
      if (isDesktop()) {
        try {
          const { ask } = await import('@tauri-apps/plugin-dialog');
          shouldClose = await ask(
            `"${tabToClose.title}" has unsaved changes.\n\nAre you sure you want to close without saving?`,
            {
              title: 'Unsaved Changes',
              kind: 'warning'
            }
          );
        } catch (error) {
          console.error('[closeTab] Failed to show Tauri dialog, falling back to window.confirm:', error);
          shouldClose = window.confirm(
            `"${tabToClose.title}" has unsaved changes.\n\nAre you sure you want to close without saving?`
          );
        }
      } else {
        shouldClose = window.confirm(
          `"${tabToClose.title}" has unsaved changes.\n\nAre you sure you want to close without saving?`
        );
      }

      console.log('[closeTab] User response:', shouldClose ? 'YES (close)' : 'NO (keep open)');
      if (!shouldClose) {
        console.log('[closeTab] User cancelled, returning early');
        return; // Exit early, don't close the tab
      }
    } else {
      console.log('[closeTab] No unsaved changes or tab not found, closing directly');
    }

    // If we reach here, proceed with closing
    setTabs(currentTabs => {
      try {
        const newTabs = currentTabs.filter(t => t.id !== tabId);

        // Clean up WASM file handle if exists
        const closingTab = currentTabs.find(t => t.id === tabId);
        if (closingTab?.wasmFileHandle) {
          unloadWasmFile(closingTab.wasmFileHandle).catch(err => {
            console.warn('[closeTab] Failed to unload WASM file:', err);
          });
        }

        // Clean up tab-specific state
        setTabSearchResults(prev => {
          const newState = { ...prev };
          delete newState[tabId];
          return newState;
        });
        setTabShowSearchResults(prev => {
          const newState = { ...prev };
          delete newState[tabId];
          return newState;
        });
        setTabErrorMessages(prev => {
          const newState = { ...prev };
          delete newState[tabId];
          return newState;
        });

        // If closing all tabs, create a Welcome tab (if one doesn't already exist)
        if (newTabs.length === 0) {
          // Check if a Welcome tab already exists in the remaining tabs
          const existingWelcomeTab = newTabs.find(t => t.title === 'Welcome');
          if (existingWelcomeTab) {
            setActiveTabId(existingWelcomeTab.id);
            return newTabs;
          }

          const welcomeTabId = nextIdRef.current;
          nextIdRef.current += 1;

          const welcomeTab = {
            id: welcomeTabId,
            title: 'Welcome',
            content: '',
            isModified: false,
            filePath: null
          };

          setActiveTabId(welcomeTabId);
          setNextId(nextIdRef.current); // Sync state with ref
          return [welcomeTab]; // Return the new Welcome tab array
        }

        // Update active tab if closing the active one
        setActiveTabId(currentActiveId => {
          if (currentActiveId === tabId) {
            const index = currentTabs.findIndex(t => t.id === tabId);
            const newActiveTab = newTabs[Math.max(0, index - 1)];
            return newActiveTab.id;
          }
          return currentActiveId;
        });

        return newTabs;
      } catch (error) {
        console.error('Error in closeTab:', error);
        return currentTabs.filter(t => t.id !== tabId);
      }
    });
  };

  // Keep ref updated
  closeTabRef.current = closeTab;

  const closeTabsToRight = (tabId) => {
    const index = tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    const newTabs = tabs.slice(0, index + 1);
    const closedTabIds = tabs.slice(index + 1).map(t => t.id);

    // Clean up state for closed tabs
    closedTabIds.forEach(id => {
      setTabSearchResults(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      setTabShowSearchResults(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      setTabErrorMessages(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
    });

    setTabs(newTabs);

    // If active tab was closed, activate the clicked tab
    if (!newTabs.find(t => t.id === activeTabId)) {
      setActiveTabId(tabId);
    }
  };

  const closeAllTabs = () => {
    // Clear all tab-specific state
    setTabSearchResults({});
    setTabShowSearchResults({});
    setTabErrorMessages({});

    // Check if a Welcome tab already exists
    const existingWelcomeTab = tabs.find(t => t.title === 'Welcome');
    if (existingWelcomeTab) {
      setTabs([existingWelcomeTab]);
      setActiveTabId(existingWelcomeTab.id);
      return;
    }

    const welcomeTab = {
      id: nextId,
      title: 'Welcome',
      content: '',
      isModified: false,
      filePath: null
    };
    setTabs([welcomeTab]);
    setActiveTabId(welcomeTab.id);
    setNextId(nextId + 1);
  };

  const closeOtherTabs = (tabId) => {
    const tabToKeep = tabs.find(t => t.id === tabId);
    if (!tabToKeep) return;

    const closedTabIds = tabs.filter(t => t.id !== tabId).map(t => t.id);

    // Clean up state for closed tabs
    closedTabIds.forEach(id => {
      setTabSearchResults(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      setTabShowSearchResults(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      setTabErrorMessages(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
    });

    setTabs([tabToKeep]);
    setActiveTabId(tabId);
  };

  const openDiffWithTab = (leftTabId) => {
    const leftTab = tabs.find(t => t.id === leftTabId);
    if (!leftTab) return;

    setDiffTabsData({
      left: {
        content: leftTab.content || '',
        label: leftTab.name || leftTab.title || 'Untitled'
      },
      right: null // Will be selected in the diff viewer
    });
    setShowDiffViewer(true);
  };

  const handleTabDragStart = (e, tabId) => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTabDragOver = (e, tabId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTabId(tabId);
  };

  const handleTabDragLeave = () => {
    setDragOverTabId(null);
  };

  const handleTabDrop = (e, targetTabId) => {
    e.preventDefault();

    if (!draggedTabId || draggedTabId === targetTabId) {
      setDraggedTabId(null);
      setDragOverTabId(null);
      return;
    }

    const draggedIndex = tabs.findIndex(t => t.id === draggedTabId);
    const targetIndex = tabs.findIndex(t => t.id === targetTabId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTabId(null);
      setDragOverTabId(null);
      return;
    }

    const newTabs = [...tabs];
    const [draggedTab] = newTabs.splice(draggedIndex, 1);
    newTabs.splice(targetIndex, 0, draggedTab);

    setTabs(newTabs);
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  const handleTabDragEnd = () => {
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  const updateCursorPosition = (textOverride = null) => {
    // CodeMirror compatibility: cursor position is already tracked via onCursorChange
    // This function is kept for backward compatibility but doesn't do anything now
    // since cursor tracking happens in the CodeMirror onChange callback
    return;
  };

  const focusEditorRange = (start, end = start) => {
    if (!codeMirrorRef.current) return;

    codeMirrorRef.current.focus();

    // Batch selection and scroll in a single transaction to prevent state inconsistency
    const view = codeMirrorRef.current.getView();
    if (view) {
      const docLength = view.state.doc.length;

      // Validate positions are within document bounds
      const validStart = Math.max(0, Math.min(start, docLength));
      const validEnd = Math.max(0, Math.min(end, docLength));

      view.dispatch({
        selection: { anchor: validStart, head: validEnd },
        effects: EditorView.scrollIntoView(validStart, {
          y: 'center',
          yMargin: 0
        })
      });
    } else {
      // Fallback for older API
      codeMirrorRef.current.setSelection(start, end);
    }
  };

  const focusCsvRow = (rowIndex) => {
    if (!isCSVTab || !codeMirrorRef.current) return;
    const entry = csvEditorRowRefs.current.get(rowIndex);
    if (!entry) return;

    codeMirrorRef.current.focus();

    // Batch selection and scroll in single transaction with position validation
    const view = codeMirrorRef.current.getView();
    if (view) {
      const docLength = view.state.doc.length;

      // Validate positions are within document bounds
      const validStart = Math.max(0, Math.min(entry.start, docLength));
      const validEnd = Math.max(0, Math.min(entry.end, docLength));

      view.dispatch({
        selection: { anchor: validStart, head: validEnd },
        effects: EditorView.scrollIntoView(validStart, {
          y: 'center',
          yMargin: 0
        })
      });
    } else {
      // Fallback for older API
      codeMirrorRef.current.setSelection(entry.start, entry.end);
    }
  };

  const handleCsvPreviewRowClick = (rowIndex) => {
    if (!isCSVTab || rowIndex == null) return;
    focusCsvRow(rowIndex);
  };

  const goToPosition = (line, column) => {
    if (!codeMirrorRef.current || !line) return;

    // Get the content from CodeMirror
    const content = codeMirrorRef.current.getValue();
    const index = getIndexFromLineColumn(content, line, column || 1);
    focusEditorRange(index, index + 1);
  };

  const setSelectionRange = (start, end, textOverride = null) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const sourceText = textOverride ?? textarea.value;
    textarea.focus();
    textarea.setSelectionRange(start, end);
    const { line, column } = getLineColumnFromIndex(sourceText, start);
    setCursorPosition({ line, column });
    lastCursorRef.current = { line, column };
  };

  const restoreCursorPosition = (cursor, textOverride = null) => {
    if (!cursor) return;
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const textarea = textareaRef.current;
      const sourceText = textOverride ?? textarea.value;
      if (textOverride !== null) {
        textarea.value = textOverride;
      }
      const index = getIndexFromLineColumn(sourceText, cursor.line, cursor.column);
      textarea.focus();
      textarea.setSelectionRange(index, index);
      updateCursorPosition(sourceText);
      syncScrollVisuals();
    });
  };

  const scrollLineIntoView = (line) => {
    if (!textareaRef.current || !line) return;
    const textarea = textareaRef.current;
    const lineHeight = 24;
    const targetTop = Math.max(0, (line - 1) * lineHeight);
    const viewTop = textarea.scrollTop;
    const viewBottom = textarea.scrollTop + textarea.clientHeight - lineHeight;

    if (targetTop < viewTop) {
      textarea.scrollTop = Math.max(0, targetTop - lineHeight);
    } else if (targetTop > viewBottom) {
      textarea.scrollTop = Math.max(0, targetTop - textarea.clientHeight / 2);
    }
    syncScrollVisuals();
  };

  const applyTextEdit = (text, selectionStartOffset, selectionEndOffset = selectionStartOffset) => {
    if (!textareaRef.current || !activeTab) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    const newValue = before + text + after;
    const newStart = start + selectionStartOffset;
    const newEnd = start + selectionEndOffset;

    // Clear pending cursor restoration to prevent interference
    pendingCursorRef.current = null;

    textarea.value = newValue;
    setSelectionRange(newStart, newEnd, newValue);
    updateTabContent(activeTab.id, newValue);

    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(newStart, newEnd);
      updateCursorPosition(newValue);
      syncScrollVisuals();
    });
  };

  const updateTabTitle = (tabId, title) => {
    setTabs(tabs.map(tab => 
      tab.id === tabId 
        ? { ...tab, title }
        : tab
    ));
  };

  const findMultipleXMLErrors = (content) => {
    const errors = [];
    const lines = content.split('\n');
    
    // Check for unclosed tags
    const tagStack = [];
    lines.forEach((line, index) => {
      // Find opening tags
      const openTags = [...line.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g)];
      openTags.forEach(match => {
        if (!match[0].endsWith('/>')) {
          tagStack.push({
            tag: match[1],
            line: index + 1,
            column: match.index + 1
          });
        }
      });
      
      // Find closing tags
      const closeTags = [...line.matchAll(/<\/([a-zA-Z][a-zA-Z0-9]*)>/g)];
      closeTags.forEach(match => {
        const lastOpen = tagStack.pop();
        if (!lastOpen) {
          errors.push({
            line: index + 1,
            column: match.index + 1,
            message: `Closing tag </${match[1]}> without matching opening tag`,
            severity: 'error'
          });
        } else if (lastOpen.tag !== match[1]) {
          errors.push({
            line: index + 1,
            column: match.index + 1,
            message: `Mismatched closing tag: expected </${lastOpen.tag}> but found </${match[1]}>`,
            severity: 'error'
          });
        }
      });
    });
    
    // Check for tags left unclosed
    tagStack.forEach(unclosed => {
      errors.push({
        line: unclosed.line,
        column: unclosed.column,
        message: `Unclosed tag: <${unclosed.tag}>`,
        severity: 'warning'
      });
    });
    
    // Check for missing closing angle brackets
    lines.forEach((line, index) => {
      const openBrackets = (line.match(/</g) || []).length;
      const closeBrackets = (line.match(/>/g) || []).length;
      if (openBrackets !== closeBrackets) {
        errors.push({
          line: index + 1,
          column: line.length,
          message: 'Mismatched angle brackets on this line',
          severity: 'warning'
        });
      }
    });
    
    return errors;
  };

  const buildXMLErrorDetails = (content, errorText) => {
    const multipleErrors = findMultipleXMLErrors(content);
    const lineMatch = errorText.match(/line (\d+)/i);
    const columnMatch = errorText.match(/column (\d+)/i);
    const errorLine = lineMatch ? parseInt(lineMatch[1], 10) : null;
    const errorColumn = columnMatch ? parseInt(columnMatch[1], 10) : null;

    const errorDetails = {
      type: 'XML',
      message: errorText,
      line: errorLine,
      column: errorColumn || 1,
      allErrors: [],
      context: [],
      tips: [
        'Unclosed tags (every <tag> needs </tag>)',
        'Missing closing angle bracket >',
        'Special characters not escaped (&, <, >, ", \')',
        'Attribute values not in quotes',
        'Invalid characters in tag names',
        'Mismatched opening and closing tags'
      ]
    };

    if (errorLine) {
      errorDetails.allErrors.push({
        line: errorLine,
        column: errorColumn || 1,
        message: errorText,
        isPrimary: true
      });

      const allLines = content.split('\n');
      const contextStart = Math.max(0, errorLine - 2);
      const contextEnd = Math.min(allLines.length, errorLine + 1);

      for (let i = contextStart; i < contextEnd; i++) {
        const lineNum = i + 1;
        const isErrorLine = lineNum === errorLine;
        errorDetails.context.push({
          lineNum,
          text: allLines[i],
          isError: isErrorLine,
          column: isErrorLine ? (errorColumn || 1) : null
        });
      }
    }

    multipleErrors.forEach(err => {
      if (!errorLine || err.line !== errorLine || err.column !== (errorColumn || 1)) {
        errorDetails.allErrors.push({
          line: err.line,
          column: err.column,
          message: err.message,
          isPrimary: false,
          severity: err.severity
        });
      }
    });

    // Sort errors: secondary errors (warnings) first, then primary error
    errorDetails.allErrors.sort((a, b) => {
      if (a.isPrimary === b.isPrimary) return 0;
      return a.isPrimary ? 1 : -1; // non-primary (warnings) first
    });

    return errorDetails;
  };

  const findMultipleJSONErrors = (content) => {
    const errors = [];
    const lines = content.split('\n');
    
    // Check for trailing commas
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      // Look for ,} or ,]
      if (/,\s*[}\]]/.test(trimmed)) {
        const match = line.match(/,\s*[}\]]/);
        if (match) {
          errors.push({
            line: index + 1,
            column: line.indexOf(match[0]) + 1,
            message: 'Trailing comma before closing bracket',
            severity: 'error'
          });
        }
      }
    });
    
    // Check for single quotes instead of double quotes (basic check)
    lines.forEach((line, index) => {
      if (/'[^']*'\s*:/.test(line) || /:\s*'[^']*'/.test(line)) {
        const match = line.match(/'[^']*'/);
        if (match) {
          errors.push({
            line: index + 1,
            column: line.indexOf(match[0]) + 1,
            message: "Single quotes detected - JSON requires double quotes",
            severity: 'error'
          });
        }
      }
    });
    
    // Check for unescaped quotes
    lines.forEach((line, index) => {
      const matches = [...line.matchAll(/"[^"\\]*(?:\\.[^"\\]*)*"/g)];
      const afterMatches = line.split(/"[^"\\]*(?:\\.[^"\\]*)*"/);
      afterMatches.forEach((segment, i) => {
        if (i > 0 && i < afterMatches.length) {
          const quoteIndex = segment.indexOf('"');
          if (quoteIndex !== -1 && segment[quoteIndex - 1] !== '\\') {
            // Potential unescaped quote
          }
        }
      });
    });
    
    // Check for missing commas between properties
    lines.forEach((line, index) => {
      if (index < lines.length - 1) {
        const currentTrimmed = line.trim();
        const nextTrimmed = lines[index + 1].trim();
        
        // If current line ends with " or number and next starts with "
        if ((/["}\]]$/.test(currentTrimmed) || /\d$/.test(currentTrimmed)) && 
            /^"/.test(nextTrimmed) && 
            !/,$/.test(currentTrimmed.replace(/\s+/g, ''))) {
          errors.push({
            line: index + 1,
            column: line.length,
            message: 'Possible missing comma between properties',
            severity: 'warning'
          });
        }
      }
    });
    
    return errors;
  };

  const buildJSONErrorDetails = (content, error) => {
    const multipleErrors = findMultipleJSONErrors(content);
    const positionMatch = error.message.match(/position (\d+)/);
    const position = positionMatch ? parseInt(positionMatch[1], 10) : null;

    let primaryError = {
      message: error.message,
      line: null,
      column: null,
    };

    if (position !== null) {
      const lines = content.substring(0, position).split('\n');
      primaryError.line = lines.length;
      primaryError.column = lines[lines.length - 1].length + 1;
    }

    const errorDetails = {
      type: 'JSON',
      message: error.message,
      line: primaryError.line,
      column: primaryError.column,
      allErrors: [],
      context: [],
      tips: [
        'Trailing commas (remove comma after last item)',
        'Missing quotes around property names',
        'Single quotes instead of double quotes',
        'Missing commas between properties',
        'Unclosed braces { } or brackets [ ]'
      ]
    };

    if (primaryError.line) {
      errorDetails.allErrors.push({
        line: primaryError.line,
        column: primaryError.column,
        message: error.message,
        isPrimary: true
      });
    }

    multipleErrors.forEach(err => {
      if (!primaryError.line || err.line !== primaryError.line || err.column !== primaryError.column) {
        errorDetails.allErrors.push({
          line: err.line,
          column: err.column,
          message: err.message,
          isPrimary: false,
          severity: err.severity
        });
      }
    });

    // Sort errors: secondary errors (warnings) first, then primary error
    errorDetails.allErrors.sort((a, b) => {
      if (a.isPrimary === b.isPrimary) return 0;
      return a.isPrimary ? 1 : -1; // non-primary (warnings) first
    });

    if (position !== null) {
      const lines = content.substring(0, position).split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;
      const allLines = content.split('\n');
      const contextStart = Math.max(0, line - 2);
      const contextEnd = Math.min(allLines.length, line + 1);

      for (let i = contextStart; i < contextEnd; i++) {
        const lineNum = i + 1;
        const isErrorLine = lineNum === line;
        errorDetails.context.push({
          lineNum,
          text: allLines[i],
          isError: isErrorLine,
          column: isErrorLine ? column : null
        });
      }
    }

    return errorDetails;
  };

  // Unified format function that auto-detects JSON or XML
  const formatContent = ({ tabId = activeTabId, content, autoTriggered = false, cursor } = {}) => {
    if (!tabId) return false;

    const targetTab = tabsRef.current.find(t => t.id === tabId);
    const workingContent = content ?? targetTab?.content ?? '';
    if (!String(workingContent).trim()) {
      if (!autoTriggered) {
        setErrorMessage(null);
      }
      return false;
    }

    const trimmed = String(workingContent).trim();
    const filename = targetTab?.filename || '';

    // Use format service to detect the format
    const detection = formatService.detect(trimmed, filename);

    if (detection.format) {
      switch (detection.format) {
        case 'json':
          return formatJSON({ tabId, content: workingContent, autoTriggered, cursor, allowRedirect: false });
        case 'xml':
          return formatXML({ tabId, content: workingContent, autoTriggered, cursor, allowRedirect: false });
        case 'yaml':
          return formatYAML({ tabId, content: workingContent, autoTriggered, cursor });
        case 'toml':
          return formatTOML({ tabId, content: workingContent, autoTriggered, cursor });
        default:
          break;
      }
    }

    // Fallback: if starts with <, it's XML, otherwise try JSON
    if (trimmed.startsWith('<')) {
      return formatXML({ tabId, content: workingContent, autoTriggered, cursor, allowRedirect: false });
    } else {
      return formatJSON({ tabId, content: workingContent, autoTriggered, cursor, allowRedirect: false });
    }
  };

  const formatJSON = ({ tabId = activeTabId, content, autoTriggered = false, cursor, allowRedirect = true } = {}) => {
    if (!tabId) return false;

    const targetTab = tabsRef.current.find(t => t.id === tabId);
    const workingContent = content ?? targetTab?.content ?? '';
    if (!String(workingContent).trim()) {
      if (!autoTriggered) {
        setErrorMessage(null);
      }
      return false;
    }

    const trimmed = String(workingContent).trim();
    if (allowRedirect && trimmed.startsWith('<')) {
      return formatXML({ tabId, content: workingContent, autoTriggered, cursor, allowRedirect: false });
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (autoTriggered) {
        const isEmptyObject = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0;
        const isEmptyArray = Array.isArray(parsed) && parsed.length === 0;
        if ((isEmptyObject || isEmptyArray) && /\n/.test(workingContent)) {
          setErrorMessage(null);
          // Don't set pendingCursorRef for auto-formatting
          return true;
        }
      }

      const formatted = JSON.stringify(parsed, null, 2);
      // Only restore cursor for manual formatting, not auto-formatting
      if (!autoTriggered) {
        const cursorToStore = cursor || lastCursorRef.current;
        if (cursorToStore) {
          pendingCursorRef.current = { ...cursorToStore };
        }
      }
      setTabs(prevTabs => prevTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, content: formatted, isModified: autoTriggered ? tab.isModified : true }
          : tab
      ));
      setErrorMessage(null);
      return true;
    } catch (e) {
      if (!autoTriggered) {
        const errorDetails = buildJSONErrorDetails(workingContent, e);
        setErrorMessage(errorDetails);
      }
      return false;
    }
  };

  const formatXML = ({ tabId = activeTabId, content, autoTriggered = false, cursor, allowRedirect = true } = {}) => {
    if (!tabId) return false;

    const targetTab = tabsRef.current.find(t => t.id === tabId);
    const workingContent = content ?? targetTab?.content ?? '';
    if (!String(workingContent).trim()) {
      if (!autoTriggered) {
        setErrorMessage(null);
      }
      return false;
    }

    const trimmed = String(workingContent).trim();
    if (allowRedirect && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
      return formatJSON({ tabId, content: workingContent, autoTriggered, cursor, allowRedirect: false });
    }

    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(trimmed, 'text/xml');
      const parserError = xmlDoc.getElementsByTagName('parsererror');

      if (parserError.length > 0) {
        const errorText = parserError[0].textContent;
        if (!autoTriggered) {
          const errorDetails = buildXMLErrorDetails(workingContent, errorText);
          setErrorMessage(errorDetails);
        }
        return false;
      }

      const formatted = formatXMLString(trimmed);
      // Only restore cursor for manual formatting, not auto-formatting
      if (!autoTriggered) {
        const cursorToStore = cursor || lastCursorRef.current;
        if (cursorToStore) {
          pendingCursorRef.current = { ...cursorToStore };
        }
      }
      setTabs(prevTabs => prevTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, content: formatted, isModified: autoTriggered ? tab.isModified : true }
          : tab
      ));
      setErrorMessage(null);
      return true;
    } catch (e) {
      if (!autoTriggered) {
        setErrorMessage({
          type: 'XML',
          message: e.message,
          line: null,
          column: null,
          allErrors: [],
          context: [],
          tips: [
            'Unclosed tags (every <tag> needs </tag>)',
            'Missing closing angle bracket >',
            'Special characters not escaped (&, <, >, ", \')',
            'Attribute values not in quotes',
            'Invalid characters in tag names',
            'Mismatched opening and closing tags'
          ]
        });
      }
      return false;
    }
  };

  const formatYAML = ({ tabId = activeTabId, content, autoTriggered = false, cursor } = {}) => {
    if (!tabId) return false;

    const targetTab = tabsRef.current.find(t => t.id === tabId);
    const workingContent = content ?? targetTab?.content ?? '';
    if (!String(workingContent).trim()) {
      if (!autoTriggered) {
        setErrorMessage(null);
      }
      return false;
    }

    const result = formatService.format(workingContent, 'yaml');

    if (result.errors.length > 0) {
      if (!autoTriggered) {
        const error = result.errors[0];
        const tips = formatService.getValidationTips(error, 'yaml');
        setErrorMessage({
          type: 'YAML',
          message: error.message,
          line: error.line,
          column: error.column,
          allErrors: result.errors.map(e => ({
            line: e.line,
            column: e.column,
            message: e.message,
            severity: e.severity
          })),
          context: [],
          tips
        });
      }
      return false;
    }

    if (!autoTriggered) {
      const cursorToStore = cursor || lastCursorRef.current;
      if (cursorToStore) {
        pendingCursorRef.current = { ...cursorToStore };
      }
    }
    setTabs(prevTabs => prevTabs.map(tab =>
      tab.id === tabId
        ? { ...tab, content: result.formatted, isModified: autoTriggered ? tab.isModified : true }
        : tab
    ));
    setErrorMessage(null);
    return true;
  };

  const formatTOML = ({ tabId = activeTabId, content, autoTriggered = false, cursor } = {}) => {
    if (!tabId) return false;

    const targetTab = tabsRef.current.find(t => t.id === tabId);
    const workingContent = content ?? targetTab?.content ?? '';
    if (!String(workingContent).trim()) {
      if (!autoTriggered) {
        setErrorMessage(null);
      }
      return false;
    }

    const result = formatService.format(workingContent, 'toml');

    if (result.errors.length > 0) {
      if (!autoTriggered) {
        const error = result.errors[0];
        const tips = formatService.getValidationTips(error, 'toml');
        setErrorMessage({
          type: 'TOML',
          message: error.message,
          line: error.line,
          column: error.column,
          allErrors: result.errors.map(e => ({
            line: e.line,
            column: e.column,
            message: e.message,
            severity: e.severity
          })),
          context: [],
          tips
        });
      }
      return false;
    }

    if (!autoTriggered) {
      const cursorToStore = cursor || lastCursorRef.current;
      if (cursorToStore) {
        pendingCursorRef.current = { ...cursorToStore };
      }
    }
    setTabs(prevTabs => prevTabs.map(tab =>
      tab.id === tabId
        ? { ...tab, content: result.formatted, isModified: autoTriggered ? tab.isModified : true }
        : tab
    ));
    setErrorMessage(null);
    return true;
  };

  // Convert content to a different format
  const convertFormat = (targetFormat) => {
    if (!activeTab) return;

    const content = activeTab.content;
    const trimmed = String(content).trim();
    if (!trimmed) return;

    // Detect source format
    const filename = activeTab.title || '';
    const detection = formatService.detect(trimmed, filename);

    if (!detection.format) {
      setErrorMessage({
        type: 'Conversion',
        message: 'Could not detect the source format. Please ensure the content is valid JSON, XML, YAML, or TOML.',
        allErrors: [],
        tips: ['Check that your content is properly formatted', 'Ensure the content starts with valid format markers']
      });
      return;
    }

    if (detection.format === targetFormat) {
      // Already in target format, just format it
      formatContent();
      return;
    }

    // Perform conversion
    const result = formatService.convert(content, detection.format, targetFormat);

    if (result.errors.length > 0) {
      setErrorMessage({
        type: 'Conversion',
        message: `Failed to convert from ${detection.format.toUpperCase()} to ${targetFormat.toUpperCase()}: ${result.errors[0].message}`,
        allErrors: result.errors.map(e => ({
          message: e.message,
          severity: 'error'
        })),
        tips: ['Ensure the source content is valid', 'Some data types may not be compatible between formats']
      });
      return;
    }

    // Create a new tab with the converted content (preserve original file)
    const newTabId = nextIdRef.current;
    nextIdRef.current += 1;

    // Generate new filename with target extension
    const sourceTitle = activeTab.title || 'Untitled';
    const baseName = sourceTitle.replace(/\.[^.]+$/, ''); // Remove extension
    const extensionMap = { json: '.json', xml: '.xml', yaml: '.yaml', toml: '.toml' };
    const newTitle = `${baseName}${extensionMap[targetFormat]}`;

    const newTab = {
      id: newTabId,
      title: newTitle,
      content: result.converted,
      isModified: true,
      filePath: null
    };

    setTabs(currentTabs => [...currentTabs, newTab]);
    setActiveTabId(newTab.id);
    requestEditorFocus(newTabId);
    setNextId(nextIdRef.current);
    setTimeout(() => scrollTabIntoView(newTabId), 0);
    setShowConvertDropdown(false);

    // Show warning message in the NEW tab specifically (use setTabErrorMessages directly with newTabId)
    const adjustments = result.adjustments || [];
    const hasAdjustments = adjustments.length > 0;

    setTabErrorMessages(prev => ({
      ...prev,
      [newTabId]: {
        type: 'Warning',
        message: hasAdjustments
          ? `Converted from ${detection.format.toUpperCase()} to ${targetFormat.toUpperCase()} with ${adjustments.length} adjustment${adjustments.length > 1 ? 's' : ''}. Please review the changes below.`
          : `Converted from ${detection.format.toUpperCase()} to ${targetFormat.toUpperCase()}. Please review the converted content.`,
        allErrors: [],
        adjustments: adjustments,
        tips: hasAdjustments ? [] : [
          'Format conversions may not be perfect - some data types or structures may differ',
          'The original file remains unchanged in its tab'
        ]
      }
    }));
  };

  const queueAutoFormat = (tabId, content) => {
    if (autoFormatTimeoutRef.current) {
      clearTimeout(autoFormatTimeoutRef.current);
    }

    autoFormatTimeoutRef.current = setTimeout(() => {
      const trimmed = String(content).trim();
      if (!trimmed || trimmed.length < 2) return;
      if (activeTabIdRef.current !== tabId) return;

      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        formatJSON({ tabId, content, autoTriggered: true });
      } else if (trimmed.startsWith('<')) {
        formatXML({ tabId, content, autoTriggered: true });
      }
    }, 700);
  };

  const updateTabContent = (tabId, content) => {
    setTabs(prevTabs => prevTabs.map(tab =>
      tab.id === tabId
        ? { ...tab, content, isModified: true }
        : tab
    ));

    // Invalidate brace match cache when content changes
    if (braceMatchCacheRef.current.contentHash !== null) {
      braceMatchCacheRef.current = { contentHash: null, pos: null, result: null };
    }

    // Update error message with current errors
    if (errorMessage && errorMessage.type === 'JSON') {
      try {
        const trimmed = String(content).trim();
        if (trimmed && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
          JSON.parse(content);
          // Content is valid JSON, clear the error
          setErrorMessage(null);
        }
      } catch (e) {
        // Re-validate and update error list
        const updatedErrorDetails = buildJSONErrorDetails(content, e);
        setErrorMessage(updatedErrorDetails);
      }
    } else if (errorMessage && errorMessage.type === 'XML') {
      try {
        const trimmed = String(content).trim();
        if (trimmed && trimmed.startsWith('<')) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, 'text/xml');
          const parserError = xmlDoc.getElementsByTagName('parsererror');
          if (parserError.length === 0) {
            // Content is valid XML, clear the error
            setErrorMessage(null);
          } else {
            // Re-validate and update error message
            const errorText = parserError[0].textContent;
            const updatedErrorDetails = buildXMLErrorDetails(content, errorText);
            setErrorMessage(updatedErrorDetails);
          }
        }
      } catch (e) {
        // Keep existing error
      }
    }

    // Disable auto-formatting - it interferes with editing by reformatting while typing
    // Users can still manually format using the Format JSON/XML buttons
    // queueAutoFormat(tabId, content);
  };

  const formatXMLString = (xml) => {
    const PADDING = '  ';
    const reg = /(>)(<)(\/*)/g;
    let pad = 0;

    xml = xml.replace(reg, '$1\n$2$3');

    return xml.split('\n').map((node) => {
      let indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      } else if (node.match(/^<\/\w/) && pad > 0) {
        pad -= 1;
      } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
        indent = 1;
      } else {
        indent = 0;
      }

      const padding = PADDING.repeat(pad);
      pad += indent;

      return padding + node;
    }).join('\n');
  };

  // AI Fix handlers
  const handleAIFix = async () => {
    if (!errorMessage || !activeTab) return;

    if (!aiService) {
      setAIFixState({
        isLoading: false,
        fixedContent: null,
        originalContent: null,
        showDiff: false,
        error: 'AI service is still initializing. Please try again.',
        progress: null
      });
      return;
    }

    setAIFixState({
      isLoading: true,
      fixedContent: null,
      originalContent: activeTab.content,
      showDiff: false,
      error: null,
      progress: null
    });

    try {
      const fixedContent = await aiService.fix(
        activeTab.content,
        errorMessage,
        aiSettings,
        (progress) => {
          setAIFixState(prev => ({
            ...prev,
            progress: progress
          }));
        }
      );

      setAIFixState({
        isLoading: false,
        fixedContent,
        originalContent: activeTab.content,
        showDiff: true,
        error: null,
        progress: null
      });
    } catch (error) {
      setAIFixState({
        isLoading: false,
        fixedContent: null,
        originalContent: null,
        showDiff: false,
        error: error.message || 'Failed to fix content',
        progress: null
      });
    }
  };

  const handleAcceptFix = (customContent = null) => {
    const contentToUse = customContent || aiFixState.fixedContent;
    if (!contentToUse || !activeTab) return;

    // Capture the error type before clearing it
    const originalErrorType = errorMessage?.type;

    // Create a new tab with the AI-fixed content
    const aiFixedTab = {
      id: nextId,
      title: `${activeTab.title} (AI Fixed)`,
      content: String(contentToUse),
      isModified: true,
      filePath: null
    };

    const newTabId = nextId;

    // Update current tab with original content (rename to show it's the original with errors)
    setTabs(prevTabs => [
      ...prevTabs.map(tab =>
        tab.id === activeTabId
          ? { ...tab, title: `${tab.title} (Original)`, isModified: false }
          : tab
      ),
      aiFixedTab
    ]);

    // Switch to the new AI-fixed tab
    setActiveTabId(newTabId);
    requestEditorFocus(newTabId);
    setNextId(nextId + 1);

    // Clear error and close diff
    setErrorMessage(null);
    setAIFixState({
      isLoading: false,
      fixedContent: null,
      originalContent: null,
      showDiff: false,
      error: null,
      progress: null
    });

    // Revalidate and format the fixed content in the new tab
    setTimeout(() => {
      if (originalErrorType === 'JSON') {
        formatJSON({ tabId: newTabId, autoTriggered: true });
      } else if (originalErrorType === 'XML') {
        formatXML({ tabId: newTabId, autoTriggered: true });
      }
    }, 100);
  };

  const handleRejectFix = () => {
    setAIFixState({
      isLoading: false,
      fixedContent: null,
      originalContent: null,
      showDiff: false,
      error: null,
      progress: null
    });
  };

  const handleSaveAISettings = async (newSettings) => {
    setAISettings(newSettings);
  };

  // Handler for triggering setup wizard when unavailable model is selected
  const handleTriggerSetupWizard = (modelId) => {
    console.log('[Tidy Code] Setup wizard triggered for model:', modelId);
    // Update the selected model in settings
    setAISettings(prev => ({ ...prev, ollamaModel: modelId }));
    // Open the setup wizard
    setShowOllamaSetup(true);
    console.log('[Tidy Code] showOllamaSetup set to true');
  };

  const saveFileAs = async () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    // Don't save Welcome tab
    if (activeTab.title === 'Welcome') {
      console.log('Skipping save for Welcome tab');
      return;
    }

    // Check if running in Tauri desktop mode
    const isTauri = window.__TAURI_INTERNALS__;

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { save } = await import('@tauri-apps/plugin-dialog');

        const suggestedName = getSafeFileName(activeTab.title || activeTab.filePath || '');
        // Always show save dialog for Save As
        // Use the current folder from File System Browser if available
        const defaultPath = fileSystemBrowserRootPath
          ? `${fileSystemBrowserRootPath}/${suggestedName || 'untitled.txt'}`
          : suggestedName || 'untitled.txt';

        const filePath = await save({
          defaultPath: defaultPath
        });

        if (filePath) {
          // Get content to save - retrieve from WASM if it's a large file
          let contentToSave;
          if (activeTab.isLargeFile && activeTab.wasmFileHandle) {
            console.log('[saveFileAs] Retrieving content from WASM...');
            contentToSave = await getContentFromWasm(activeTab.wasmFileHandle);
          } else {
            contentToSave = activeTab.content;
          }

          await invoke('save_file_to_path', {
            filePath: filePath,
            content: String(contentToSave || '')
          });

          // Update tab with the new absolute path and mark as saved
          setTabs(tabs.map(tab =>
            tab.id === activeTabId
              ? {
                  ...tab,
                  absolutePath: filePath,
                  title: filePath.split(/[/\\]/).pop() || suggestedName,
                  isModified: false
                }
              : tab
          ));

          console.log('File saved as:', filePath);
        }
      } catch (error) {
        console.error('Failed to save file as:', error);
        showTransientMessage('Failed to save file: ' + error, 'error');
      }
    } else {
      // Browser mode - use File System Access API if available
      try {
        if ('showSaveFilePicker' in window) {
          // Always show save picker for Save As
          const suggestedName = getSafeFileName(activeTab.title || activeTab.filePath || '');
          const handle = await window.showSaveFilePicker({
            suggestedName: suggestedName || 'untitled.txt'
            // Don't specify types to allow all file extensions
          });

          // Get content to save - retrieve from WASM if it's a large file
          let contentToSave;
          if (activeTab.isLargeFile && activeTab.wasmFileHandle) {
            console.log('[saveFileAs] Retrieving content from WASM...');
            contentToSave = await getContentFromWasm(activeTab.wasmFileHandle);
          } else {
            contentToSave = activeTab.content;
          }

          const writable = await handle.createWritable();
          await writable.write(String(contentToSave || ''));
          await writable.close();

          // Generate consistent path for this file
          const virtualPath = `browser:${handle.name}`;

          // Save file handle to IndexedDB for persistence
          try {
            const { saveFileHandle } = await import('./utils/fileHandleStorage.js');
            await saveFileHandle(virtualPath, handle);
            console.log('[SaveFileAs] Saved file handle to IndexedDB:', virtualPath);
          } catch (error) {
            console.warn('[SaveFileAs] Failed to save file handle:', error);
          }

          // Update tab with new file handle and mark as saved
          setTabs(tabs.map(tab =>
            tab.id === activeTabId
              ? {
                  ...tab,
                  fileHandle: handle,
                  absolutePath: virtualPath,
                  title: getSafeFileName(handle.name),
                  isModified: false
                }
              : tab
          ));
          console.log('File saved as using File System Access API:', handle.name);
          return;
        }
      } catch (err) {
        // User cancelled or API not supported, fall through to download
        if (err.name !== 'AbortError') {
          console.log('File System Access API error:', err);
        }
      }

      // Fallback to browser download with original extension
      const blob = new Blob([String(activeTab.content || '')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const title = getSafeFileName(String(activeTab.title || activeTab.filePath || 'untitled'));
      // Preserve original extension instead of forcing .txt
      a.download = title;
      a.click();
      URL.revokeObjectURL(url);

      // Mark as saved
      setTabs(tabs.map(tab =>
        tab.id === activeTabId
          ? { ...tab, isModified: false }
          : tab
      ));
    }
  };

  // Keep ref updated
  saveFileAsRef.current = saveFileAs;

  const saveFile = async (tabIdToSave = null) => {
    const tabId = tabIdToSave || activeTabId;
    console.log('[saveFile] Called with tabId:', tabId, 'activeTabId:', activeTabId, 'tabs count:', tabs.length);

    const activeTab = tabs.find(t => t.id === tabId);
    if (!activeTab) {
      console.log('[saveFile] No active tab found. Available tab IDs:', tabs.map(t => t.id));
      return;
    }

    console.log('[saveFile] Saving tab:', activeTab.title, 'absolutePath:', activeTab.absolutePath, 'fileHandle:', activeTab.fileHandle);

    // Don't save Welcome tab
    if (activeTab.title === 'Welcome') {
      console.log('[saveFile] Skipping save for Welcome tab');
      return;
    }

    // Check if running in Tauri desktop mode
    const isTauri = window.__TAURI_INTERNALS__;

    if (isTauri) {
      console.log('[saveFile] Running in Tauri mode');
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { save } = await import('@tauri-apps/plugin-dialog');

        const hasRealPath = activeTab.absolutePath && !String(activeTab.absolutePath).startsWith('virtual:');

        // If the tab has an existing absolute file path, save directly to it
        if (hasRealPath) {
          console.log('[saveFile] Saving to existing path:', activeTab.absolutePath);

          // Get content to save - retrieve from WASM if it's a large file
          let contentToSave;
          if (activeTab.isLargeFile && activeTab.wasmFileHandle) {
            console.log('[saveFile] Retrieving content from WASM...');
            contentToSave = await getContentFromWasm(activeTab.wasmFileHandle);
          } else if (activeTab.isTruncated) {
            contentToSave = activeTab.fullContent || activeTab.content;
          } else {
            contentToSave = activeTab.content;
          }

          await invoke('save_file_to_path', {
            filePath: activeTab.absolutePath,
            content: String(contentToSave || '')
          });

          // Mark as saved
          setTabs(tabs.map(tab =>
            tab.id === tabId
              ? { ...tab, isModified: false }
              : tab
          ));

          console.log('[saveFile] File saved successfully to:', activeTab.absolutePath);
        } else {
          // No existing path, use Save As behavior
          console.log('[saveFile] No absolutePath, calling saveFileAs()');
          await saveFileAs();
        }
      } catch (error) {
        console.error('Failed to save file:', error);
        showTransientMessage('Failed to save file: ' + error, 'error');
      }
    } else {
      // Browser mode - use File System Access API if available
      console.log('[saveFile] Running in browser mode');
      try {
        // Check if browser supports File System Access API
        if ('showSaveFilePicker' in window) {
          console.log('[saveFile] Browser supports showSaveFilePicker');
          // If we have a file handle from previous save/open, try to use it
          if (activeTab.fileHandle) {
            console.log('[saveFile] Using existing file handle');
            try {
              // Get content to save - retrieve from WASM if it's a large file
              let contentToSave;
              if (activeTab.isLargeFile && activeTab.wasmFileHandle) {
                console.log('[saveFile] Retrieving content from WASM...');
                contentToSave = await getContentFromWasm(activeTab.wasmFileHandle);
              } else {
                contentToSave = activeTab.content;
              }

              const writable = await activeTab.fileHandle.createWritable();
              await writable.write(String(contentToSave || ''));
              await writable.close();

              // Mark as saved
              setTabs(tabs.map(tab =>
                tab.id === tabId
                  ? { ...tab, isModified: false }
                  : tab
              ));
              console.log('[saveFile] File saved using existing handle');
              return;
            } catch (err) {
              // If we can't write (permissions denied), fall through to show save picker
              console.log('[saveFile] Cannot write to existing handle, showing save picker');
            }
          }

          // Show save picker
          // Use the current folder from File System Browser if available (desktop mode)
          console.log('[saveFile] No file handle, showing save picker');
          const suggestedName = getSafeFileName(activeTab.title || activeTab.filePath || 'untitled.txt');
          const handle = await window.showSaveFilePicker({
            suggestedName: suggestedName
            // Don't specify types to allow all file extensions
          });

          // Get content to save - retrieve from WASM if it's a large file
          let contentToSave;
          if (activeTab.isLargeFile && activeTab.wasmFileHandle) {
            console.log('[saveFile] Retrieving content from WASM...');
            contentToSave = await getContentFromWasm(activeTab.wasmFileHandle);
          } else {
            contentToSave = activeTab.content;
          }

          const writable = await handle.createWritable();
          await writable.write(String(contentToSave || ''));
          await writable.close();

          // Generate consistent path for this file
          const virtualPath = `browser:${handle.name}`;

          // Save file handle to IndexedDB for persistence
          try {
            const { saveFileHandle } = await import('./utils/fileHandleStorage.js');
            await saveFileHandle(virtualPath, handle);
            console.log('[SaveFile] Saved file handle to IndexedDB:', virtualPath);
          } catch (error) {
            console.warn('[SaveFile] Failed to save file handle:', error);
          }

          // Update tab with file handle and mark as saved
          setTabs(tabs.map(tab =>
            tab.id === tabId
              ? {
                  ...tab,
                  fileHandle: handle,
                  absolutePath: virtualPath,
                  title: getSafeFileName(handle.name),
                  isModified: false
                }
              : tab
          ));
          console.log('File saved using File System Access API');
          return;
        }
      } catch (err) {
        // User cancelled or API not supported, fall through to download
        if (err.name !== 'AbortError') {
          console.log('File System Access API error:', err);
        }
      }

      // Fallback to browser download with original extension
      const blob = new Blob([String(activeTab.content || '')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const title = getSafeFileName(String(activeTab.title || activeTab.filePath || 'untitled'));
      // Preserve original extension instead of forcing .txt
      a.download = title;
      a.click();
      URL.revokeObjectURL(url);

      // Mark as saved
      setTabs(tabs.map(tab =>
        tab.id === activeTabId
          ? { ...tab, isModified: false }
          : tab
      ));
    }
  };

  // Keep ref updated
  saveFileRef.current = saveFile;

  const openFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size and warn if very large
    const fileSize = file.size;
    if (shouldWarnUser(fileSize, isDesktop())) {
      const confirmed = window.confirm(
        `This file is very large (${formatFileSize(fileSize)}).\n\n` +
        `Loading it may take some time and use significant memory.\n\n` +
        `Continue?`
      );
      if (!confirmed) {
        e.target.value = '';
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target.result || '');
      ensureTabForPath({
        filePath: null,
        virtualPathFallback: `virtual:${file.name}`,
        preloadedContent: content,
        displayName: file.name
      }).catch((err) => {
        console.warn('[openFile] Failed to open file in browser mode:', err);
        showTransientMessage('Failed to open file: ' + err, 'error');
      });
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const openFileWithDialog = async () => {
    // Check if running in Tauri desktop mode
    const isTauri = window.__TAURI_INTERNALS__;

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { open } = await import('@tauri-apps/plugin-dialog');

        // Show open dialog - "All Files" first so PDFs are visible by default
        const filePath = await open({
          multiple: false,
          defaultPath: undefined,
          directory: false,
          filters: [
            {
              name: 'All Files',
              extensions: ['*']
            },
            {
              name: 'PDF Documents',
              extensions: ['pdf']
            },
            {
              name: 'SVG Images',
              extensions: ['svg']
            },
            {
              name: 'Text Files',
              extensions: ['txt', 'md', 'log', 'json', 'xml', 'html', 'css', 'js', 'jsx', 'ts', 'tsx']
            }
          ]
        });

        if (filePath) {
          const fileName = filePath.split(/[/\\]/).pop() || 'untitled';

          // Use smart file reader for better performance on large files
          const { readFile } = await import('./utils/fileReader');
          try {
            await invoke('store_security_bookmark', { filePath });
          } catch (error) {
            console.warn('[openFile] Failed to store security bookmark:', error);
          }
          const content = await readFile(filePath, {
            onProgress: (progress, bytesRead, totalBytes) => {
              if (totalBytes > 10 * 1024 * 1024) { // Only show progress for files > 10MB
                showTransientMessage(
                  `Loading ${fileName}... ${progress}% (${formatFileSize(bytesRead)} / ${formatFileSize(totalBytes)})`,
                  'info'
                );
              }
            }
          });

          await ensureTabForPath({
            filePath,
            preloadedContent: content,
            displayName: fileName
          });

          console.log('File opened successfully:', filePath);
        }
      } catch (error) {
        console.error('Failed to open file:', error);
        showTransientMessage('Failed to open file: ' + error, 'error');
      }
    } else {
      // Browser mode - use File System Access API if available
      try {
        if ('showOpenFilePicker' in window) {
          const [fileHandle] = await window.showOpenFilePicker({
            multiple: false,
            types: [
              {
                description: 'Text Files',
                accept: {
                  'text/plain': ['.txt', '.log'],
                  'text/markdown': ['.md', '.markdown'],
                  'text/html': ['.html', '.htm'],
                  'text/css': ['.css'],
                  'text/javascript': ['.js', '.jsx', '.ts', '.tsx', '.mjs'],
                  'application/json': ['.json'],
                  'application/xml': ['.xml'],
                  'text/csv': ['.csv'],
                  'application/x-python': ['.py'],
                  'text/x-python': ['.py'],
                  'application/x-java': ['.java'],
                  'text/x-java': ['.java'],
                  'text/x-c': ['.c', '.h'],
                  'text/x-c++': ['.cpp', '.hpp', '.cc', '.hh', '.cxx'],
                  'application/x-php': ['.php'],
                  'text/x-php': ['.php'],
                  'application/x-rust': ['.rs'],
                  'text/x-rust': ['.rs'],
                  'application/x-sql': ['.sql'],
                  'text/x-sql': ['.sql'],
                  'image/svg+xml': ['.svg']
                }
              },
              {
                description: 'PDF Documents',
                accept: {
                  'application/pdf': ['.pdf']
                }
              },
              {
                description: 'All Files',
                accept: {
                  '*/*': []
                }
              }
            ],
            excludeAcceptAllOption: false
          });

          const file = await fileHandle.getFile();

          // Generate a consistent path using the file name
          // This allows us to restore the file later from IndexedDB
          const virtualPath = `browser:${file.name}`;

          // Check if this is a binary file (PDF, images, etc.)
          const isBinary = isBinaryFile(file.name);

          // Read file content appropriately
          const content = isBinary
            ? new Uint8Array(await file.arrayBuffer())
            : await file.text();

          // Save file handle to IndexedDB for persistence
          try {
            const { saveFileHandle } = await import('./utils/fileHandleStorage.js');
            await saveFileHandle(virtualPath, fileHandle);
            console.log('[FileOpen] Saved file handle to IndexedDB:', virtualPath);
          } catch (error) {
            console.warn('[FileOpen] Failed to save file handle:', error);
          }

          await ensureTabForPath({
            filePath: null,
            virtualPathFallback: virtualPath,
            preloadedContent: content,
            displayName: file.name,
            skipAutoFormat: false,
            fileHandle: fileHandle
          });

          console.log('File opened using File System Access API:', file.name);
          return;
        }
      } catch (err) {
        // User cancelled or API not supported
        if (err.name !== 'AbortError') {
          console.log('File System Access API error:', err);
        }
        // Fall through to trigger the hidden input
      }

      // Fallback to browser file input - trigger the hidden input
      document.getElementById('file-input')?.click();
    }
  };

  // Find all occurrences of the search term
  const findAllOccurrences = async (searchTerm) => {
    if (!codeMirrorRef.current || !searchTerm) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const view = codeMirrorRef.current.getView();
    if (!view) return;

    // Check if current tab is a WASM-backed large file
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab?.isLargeFile && activeTab?.wasmFileHandle) {
      console.log('[Search] Using WASM search for large file');
      try {
        // Escape regex special characters in search term
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedTerm = escapeRegex(searchTerm);

        // Use WASM search for large files
        const wasmResults = await searchInFile(
          activeTab.wasmFileHandle,
          caseSensitive ? escapedTerm : `(?i)${escapedTerm}`, // Add case-insensitive flag if needed
          1000 // max results
        );

        // Convert WASM results to our format
        // We need to calculate positions properly using CodeMirror's doc API
        const results = wasmResults.map(result => {
          const trimmedLine = result.text.trim();
          const leadingWhitespace = result.text.length - result.text.trimStart().length;
          const adjustedMatchStart = result.column - 1 - leadingWhitespace;
          const adjustedMatchEnd = adjustedMatchStart + searchTerm.length;

          // Calculate absolute position in document using CodeMirror's doc.line() API
          // result.line is 1-indexed, CodeMirror lines are 1-indexed
          let position = 0;
          const doc = view.state.doc;
          const totalLines = doc.lines;

          try {
            // Validate line number is within document bounds before calling doc.line()
            if (result.line >= 1 && result.line <= totalLines) {
              // Get the line object from CodeMirror
              const docLine = doc.line(result.line);
              // Position is the start of the line + column offset (column is 1-indexed from WASM, so subtract 1)
              const columnOffset = Math.max(0, result.column - 1);
              // Ensure position doesn't exceed line length
              const lineLength = docLine.to - docLine.from;
              position = docLine.from + Math.min(columnOffset, lineLength);
            } else {
              console.warn(`[Search] Line ${result.line} is out of bounds (total lines: ${totalLines})`);
              // Clamp to document bounds
              position = result.line > totalLines ? doc.length : 0;
            }
          } catch (error) {
            console.warn(`[Search] Could not calculate position for line ${result.line}:`, error);
            // Fallback: use first or last position depending on which bound was exceeded
            position = result.line > totalLines ? doc.length : 0;
          }

          return {
            line: result.line,
            column: result.column,
            position: position,
            text: trimmedLine,
            matchStart: adjustedMatchStart,
            matchEnd: adjustedMatchEnd
          };
        });

        console.log(`[Search] WASM search found ${results.length} results`);
        setSearchResults(results);
        setShowSearchResults(results.length > 0);
        return;
      } catch (error) {
        console.error('[Search] WASM search failed, falling back to standard search:', error);
        // Fall through to standard search
      }
    }

    // Standard search for non-WASM files or as fallback
    const text = view.state.doc.toString();
    const lines = text.split('\n');
    const results = [];

    // Prepare search term based on case sensitivity
    const searchLower = caseSensitive ? searchTerm : searchTerm.toLowerCase();

    lines.forEach((line, lineIndex) => {
      let startIndex = 0;
      const lineLower = caseSensitive ? line : line.toLowerCase();

      while (true) {
        const foundIndex = lineLower.indexOf(searchLower, startIndex);
        if (foundIndex === -1) break;

        startIndex = foundIndex;

        // Calculate the absolute position in the document
        const beforeLines = lines.slice(0, lineIndex).join('\n');
        const position = beforeLines.length + (lineIndex > 0 ? 1 : 0) + startIndex;

        // Trim the line but adjust match positions accordingly
        const trimmedLine = line.trim();
        const leadingWhitespace = line.length - line.trimStart().length;
        const adjustedMatchStart = startIndex - leadingWhitespace;
        const adjustedMatchEnd = adjustedMatchStart + searchTerm.length;

        results.push({
          line: lineIndex + 1,
          column: startIndex + 1,
          position: position,
          text: trimmedLine,
          matchStart: adjustedMatchStart,
          matchEnd: adjustedMatchEnd
        });
        startIndex += searchTerm.length;
      }
    });

    setSearchResults(results);
    setShowSearchResults(results.length > 0);
  };

  const handleFindNext = () => {
    if (!codeMirrorRef.current || !findValue) return;

    const view = codeMirrorRef.current.getView();
    if (!view) return;

    const text = view.state.doc.toString();
    const startPos = view.state.selection.main.head;
    let matchIndex = -1;

    if (caseSensitive) {
      matchIndex = text.indexOf(findValue, startPos);
      // Wrap around to beginning if not found
      if (matchIndex === -1 && startPos !== 0) {
        matchIndex = text.indexOf(findValue, 0);
      }
    } else {
      const textLower = text.toLowerCase();
      const findLower = findValue.toLowerCase();
      matchIndex = textLower.indexOf(findLower, startPos);
      // Wrap around to beginning if not found
      if (matchIndex === -1 && startPos !== 0) {
        matchIndex = textLower.indexOf(findLower, 0);
      }
    }

    if (matchIndex !== -1) {
      focusEditorRange(matchIndex, matchIndex + findValue.length);
    }
  };

  const handleReplace = () => {
    if (!codeMirrorRef.current || !findValue || !activeTab) return;

    const view = codeMirrorRef.current.getView();
    if (!view) return;

    const text = view.state.doc.toString();
    const { from: selectionStart, to: selectionEnd } = view.state.selection.main;
    const selected = text.substring(selectionStart, selectionEnd);

    const isMatch = caseSensitive
      ? selected === findValue
      : selected.toLowerCase() === findValue.toLowerCase();

    if (isMatch) {
      const replaceLength = replaceValue.length;

      // Replace using CodeMirror's transaction API
      view.dispatch({
        changes: { from: selectionStart, to: selectionEnd, insert: replaceValue }
      });

      // Update React state to match
      const newContent = text.substring(0, selectionStart) + replaceValue + text.substring(selectionEnd);
      updateTabContent(activeTab.id, newContent);

      setTimeout(() => {
        focusEditorRange(selectionStart, selectionStart + replaceLength);
      }, 0);
    } else {
      handleFindNext();
    }
  };

  const handleReplaceAll = () => {
    if (!codeMirrorRef.current || !findValue || !activeTab) return;

    const view = codeMirrorRef.current.getView();
    if (!view) return;

    const text = view.state.doc.toString();
    let newContent;

    if (caseSensitive) {
      if (!text.includes(findValue)) return;
      newContent = text.split(findValue).join(replaceValue);
    } else {
      // Case-insensitive replace all
      const regex = new RegExp(findValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      newContent = text.replace(regex, replaceValue);
    }

    // Replace all using CodeMirror's transaction API
    view.dispatch({
      changes: { from: 0, to: text.length, insert: newContent }
    });

    // Update React state to match
    updateTabContent(activeTab.id, newContent);
  };

  const toggleStructureNode = (id) => {
    setStructureCollapsed(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const renderStructureNodes = (nodes, depth = 0) => {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      const collapsed = structureCollapsed[node.id];
      const isActive = node.id === activeStructureId;
      const nodeTextClass = isActive
        ? 'text-white'
        : theme === 'dark'
          ? 'text-gray-300 hover:text-white'
          : 'text-gray-600 hover:text-gray-900';
      const buttonHoverClass = theme === 'dark'
        ? 'text-gray-400 hover:text-white'
        : 'text-gray-500 hover:text-gray-900';
      const bulletClass = theme === 'dark' ? 'text-gray-700' : 'text-gray-400';
      return (
        <div
          key={node.id}
          data-node-id={node.id}
          className={`text-xs mb-1 ${nodeTextClass} transition-colors duration-150`}
          style={{ marginLeft: depth * 12 }}
          ref={isActive ? activeStructureNodeRef : null}
        >
          <div className={`flex items-center gap-1 ${isActive ? 'bg-indigo-600 bg-opacity-40 rounded px-1 py-0.5 border border-indigo-400/70 shadow-sm' : ''}`}>
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStructureNode(node.id);
                }}
                className={`w-4 h-4 ${buttonHoverClass} flex items-center justify-center`}
              >
                {collapsed ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              </button>
            ) : (
              <span className={`w-4 h-4 ${bulletClass} flex items-center justify-center`}>•</span>
            )}
            <button
              onClick={() => goToPosition(node.line, 1)}
              className={`flex-1 text-left truncate ${isActive ? 'font-semibold' : ''}`}
              title={`Line ${node.line}`}
            >
              {node.label}
            </button>
          </div>
          {!collapsed && hasChildren && (
            <div>
              {renderStructureNodes(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const handleEditorKeyDown = (event) => {
    if (!textareaRef.current || !activeTab) return;
    const textarea = textareaRef.current;
    const { selectionStart, selectionEnd, value } = textarea;
    const selectedText = value.substring(selectionStart, selectionEnd);

    // VIM mode handling
    if (vimEnabled) {
      // In normal mode, prevent default input
      if (vimMode === 'normal') {
        // Allow Escape always
        if (event.key === 'Escape') {
          return;
        }

        event.preventDefault();

        // Navigation keys
        if (event.key === 'h') { // Move left
          const newPos = Math.max(0, selectionStart - 1);
          textarea.setSelectionRange(newPos, newPos);
          updateCursorPosition(value);
          return;
        }
        if (event.key === 'l') { // Move right
          const newPos = Math.min(value.length, selectionStart + 1);
          textarea.setSelectionRange(newPos, newPos);
          updateCursorPosition(value);
          return;
        }
        if (event.key === 'j') { // Move down
          const lines = value.split('\n');
          const beforeCursor = value.substring(0, selectionStart);
          const currentLineNum = beforeCursor.split('\n').length - 1;
          if (currentLineNum < lines.length - 1) {
            const currentLineStart = beforeCursor.lastIndexOf('\n') + 1;
            const colPos = selectionStart - currentLineStart;
            const nextLineStart = value.indexOf('\n', selectionStart) + 1;
            const nextLineEnd = value.indexOf('\n', nextLineStart);
            const nextLineLength = nextLineEnd === -1 ? value.length - nextLineStart : nextLineEnd - nextLineStart;
            const newPos = nextLineStart + Math.min(colPos, nextLineLength);
            textarea.setSelectionRange(newPos, newPos);
            updateCursorPosition(value);
          }
          return;
        }
        if (event.key === 'k') { // Move up
          const beforeCursor = value.substring(0, selectionStart);
          const currentLineNum = beforeCursor.split('\n').length - 1;
          if (currentLineNum > 0) {
            const currentLineStart = beforeCursor.lastIndexOf('\n') + 1;
            const colPos = selectionStart - currentLineStart;
            const prevLineEnd = currentLineStart - 1;
            const prevLineStart = value.lastIndexOf('\n', prevLineEnd - 1) + 1;
            const prevLineLength = prevLineEnd - prevLineStart;
            const newPos = prevLineStart + Math.min(colPos, prevLineLength);
            textarea.setSelectionRange(newPos, newPos);
            updateCursorPosition(value);
          }
          return;
        }

        // Enter insert mode
        if (event.key === 'i') {
          setVimMode('insert');
          return;
        }
        if (event.key === 'a') { // Insert after cursor
          const newPos = Math.min(value.length, selectionStart + 1);
          textarea.setSelectionRange(newPos, newPos);
          setVimMode('insert');
          return;
        }
        if (event.key === 'A') { // Insert at end of line
          const lineEnd = value.indexOf('\n', selectionStart);
          const newPos = lineEnd === -1 ? value.length : lineEnd;
          textarea.setSelectionRange(newPos, newPos);
          setVimMode('insert');
          return;
        }
        if (event.key === 'I') { // Insert at beginning of line
          const beforeCursor = value.substring(0, selectionStart);
          const lineStart = beforeCursor.lastIndexOf('\n') + 1;
          textarea.setSelectionRange(lineStart, lineStart);
          setVimMode('insert');
          return;
        }
        if (event.key === 'o') { // Open line below
          const lineEnd = value.indexOf('\n', selectionStart);
          const insertPos = lineEnd === -1 ? value.length : lineEnd;
          const newValue = value.substring(0, insertPos) + '\n' + value.substring(insertPos);
          textarea.value = newValue;
          updateTabContent(activeTab.id, newValue);
          textarea.setSelectionRange(insertPos + 1, insertPos + 1);
          setVimMode('insert');
          return;
        }
        if (event.key === 'O') { // Open line above
          const beforeCursor = value.substring(0, selectionStart);
          const lineStart = beforeCursor.lastIndexOf('\n') + 1;
          const newValue = value.substring(0, lineStart) + '\n' + value.substring(lineStart);
          textarea.value = newValue;
          updateTabContent(activeTab.id, newValue);
          textarea.setSelectionRange(lineStart, lineStart);
          setVimMode('insert');
          return;
        }

        // Delete operations
        if (event.key === 'x') { // Delete character under cursor
          if (selectionStart < value.length) {
            const newValue = value.substring(0, selectionStart) + value.substring(selectionStart + 1);
            textarea.value = newValue;
            updateTabContent(activeTab.id, newValue);
            setVimRegister(value[selectionStart]);
          }
          return;
        }
        if (event.key === 'd' && event.shiftKey) { // dd - delete line
          const beforeCursor = value.substring(0, selectionStart);
          const lineStart = beforeCursor.lastIndexOf('\n') + 1;
          const lineEnd = value.indexOf('\n', selectionStart);
          const deletedLine = lineEnd === -1
            ? value.substring(lineStart)
            : value.substring(lineStart, lineEnd + 1);
          const newValue = lineEnd === -1
            ? value.substring(0, lineStart === 0 ? 0 : lineStart - 1)
            : value.substring(0, lineStart) + value.substring(lineEnd + 1);
          textarea.value = newValue;
          updateTabContent(activeTab.id, newValue);
          setVimRegister(deletedLine);
          textarea.setSelectionRange(lineStart, lineStart);
          return;
        }

        // Yank (copy)
        if (event.key === 'y' && event.shiftKey) { // yy - yank line
          const beforeCursor = value.substring(0, selectionStart);
          const lineStart = beforeCursor.lastIndexOf('\n') + 1;
          const lineEnd = value.indexOf('\n', selectionStart);
          const yankedLine = lineEnd === -1
            ? value.substring(lineStart)
            : value.substring(lineStart, lineEnd + 1);
          setVimRegister(yankedLine);
          return;
        }

        // Paste
        if (event.key === 'p') { // Paste after cursor
          if (vimRegister) {
            const newValue = value.substring(0, selectionStart) + vimRegister + value.substring(selectionStart);
            textarea.value = newValue;
            updateTabContent(activeTab.id, newValue);
            textarea.setSelectionRange(selectionStart + vimRegister.length, selectionStart + vimRegister.length);
          }
          return;
        }
        if (event.key === 'P') { // Paste before cursor
          if (vimRegister) {
            const newValue = value.substring(0, selectionStart) + vimRegister + value.substring(selectionStart);
            textarea.value = newValue;
            updateTabContent(activeTab.id, newValue);
            textarea.setSelectionRange(selectionStart, selectionStart);
          }
          return;
        }

        // Visual mode
        if (event.key === 'v') {
          setVimMode('visual');
          setVimVisualStart(selectionStart);
          return;
        }

        // Undo/Redo (let browser handle it)
        if (event.key === 'u') {
          document.execCommand('undo');
          return;
        }
        if (event.ctrlKey && event.key === 'r') {
          document.execCommand('redo');
          return;
        }

        return; // Block all other keys in normal mode
      }

      // In insert mode, allow normal typing but catch Escape to return to normal mode
      if (vimMode === 'insert') {
        if (event.key === 'Escape') {
          event.preventDefault();
          setVimMode('normal');
          return;
        }
        // Allow normal key handling for insert mode
      }

      // In visual mode
      if (vimMode === 'visual') {
        event.preventDefault();

        if (event.key === 'Escape') {
          setVimMode('normal');
          setVimVisualStart(null);
          textarea.setSelectionRange(selectionStart, selectionStart);
          return;
        }

        // Navigation in visual mode extends selection
        if (event.key === 'h') {
          const newPos = Math.max(0, selectionEnd - 1);
          textarea.setSelectionRange(vimVisualStart, newPos);
          updateCursorPosition(value);
          return;
        }
        if (event.key === 'l') {
          const newPos = Math.min(value.length, selectionEnd + 1);
          textarea.setSelectionRange(vimVisualStart, newPos);
          updateCursorPosition(value);
          return;
        }

        // Yank selection
        if (event.key === 'y') {
          const selected = value.substring(Math.min(vimVisualStart, selectionEnd), Math.max(vimVisualStart, selectionEnd));
          setVimRegister(selected);
          setVimMode('normal');
          setVimVisualStart(null);
          textarea.setSelectionRange(selectionStart, selectionStart);
          return;
        }

        // Delete selection
        if (event.key === 'd') {
          const selected = value.substring(Math.min(vimVisualStart, selectionEnd), Math.max(vimVisualStart, selectionEnd));
          setVimRegister(selected);
          const newValue = value.substring(0, Math.min(vimVisualStart, selectionEnd)) + value.substring(Math.max(vimVisualStart, selectionEnd));
          textarea.value = newValue;
          updateTabContent(activeTab.id, newValue);
          setVimMode('normal');
          setVimVisualStart(null);
          textarea.setSelectionRange(Math.min(vimVisualStart, selectionEnd), Math.min(vimVisualStart, selectionEnd));
          return;
        }

        return;
      }
    }

    // For CSV files, only handle Tab and Enter - let everything else behave normally
    if (isCSVTab && event.key !== 'Tab' && event.key !== 'Enter') {
      return; // Skip all custom key handling for CSV files except Tab and Enter
    }

    // Auto-pairing is disabled by default for more predictable editing
    // Users can enable it in settings if they want
    const autoPairs = (autoPairingEnabled && !isCSVTab) ? {
      '{': '}',
      '[': ']',
      '(': ')',
      '"': '"',
      "'": "'",
      '`': '`'
      // Note: '<' is not auto-paired here - XML auto-closing tags are handled separately
    } : {};

    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey) {
        const before = value.substring(0, selectionStart);
        const lineStart = before.lastIndexOf('\n') + 1;
        const currentIndent = value.substring(lineStart, Math.min(lineStart + INDENT_UNIT.length, value.length));
        if (currentIndent === INDENT_UNIT) {
          const newBefore = value.substring(0, lineStart);
          const newValue = newBefore + value.substring(lineStart + INDENT_UNIT.length);
          textarea.value = newValue;
          updateTabContent(activeTab.id, newValue);
          requestAnimationFrame(() => {
            if (!textareaRef.current) return;
            const newPos = Math.max(lineStart, selectionStart - INDENT_UNIT.length);
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(newPos, newPos);
            updateCursorPosition(newValue);
            syncScrollVisuals();
          });
        }
      } else {
        applyTextEdit(INDENT_UNIT, INDENT_UNIT.length);
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const before = value.substring(0, selectionStart);
      const after = value.substring(selectionEnd);
      const prevLineStart = before.lastIndexOf('\n') + 1;
      const currentLine = before.substring(prevLineStart);
      const match = currentLine.match(/^\s*/);
      const baseIndent = match ? match[0] : '';
      const trimmedLine = currentLine.trimRight();
      const lastChar = trimmedLine.slice(-1);
      const nextChar = after[0];
      let extraIndent = '';
      let closingLine = '';
      let handledStructure = false;

      const xmlMatch = (!trimmedLine.startsWith('</') && !trimmedLine.startsWith('<?') && !trimmedLine.startsWith('<!--'))
        ? trimmedLine.match(/^<([\w:\-\.]+)([^>]*)>/)
        : null;
      if (xmlMatch && !/\/>\s*$/.test(trimmedLine)) {
        extraIndent = INDENT_UNIT;
        handledStructure = true;
        const tagName = xmlMatch[1];
        const closingTag = `</${tagName}>`;
        if (after.trimStart().startsWith(closingTag)) {
          closingLine = `\n${baseIndent}`;
        }
      }

      if (!handledStructure && /[{\[\(]$/.test(trimmedLine)) {
        extraIndent = INDENT_UNIT;
        const expectedClose = BRACE_PAIRS[lastChar];
        if (expectedClose && nextChar === expectedClose) {
          closingLine = '\n' + baseIndent;
        }
      }

      const insertText = '\n' + baseIndent + extraIndent + closingLine;
      const cursorOffset = ('\n' + baseIndent + extraIndent).length;
      const cursorEndOffset = closingLine ? insertText.length - closingLine.length : insertText.length;
      applyTextEdit(insertText, cursorOffset, cursorEndOffset);
      return;
    }

    // XML auto-closing tags - only for XML/HTML files
    if (event.key === '>') {
      if (!autoPairingEnabled) {
        return;
      }

      const nextChar = value[selectionStart];

      // Skip over existing >
      if (nextChar === '>') {
        event.preventDefault();
        pendingCursorRef.current = null;
        setSelectionRange(selectionStart + 1, selectionStart + 1, value);
        return;
      }

      // Only auto-close tags for XML/HTML files
      const fileName = activeTab?.filePath || activeTab?.title || '';
      const fileExt = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
      const isXMLOrHTML = ['xml', 'html', 'htm', 'svg', 'xhtml', 'jsp', 'jspx'].includes(fileExt) ||
                          (syntaxLanguage === 'markup');

      if (isXMLOrHTML) {
        // Auto-close XML tags
        const before = value.substring(0, selectionStart);
        // Match opening tag pattern: <tagname or <tagname attr="value"
        const tagMatch = before.match(/<([a-zA-Z][a-zA-Z0-9]*)[^>]*$/);

        if (tagMatch) {
          const tagName = tagMatch[1];
          // Don't auto-close self-closing tags or if already has a closing tag nearby
          const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];

          if (!selfClosingTags.includes(tagName.toLowerCase())) {
            // Check if we're not in a self-closing tag (ending with /)
            if (!before.endsWith('/')) {
              event.preventDefault();
              const closingTag = `</${tagName}>`;
              applyTextEdit('>' + closingTag, 1);
              return;
            }
          }
        }
      }
    }

    if (autoPairs[event.key]) {
      event.preventDefault();
      const closeChar = autoPairs[event.key];
      if (selectedText) {
        applyTextEdit(event.key + selectedText + closeChar, 1, 1 + selectedText.length);
      } else {
        const nextChar = value[selectionStart];

        // Skip over closing character if it matches what we're typing
        if (nextChar === closeChar) {
          // Clear pending cursor to prevent interference
          pendingCursorRef.current = null;
          setSelectionRange(selectionStart + 1, selectionStart + 1, value);
          return;
        }

        // Otherwise, insert the auto-pair
        applyTextEdit(event.key + closeChar, 1);
      }
      return;
    }

    const closeChars = Object.values(BRACE_PAIRS);
    if (closeChars.includes(event.key)) {
      const nextChar = value[selectionStart];

      // Skip over matching closing character
      if (nextChar === event.key) {
        event.preventDefault();
        pendingCursorRef.current = null;
        setSelectionRange(selectionStart + 1, selectionStart + 1, value);
        return;
      }

      // Auto-dedent when typing closing brace
      const before = value.substring(0, selectionStart);
      const lineStart = before.lastIndexOf('\n') + 1;
      const leadingWhitespace = before.substring(lineStart, selectionStart);
      if (/^\s+$/.test(leadingWhitespace) && leadingWhitespace.length >= INDENT_UNIT.length) {
        event.preventDefault();
        const removeLength = INDENT_UNIT.length;
        const newBefore = before.substring(0, selectionStart - removeLength);
        const newValue = newBefore + event.key + value.substring(selectionEnd);
        textarea.value = newValue;
        updateTabContent(activeTab.id, newValue);
        requestAnimationFrame(() => {
          if (!textareaRef.current) return;
          const newPos = selectionStart - removeLength + 1;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newPos, newPos);
          updateCursorPosition(newValue);
          syncScrollVisuals();
        });
        return;
      }
    }
  };

  const scrollTabIntoView = (tabId) => {
    const tabElement = tabElementRefs.current.get(tabId);
    const container = tabContainerRef.current;
    if (!tabElement || !container) return;

    const padding = 24;
    const tabLeft = tabElement.offsetLeft;
    const tabRight = tabLeft + tabElement.offsetWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;

    let target = viewLeft;
    if (tabLeft < viewLeft) {
      target = Math.max(0, tabLeft - padding);
    } else if (tabRight > viewRight) {
      target = tabRight - container.clientWidth + padding;
    }

    if (target !== viewLeft) {
      container.scrollTo({ left: target, behavior: 'smooth' });
    }
  };

  const goToPreviousTab = () => {
    if (tabs.length === 0 || activeTabId === null) return;
    const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
    if (currentIndex === -1) return;
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    const prevTabId = tabs[prevIndex].id;
    setActiveTabId(prevTabId);
    // Use setTimeout to ensure the tab is set as active before scrolling
    setTimeout(() => {
      scrollTabIntoView(prevTabId);
      requestEditorFocusOnNextActive();
    }, 0);
  };

  const goToNextTab = () => {
    if (tabs.length === 0 || activeTabId === null) return;
    const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % tabs.length;
    const nextTabId = tabs[nextIndex].id;
    setActiveTabId(nextTabId);
    // Use setTimeout to ensure the tab is set as active before scrolling
    setTimeout(() => {
      scrollTabIntoView(nextTabId);
      requestEditorFocusOnNextActive();
    }, 0);
  };

  const handleTabBarDoubleClick = (event) => {
    if (typeof event.target.closest !== 'function') {
      createNewTab();
      return;
    }
    const tabElement = event.target.closest('[data-tab-item="true"]');
    if (!tabElement) {
      createNewTab();
    }
  };

  const activeTodoTab = todoTabs.find(tab => tab.id === activeTodoTabId) || todoTabs[0];

  const folderTree = useMemo(() => {
    const map = new Map();
    folders.forEach(folder => {
      map.set(folder.id, { ...folder, children: [] });
    });
    const roots = [];
    map.forEach(folder => {
      if (folder.parentId != null && map.has(folder.parentId)) {
        map.get(folder.parentId).children.push(folder);
      } else {
        roots.push(folder);
      }
    });
    const sortTree = (nodes) => nodes
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(node => ({ ...node, children: sortTree(node.children) }));
    return sortTree(roots);
  }, [folders]);

  const getDescendantFolderIds = useCallback((folderId) => {
    const results = [];
    const stack = [folderId];
    while (stack.length) {
      const current = stack.pop();
      results.push(current);
      folders.forEach(folder => {
        if (folder.parentId === current) {
          stack.push(folder.id);
        }
      });
    }
    return results;
  }, [folders]);

  const isFolderTargetAllowed = useCallback((targetId) => {
    if (!isFolderDragging) return true;
    if (dragFolderId === targetId) return false;
    const blocked = getDescendantFolderIds(dragFolderId);
    return !blocked.includes(targetId);
  }, [isFolderDragging, dragFolderId, getDescendantFolderIds]);

  const visibleNotes = useMemo(() => {
    const filtered = notes.filter(note => !note.archived);
    if (activeFolderId === null) return filtered;
    return filtered.filter(note => note.folderId === activeFolderId);
  }, [notes, activeFolderId]);

  const createFolder = (parentId = null) => {
    const name = typeof window !== 'undefined' ? window.prompt('Folder name', 'New Folder') : 'New Folder';
    const safeName = (name || 'New Folder').trim() || 'New Folder';
    setNextFolderId(prevId => {
      const newFolder = { id: prevId, parentId: parentId ?? null, name: safeName, expanded: true };
      setFolders(prev => [...prev, newFolder]);
      setActiveFolderId(newFolder.id);
      return prevId + 1;
    });
  };

  const toggleFolderExpanded = (id) => {
    setFolders(prev => prev.map(folder => folder.id === id ? { ...folder, expanded: !folder.expanded } : folder));
  };

  const renameFolder = (id, name) => {
    const safeName = (name || '').trim();
    if (!safeName) return;
    setFolders(prev => prev.map(folder => folder.id === id ? { ...folder, name: safeName } : folder));
  };

  const createNote = (folderId = activeFolderId ?? null, overrides = {}) => {
    let createdId = null;
    setNextNoteId(prevId => {
      const now = Date.now();
      const newNote = {
        id: prevId,
        folderId: folderId ?? null,
        title: overrides.title ?? '',
        content: overrides.content ?? '',
        images: overrides.images ?? [],
        archived: overrides.archived ?? false,
        createdAt: now,
        updatedAt: now
      };
      createdId = newNote.id;
      setNotes(prev => [...prev, newNote]);
      setActiveNoteId(newNote.id);
      setActiveFolderId(folderId ?? null);
      return prevId + 1;
    });
    return createdId;
  };

  const updateNote = (id, updates) => {
    setNotes(prev => prev.map(note => note.id === id ? { ...note, ...updates, updatedAt: Date.now() } : note));
  };

  const removeNote = (id) => {
    setNotes(prev => prev.filter(note => note.id !== id));
    setActiveNoteId(current => current === id ? null : current);
  };

  const archiveNote = (id) => {
    setNotes(prev => prev.map(note => note.id === id ? { ...note, archived: true, updatedAt: Date.now() } : note));
    if (activeNoteId === id) {
      setActiveNoteId(null);
    }
  };

  const deleteFolder = (id) => {
    const targets = getDescendantFolderIds(id);
    const notesInFolder = notes.filter(note => targets.includes(note.folderId));
    if (notesInFolder.length > 0) {
      const ok = typeof window === 'undefined' ? true : window.confirm('This folder contains notes. Delete it and move notes to root?');
      if (!ok) return;
    }
    setFolders(prev => prev.filter(folder => !targets.includes(folder.id)));
    setNotes(prev => prev.map(note => targets.includes(note.folderId) ? { ...note, folderId: null } : note));
    if (targets.includes(activeFolderId)) {
      setActiveFolderId(null);
    }
  };

  const moveFolderToTarget = (id, targetId) => {
    const folder = folders.find(f => f.id === id);
    if (!folder) return;
    if (targetId === id) return;
    if (targetId !== null && !folders.find(f => f.id === targetId)) return;
    const blocked = getDescendantFolderIds(id);
    if (targetId !== null && blocked.includes(targetId)) return;
    setFolders(prev => prev.map(f => f.id === id ? { ...f, parentId: targetId } : f));
    setMoveMenuFolderId(null);
  };

  const moveNoteToFolder = (noteId, targetId) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    updateNote(noteId, { folderId: targetId ?? null });
    setDragNoteId(null);
    setDragOverNoteFolderId(null);
  };

  const handleFolderDragStart = (id) => {
    setDragFolderId(id);
  };

  const handleFolderDragEnd = () => {
    setDragFolderId(null);
    setDragOverFolderId(null);
  };

  const handleFolderDragOver = (event, targetId) => {
    // Note dragging
    if (dragNoteId !== null) {
      event.preventDefault();
      setDragOverNoteFolderId(targetId);
      return;
    }
    // Folder dragging
    if (dragFolderId === null) return;
    if (!isFolderTargetAllowed(targetId)) return;
    event.preventDefault();
    setDragOverFolderId(targetId);
  };

  const handleFolderDrop = (targetId) => {
    if (dragNoteId !== null) {
      moveNoteToFolder(dragNoteId, targetId);
      return;
    }
    if (dragFolderId === null) return;
    if (!isFolderTargetAllowed(targetId)) return;
    moveFolderToTarget(dragFolderId, targetId);
    handleFolderDragEnd();
  };

  const handleNoteDragStart = (noteId, event) => {
    setDragNoteId(noteId);
    if (noteDragPreviewRef.current) {
      noteDragPreviewRef.current.remove();
      noteDragPreviewRef.current = null;
    }
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      const preview = document.createElement('div');
      preview.textContent = '≡';
      preview.style.position = 'absolute';
      preview.style.top = '-1000px';
      preview.style.left = '-1000px';
      preview.style.fontSize = '18px';
      preview.style.padding = '4px 6px';
      preview.style.background = '#111827';
      preview.style.color = '#86efac';
      preview.style.border = '1px solid #22c55e';
      preview.style.borderRadius = '6px';
      preview.style.boxShadow = '0 8px 18px rgba(0,0,0,0.4)';
      document.body.appendChild(preview);
      noteDragPreviewRef.current = preview;
      event.dataTransfer.setDragImage(preview, 8, 8);
    }
  };

  const handleNoteDragEnd = () => {
    setDragNoteId(null);
    setDragOverNoteFolderId(null);
    if (noteDragPreviewRef.current) {
      noteDragPreviewRef.current.remove();
      noteDragPreviewRef.current = null;
    }
  };

  useEffect(() => {
    // Only set a default active note when no folder is selected
    if (activeFolderId !== null) return;
    if (!activeNoteId && notes.length > 0) {
      setActiveNoteId(notes[0].id);
    }
  }, [activeNoteId, notes, activeFolderId]);

  useEffect(() => {
    if (activeFolderId === null) return;
    const inFolder = notes.filter(note => note.folderId === activeFolderId);
    if (inFolder.length === 0) {
      return;
    }
    if (!inFolder.find(note => note.id === activeNoteId)) {
      setActiveNoteId(inFolder[0].id);
    }
  }, [activeFolderId, notes, activeNoteId]);

  const createTodoTab = () => {
    const newTab = { id: nextTodoId, title: `List ${nextTodoId}`, items: [] };
    setTodoTabs([...todoTabs, newTab]);
    setActiveTodoTabId(newTab.id);
    setNextTodoId(nextTodoId + 1);
  };

  const closeTodoTab = (id) => {
    if (todoTabs.length === 1) return;
    const filtered = todoTabs.filter(tab => tab.id !== id);
    setTodoTabs(filtered);
    if (activeTodoTabId === id) {
      setActiveTodoTabId(filtered[0].id);
    }
  };

  const updateTodoTab = (id, updater) => {
    setTodoTabs(tabs => tabs.map(tab => tab.id === id ? updater(tab) : tab));
  };

  const finishQuickNote = useCallback((event = null) => {
    if (event) event.preventDefault();
    const title = quickNoteTitle.trim();
    const body = quickNoteText.trim();
    const hasImages = quickNoteImages.length > 0;
    if (!title && !body && !hasImages) {
      setQuickNoteTitle('');
      setQuickNoteText('');
      setQuickNoteImages([]);
      setIsQuickNoteExpanded(false);
      return;
    }
    const derivedTitle = title || body.split(/\s+/).slice(0, 8).join(' ').trim() || 'Untitled note';
    const escapedBody = escapeHtml(body).replace(/\n/g, '<br/>');
    const htmlBody = linkifyHtml(escapedBody);
    createNote(activeFolderId ?? null, {
      title: derivedTitle,
      content: htmlBody,
      images: quickNoteImages
    });
    setQuickNoteTitle('');
    setQuickNoteText('');
    setQuickNoteImages([]);
    setIsQuickNoteExpanded(false);
  }, [quickNoteTitle, quickNoteText, quickNoteImages, activeFolderId, createNote]);

  const formatQuickNoteAIResponse = (text) => {
    // Check if the text contains markdown formatting
    const hasMarkdown = /[#*_`\[\]]/g.test(text) || /^[-*+]\s/m.test(text) || /^\d+\.\s/m.test(text);

    if (hasMarkdown) {
      // Text appears to be markdown, parse it
      try {
        const html = marked.parse(text, { breaks: true });
        return html;
      } catch (e) {
        console.error('Error parsing markdown:', e);
        // Fall through to plain text formatting
      }
    }

    // Format as plain text for better readability
    let formatted = text.replace(/([.!?])\s*/g, '$1 ');

    // Handle line breaks and paragraphs
    formatted = formatted.split('\n').map(line => line.trim()).filter(line => line).join('\n\n');

    // Remove excessive spacing
    formatted = formatted.replace(/\s{3,}/g, '  ');

    return formatted;
  };

  const handleQuickNoteAITransform = async (action) => {
    if (!aiService || !quickNoteText.trim()) {
      if (!quickNoteText.trim()) {
        showTransientMessage('Please enter some text first', 'warn');
      }
      return;
    }

    setIsQuickNoteAIProcessing(true);
    setShowQuickNoteAIMenu(false);

    try {
      // Store original content
      setQuickNoteOriginalText(quickNoteText);

      const transformed = await aiService.transformText(quickNoteText, action, aiSettings);

      // Format the AI response
      const formatted = formatQuickNoteAIResponse(transformed);

      // Show suggestion for accept/reject
      setQuickNoteAISuggestion(formatted);
    } catch (error) {
      console.error('AI transformation error:', error);
      showTransientMessage(`AI transformation failed: ${error.message}`, 'error');
    } finally {
      setIsQuickNoteAIProcessing(false);
    }
  };

  const handleAcceptQuickNoteAISuggestion = () => {
    if (!quickNoteAISuggestion) return;

    // Update quick note with the AI suggestion
    // If it's HTML (markdown rendered), convert back to plain text for the textarea
    let textToSet = quickNoteAISuggestion;
    if (quickNoteAISuggestion.startsWith('<')) {
      // Create a temporary div to extract text content from HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = quickNoteAISuggestion;
      textToSet = tempDiv.textContent || tempDiv.innerText || '';
    }
    setQuickNoteText(textToSet);

    // Clear suggestion
    setQuickNoteAISuggestion(null);
    setQuickNoteOriginalText('');
  };

  const handleRejectQuickNoteAISuggestion = () => {
    // Restore original content
    if (quickNoteOriginalText) {
      setQuickNoteText(quickNoteOriginalText);
    }

    // Clear suggestion
    setQuickNoteAISuggestion(null);
    setQuickNoteOriginalText('');
  };

  const handleQuickNotePaste = (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    let handledImage = false;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (e) => {
          setQuickNoteImages(prev => [...prev, { id: Date.now() + Math.random(), url: e.target?.result }]);
        };
        reader.readAsDataURL(file);
        handledImage = true;
      }
    }
    if (handledImage) {
      event.preventDefault();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!isQuickNoteExpanded) return;
      if (quickNoteContainerRef.current && quickNoteContainerRef.current.contains(event.target)) return;
      finishQuickNote();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isQuickNoteExpanded, finishQuickNote]);

  const addTodoItem = () => {
    if (!activeTodoTab) return;
    const text = newTodoText.trim();
    if (!text) return;
    const item = {
      id: Date.now(),
      text,
      dueDate: newTodoDueDate || null,
      completedDate: null,
      done: false
    };
    updateTodoTab(activeTodoTab.id, tab => ({ ...tab, items: [...tab.items, item] }));
    setNewTodoText('');
    setNewTodoDueDate('');
  };

  const toggleTodoItem = (id) => {
    updateTodoTab(activeTodoTabId, tab => ({
      ...tab,
      items: tab.items.map(item => item.id === id ? { ...item, done: !item.done, completedDate: !item.done ? new Date().toISOString().slice(0, 10) : null } : item)
    }));
  };

  const removeTodoItem = (id) => {
    updateTodoTab(activeTodoTabId, tab => ({ ...tab, items: tab.items.filter(item => item.id !== id) }));
  };

  const moveTodoItem = (draggedIdRaw, direction = 0, targetIdRaw = null) => {
    const draggedId = Number(draggedIdRaw);
    const targetId = targetIdRaw !== null ? Number(targetIdRaw) : null;
    updateTodoTab(activeTodoTabId, tab => {
      const idx = tab.items.findIndex(item => item.id === draggedId);
      if (idx === -1) return tab;
      const newItems = [...tab.items];
      const [moved] = newItems.splice(idx, 1);
      if (direction !== 0) {
        const newIdx = Math.min(Math.max(idx + direction, 0), newItems.length);
        newItems.splice(newIdx, 0, moved);
      } else if (targetId !== null) {
        let targetIdx = newItems.findIndex(item => item.id === targetId);
        if (targetIdx === -1) {
          newItems.push(moved);
        } else {
          newItems.splice(targetIdx, 0, moved);
        }
      } else {
        newItems.push(moved);
      }
      return { ...tab, items: newItems };
    });
  };

  const activeTab = tabs.find(t => t.id === activeTabId);
  const editorLines = activeTab && activeTab.content ? String(activeTab.content).split('\n') : [];


  // Detect if current file should have syntax highlighting - needs to be before CSV/Markdown detection
  const syntaxLanguage = useMemo(() => {
    const fileName = activeTab?.filePath || activeTab?.title || '';
    const content = activeTab?.content || '';
    const fileSize = activeTab?.fileSize || 0;

    // Disable syntax highlighting for large files (> 10MB) to prevent editor lag
    // CodeMirror 6 can handle large files, but syntax highlighting is expensive
    const SYNTAX_HIGHLIGHT_LIMIT = 10 * 1024 * 1024; // 10MB
    if (fileSize > SYNTAX_HIGHLIGHT_LIMIT) {
      console.log(`[Performance] Disabling syntax highlighting for ${(fileSize / 1024 / 1024).toFixed(1)}MB file`);
      return null; // No syntax highlighting for large files
    }

    // First try filename-based detection
    const filenameLang = getPrismLanguage(fileName);
    if (filenameLang) return filenameLang;

    // If no filename match, try content-based detection
    const contentLang = detectLanguageFromContent(content);
    return contentLang;
  }, [activeTab?.filePath, activeTab?.title, activeTab?.content, activeTab?.fileSize]);

  const isCsvFileName = useMemo(() => {
    const name = (activeTab?.filePath || activeTab?.title || '').toLowerCase();
    return name.endsWith('.csv');
  }, [activeTab?.filePath, activeTab?.title]);
  const isCsvByContent = useMemo(() => {
    if (isCsvFileName) return false;
    if (!activeTab?.content) return false;
    // Don't detect CSV if we already have a recognized programming language from filename or content
    if (syntaxLanguage && syntaxLanguage !== 'markdown') return false;
    return detectCSVContent(activeTab.content, activeTab?.title || activeTab?.filePath || '');
  }, [activeTab?.content, activeTab?.title, activeTab?.filePath, isCsvFileName, syntaxLanguage]);
  const shouldAutoCsv = useMemo(() => {
    if (isCsvFileName) return true;
    const tabId = activeTab?.id;
    if (tabId && csvDetectionLocks[tabId]) return true;
    return isCsvByContent;
  }, [isCsvFileName, isCsvByContent, csvDetectionLocks, activeTab?.id]);
  const isCSVTab = shouldAutoCsv;

  // Markdown detection
  const isMarkdownFileName = useMemo(() => {
    const name = (activeTab?.filePath || activeTab?.title || '').toLowerCase();
    return name.endsWith('.md') || name.endsWith('.markdown');
  }, [activeTab?.filePath, activeTab?.title]);
  const isMarkdownByContent = useMemo(() => {
    if (isMarkdownFileName) return false;
    if (!activeTab?.content) return false;
    // Don't detect Markdown if we already have a recognized programming language from filename or content
    if (syntaxLanguage && syntaxLanguage !== 'markdown') return false;
    return detectMarkdownContent(activeTab.content, activeTab?.title || '');
  }, [activeTab?.content, activeTab?.title, isMarkdownFileName, syntaxLanguage]);
  const shouldAutoMarkdown = useMemo(() => {
    if (isMarkdownFileName) return true;
    return isMarkdownByContent;
  }, [isMarkdownFileName, isMarkdownByContent]);
  const isMarkdownTab = shouldAutoMarkdown && !isCSVTab; // CSV takes precedence
  const getMarkdownLineCount = useCallback(() => {
    const text = activeTab?.content || '';
    if (!text) return 1;
    const lines = text.split('\n');
    return Math.max(1, lines.length);
  }, [activeTab?.content]);
  const markdownSyncScroll = useCallback((targetLine) => {
    if (!isMarkdownTab || !markdownPreviewRef.current) return;
    const preview = markdownPreviewRef.current;
    const totalLines = getMarkdownLineCount();
    const safeLine = Math.max(1, Math.min(targetLine || 1, totalLines));
    const ratio = (safeLine - 1) / Math.max(1, totalLines - 1);
    const target = ratio * Math.max(0, preview.scrollHeight - preview.clientHeight);
    preview.scrollTo({ top: target, behavior: 'smooth' });
  }, [isMarkdownTab, getMarkdownLineCount]);

  const markdownSyncEditor = useCallback((targetLine) => {
    if (!isMarkdownTab || !codeMirrorRef.current) return;
    const line = Math.max(1, targetLine || 1);
    const content = codeMirrorRef.current.getValue();
    const index = getIndexFromLineColumn(content, line, 1);
    focusEditorRange(index, index);
  }, [isMarkdownTab]);

  const handleMarkdownEditorClick = useCallback(() => {
    if (!isMarkdownTab || !codeMirrorRef.current) return;
    const view = codeMirrorRef.current.getView();
    if (!view) return;
    const pos = view.state.selection.main.head;
    const content = view.state.doc.toString();
    const { line } = getLineColumnFromIndex(content, pos);
    markdownSyncScroll(line);
  }, [isMarkdownTab, markdownSyncScroll]);

  const handleMarkdownPreviewClick = useCallback((event) => {
    if (!isMarkdownTab || !markdownPreviewRef.current || !codeMirrorRef.current) return;
    const preview = markdownPreviewRef.current;
    const rect = preview.getBoundingClientRect();
    const offsetY = event.clientY - rect.top + preview.scrollTop;
    const ratio = preview.scrollHeight > 0 ? offsetY / preview.scrollHeight : 0;
    const totalLines = getMarkdownLineCount();
    const targetLine = Math.min(totalLines, Math.max(1, Math.round(ratio * Math.max(totalLines - 1, 0)) + 1));
    markdownSyncEditor(targetLine);
  }, [isMarkdownTab, markdownPreviewRef, getMarkdownLineCount, markdownSyncEditor]);

  const shouldShowSyntaxHighlighting = useMemo(() => {
    return syntaxLanguage !== null;
  }, [syntaxLanguage]);

  const editorTopPaddingPx = '16px';
  const parsedCsvContent = useMemo(() => {
    if (!isCSVTab || !activeTab?.content) return [];
    return parseCSV(activeTab.content);
  }, [isCSVTab, activeTab?.content]);
  const csvData = useMemo(() => {
    if (!isCSVTab || !activeTab) return null;
    const existing = csvEditMap[activeTab.id];
    const source = existing && existing.length ? existing : parsedCsvContent;
    return source.length ? source : [['']];
  }, [isCSVTab, activeTab?.id, csvEditMap, parsedCsvContent]);
  const csvPreviewStats = useMemo(() => {
    if (!csvData) return null;
    const columnCount = csvData.reduce((max, row) => Math.max(max, row.length), 0);
    const header = columnCount > 0 ? (csvData[0] || Array.from({ length: columnCount }).map(() => '')) : [];
    const rows = csvData.slice(1);
    return { header, rows, columnCount, rowCount: csvData.length };
  }, [csvData]);

  // Markdown preview HTML
  const markdownHtml = useMemo(() => {
    if (!isMarkdownTab || !activeTab?.content) return '';
    try {
      return marked.parse(activeTab.content);
    } catch (error) {
      console.error('Markdown parsing error:', error);
      return '<p style="color: red;">Error parsing markdown</p>';
    }
  }, [isMarkdownTab, activeTab?.content]);
  const csvRowCount = useMemo(() => {
    if (!csvData || csvData.length <= 1) return 0;
    return csvData.length - 1;
  }, [csvData]);
  const csvColumnWidthsForTab = useMemo(() => {
    if (!csvPreviewStats || !activeTab) return [];
    const stored = csvColumnWidths[activeTab.id] || [];
    return Array.from({ length: csvPreviewStats.columnCount }, (_, idx) => stored[idx] ?? DEFAULT_CSV_COLUMN_WIDTH);
  }, [csvPreviewStats?.columnCount, csvColumnWidths, activeTab?.id]);
  const csvTotalWidth = useMemo(() => {
    if (!csvPreviewStats) return 0;
    return csvColumnWidthsForTab.reduce((sum, width) => sum + (width || DEFAULT_CSV_COLUMN_WIDTH), 0);
  }, [csvPreviewStats, csvColumnWidthsForTab]);
  const csvRowRanges = useMemo(() => {
    if (!isCSVTab || !activeTab?.content) return [];
    return computeCsvRowRanges(activeTab.content);
  }, [isCSVTab, activeTab?.content]);
  const csvEditorRowEntries = useMemo(() => {
    if (!isCSVTab || !csvRowRanges.length || csvRowCount === 0) return [];
    const usableRows = Math.min(csvRowCount, Math.max(0, csvRowRanges.length - 1));
    const entries = [];
    for (let i = 0; i < usableRows; i++) {
      const target = csvRowRanges[i + 1];
      if (!target) break;
      entries.push({ rowIndex: i, ...target });
    }
    return entries;
  }, [isCSVTab, csvRowRanges, csvRowCount]);
  const csvPreviewRows = useMemo(() => {
    if (!csvPreviewStats) return [];
    if (csvPreviewStats.rows.length > 0) return csvPreviewStats.rows;
    return csvData || [];
  }, [csvPreviewStats, csvData]);
  const csvPreviewHasDataRows = !!(csvPreviewStats?.rows?.length);
  // High-contrast row highlight colors for CSV preview
  const csvRowHighlightBg = theme === 'dark' ? 'rgb(133, 77, 14)' : 'rgb(254, 243, 199)';
  const csvRowHighlightLineBg = theme === 'dark' ? 'rgb(133, 77, 14)' : '#e5e7eb';
  const csvRowHighlightTextClass = theme === 'dark' ? 'text-white' : 'text-gray-700';

  useEffect(() => {
    // Don't manage isCsvEditorCollapsed for markdown files
    // Markdown uses isMarkdownPreviewCollapsed instead
    if (isMarkdownTab) {
      console.log('[Markdown] Markdown file detected - using isMarkdownPreviewCollapsed for layout');
      return;
    }

    if (!isCSVTab) {
      console.log('[Editor] Setting isCsvEditorCollapsed = false (not CSV or markdown)');
      setIsCsvEditorCollapsed(false);
      return;
    }
    console.log('[CSV] Managing CSV preview height');
    setCsvPreviewHeight(prev => Math.min(MAX_CSV_PREVIEW_HEIGHT, Math.max(MIN_CSV_PREVIEW_HEIGHT, prev)));
  }, [isCSVTab, isMarkdownTab]);

  useEffect(() => {
    if (!activeTab || !isCSVTab || !csvPreviewStats?.columnCount) return;
    setCsvColumnWidths(prev => {
      const existing = prev[activeTab.id];
      const nextColumns = csvPreviewStats.columnCount;
      if (existing && existing.length >= nextColumns) return prev;
      const newWidths = Array.from({ length: nextColumns }, (_, idx) => existing?.[idx] ?? DEFAULT_CSV_COLUMN_WIDTH);
      return { ...prev, [activeTab.id]: newWidths };
    });
  }, [activeTab?.id, isCSVTab, csvPreviewStats?.columnCount]);

  useEffect(() => {
    if (!activeTab || isCsvFileName) return;
    if (!isCsvByContent) return;
    const tabId = activeTab.id;
    if (csvDetectionLocks[tabId]) return;
    setCsvDetectionLocks(prev => ({ ...prev, [tabId]: true }));
    setCsvDetectionMessage('Detected CSV text, switching to CSV editor…');
    if (csvDetectionMessageTimeoutRef.current) {
      clearTimeout(csvDetectionMessageTimeoutRef.current);
    }
    csvDetectionMessageTimeoutRef.current = setTimeout(() => {
      setCsvDetectionMessage(null);
    }, 5000);
  }, [activeTab?.id, isCsvFileName, isCsvByContent, csvDetectionLocks]);

  // Markdown detection message
  useEffect(() => {
    if (!activeTab || isMarkdownFileName || isCSVTab) return;
    if (!isMarkdownByContent) return;
    setMarkdownDetectionMessage('Detected markdown file, switching to Markdown editor…');
    if (markdownDetectionMessageTimeoutRef.current) {
      clearTimeout(markdownDetectionMessageTimeoutRef.current);
    }
    markdownDetectionMessageTimeoutRef.current = setTimeout(() => {
      setMarkdownDetectionMessage(null);
    }, 5000);
  }, [activeTab?.id, isMarkdownFileName, isMarkdownByContent, isCSVTab]);

  const structureTree = useMemo(() => {
    if (!activeTab?.content) return { type: null, nodes: [] };
    const trimmed = String(activeTab.content).trim();
    if (!trimmed) return { type: null, nodes: [] };

    // Check file type - only show structure for JSON, XML, YAML, and TOML files
    const fileName = activeTab?.filePath || activeTab?.title || '';
    const fileType = getFileType(fileName);

    // Use format service for detection
    const detection = formatService.detect(trimmed, fileName);

    // Only show structure tree for supported formats
    if (detection.format === 'json' || ((fileType.type === 'json' || fileType.type === 'text') && (trimmed.startsWith('{') || trimmed.startsWith('[')))) {
      if (looksLikeJSON(trimmed)) {
        return { type: 'JSON', nodes: buildJSONStructure(activeTab.content) };
      }
    }

    if (detection.format === 'xml' || ((fileType.type === 'markup' || fileType.type === 'text') && trimmed.startsWith('<'))) {
      return { type: 'XML', nodes: buildXMLStructure(activeTab.content) };
    }

    // YAML support using format service
    if (detection.format === 'yaml' || (fileType.type === 'config' && (fileName.endsWith('.yaml') || fileName.endsWith('.yml')))) {
      const result = formatService.buildStructure(activeTab.content, 'yaml');
      if (result.errors.length === 0) {
        return { type: 'YAML', nodes: result.nodes };
      }
      return { type: 'YAML', nodes: [] };
    }

    // TOML support using format service
    if (detection.format === 'toml' || (fileType.type === 'config' && fileName.endsWith('.toml'))) {
      const result = formatService.buildStructure(activeTab.content, 'toml');
      if (result.errors.length === 0) {
        return { type: 'TOML', nodes: result.nodes };
      }
      return { type: 'TOML', nodes: [] };
    }

    return { type: null, nodes: [] };
  }, [activeTab?.content, activeTab?.filePath, activeTab?.title]);

  const structureNodeList = useMemo(() => {
    const list = [];
    const walk = (nodes) => {
      nodes.forEach(node => {
        list.push(node);
        if (node.children?.length) {
          walk(node.children);
        }
      });
    };
    walk(structureTree.nodes || []);
    return list;
  }, [structureTree]);

  const activeStructureId = useMemo(() => {
    if (!cursorPosition || structureNodeList.length === 0) return null;
    let candidate = null;
    let bestDiff = Infinity;
    structureNodeList.forEach(node => {
      const diff = cursorPosition.line - node.line;
      if (diff >= 0 && diff < bestDiff) {
        candidate = node;
        bestDiff = diff;
      }
    });
    return candidate?.id ?? structureNodeList[0]?.id ?? null;
  }, [cursorPosition, structureNodeList]);

  useEffect(() => {
    setStructureCollapsed({});
  }, [structureTree.type, activeTabId]);

  useEffect(() => {
    if (!isCSVTab || !activeTab) return;
    setCsvEditMap(prev => {
      const parsed = parsedCsvContent.length ? parsedCsvContent : [['']];
      const existing = prev[activeTab.id];
      if (!existing) {
        return { ...prev, [activeTab.id]: parsed };
      }
      const serializedExisting = serializeCSV(existing);
      if (String(serializedExisting).trim() === String(activeTab.content || '').trim()) {
        return prev;
      }
      return { ...prev, [activeTab.id]: parsed };
    });
  }, [isCSVTab, activeTab?.id, activeTab?.content, parsedCsvContent]);

  useEffect(() => {
    if (activeCsvRowIndex != null && activeCsvRowIndex >= csvRowCount) {
      setActiveCsvRowIndex(csvRowCount > 0 ? Math.min(activeCsvRowIndex, csvRowCount - 1) : null);
    }
  }, [csvRowCount, activeCsvRowIndex]);

  useEffect(() => {
    if (!isCSVTab && activeCsvRowIndex !== null) {
      setActiveCsvRowIndex(null);
    }
  }, [isCSVTab, activeCsvRowIndex]);

  useEffect(() => {
    csvPreviewRowRefs.current = new Map();
  }, [csvData, activeTab?.id]);

  useEffect(() => {
    const map = new Map();
    csvEditorRowEntries.forEach(entry => {
      map.set(entry.rowIndex, entry);
    });
    csvEditorRowRefs.current = map;
  }, [csvEditorRowEntries]);

  useEffect(() => {
    if (!isCSVTab || activeCsvRowIndex == null) return;
    requestAnimationFrame(() => {
      const previewRow = csvPreviewRowRefs.current.get(activeCsvRowIndex);
      if (previewRow) {
        previewRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const editorEntry = csvEditorRowRefs.current.get(activeCsvRowIndex);
      if (editorEntry && textareaRef.current) {
        const textarea = textareaRef.current;
        const lineHeight = 24;
        const targetLineIndex = Math.max(0, (editorEntry.lineNumber || 1) - 1);
        const targetTop = Math.max(0, targetLineIndex * lineHeight - textarea.clientHeight / 2 + lineHeight);
        if (typeof textarea.scrollTo === 'function') {
          textarea.scrollTo({ top: targetTop, behavior: 'smooth' });
        } else {
          textarea.scrollTop = targetTop;
        }
        syncScrollVisuals();
      }
    });
  }, [isCSVTab, activeCsvRowIndex, activeTab?.id, syncScrollVisuals]);

  useEffect(() => {
    if (!structureRef.current || !activeStructureNodeRef.current) return;
    const container = structureRef.current;
    const target = activeStructureNodeRef.current;
    const getOffset = (el, parent) => {
      let offset = 0;
      let node = el;
      while (node && node !== parent) {
        offset += node.offsetTop;
        node = node.offsetParent;
      }
      return offset;
    };
    const offsetTop = getOffset(target, container);
    const desiredTop = Math.max(0, offsetTop - container.clientHeight / 2 + target.offsetHeight / 2);
    container.scrollTo({ top: desiredTop, behavior: 'auto' });
  }, [activeStructureId, structureTree, editorLines.length]);

  const errorsByLine = useMemo(() => {
    const map = new Map();
    if (errorMessage?.allErrors) {
      errorMessage.allErrors.forEach(error => {
        if (!error.line) return;
        const column = error.column || 1;
        if (!map.has(error.line)) {
          map.set(error.line, []);
        }
        map.get(error.line).push({ ...error, column });
      });
      map.forEach(list => list.sort((a, b) => (a.column || 1) - (b.column || 1)));
    }
    return map;
  }, [errorMessage]);

  const braceMarkersByLine = useMemo(() => {
    const map = new Map();
    if (braceMatch) {
      [braceMatch.open, braceMatch.close].forEach(marker => {
        if (!marker || !marker.line) return;
        if (!map.has(marker.line)) {
          map.set(marker.line, []);
        }
        map.get(marker.line).push(marker);
      });
      map.forEach(list => list.sort((a, b) => (a.column || 1) - (b.column || 1)));
    }
    return map;
  }, [braceMatch]);

  const renderNotesPanel = () => {
    const sidebarStyle = { width: `${Math.round(notesSidebarWidth)}px` };
    const modalNote = openNoteModalId ? notes.find(note => note.id === openNoteModalId) : null;

    const renderFolderNode = (folder, depth = 0) => {
      const isExpanded = folder.expanded !== false;
      const hasChildren = Array.isArray(folder.children) && folder.children.length > 0;
      const isInvalidTarget = isFolderDragging && !isFolderTargetAllowed(folder.id);
      return (
        <div key={folder.id} className="space-y-1">
          <div
            className={`relative flex items-center justify-between gap-2 px-3 py-2 rounded cursor-pointer ${folder.id === activeFolderId ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-900/60'} ${dragOverFolderId === folder.id || dragOverNoteFolderId === folder.id ? 'border border-indigo-500' : 'border border-transparent'} ${isInvalidTarget ? 'cursor-not-allowed opacity-50' : ''}`}
            onClick={() => setActiveFolderId(folder.id)}
            onDragOver={(event) => handleFolderDragOver(event, folder.id)}
            onDrop={() => handleFolderDrop(folder.id)}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0" style={{ paddingLeft: depth * 12 }}>
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-800"
                onClick={(event) => { event.stopPropagation(); toggleFolderExpanded(folder.id); }}
                aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {isExpanded ? <FolderOpen className="w-4 h-4 text-indigo-400" /> : <Folder className="w-4 h-4 text-indigo-400" />}
              <span className="text-sm font-medium truncate">{folder.name}</span>
            </div>
            <div className="flex items-center gap-1 opacity-80">
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-800"
                title="New subfolder"
                onClick={(event) => { event.stopPropagation(); createFolder(folder.id); }}
              >
                <FolderPlus className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-800"
                title="Rename folder"
                onClick={(event) => {
                  event.stopPropagation();
                  const name = typeof window !== 'undefined' ? window.prompt('Rename folder', folder.name) : folder.name;
                  renameFolder(folder.id, name);
                }}
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-800"
                title="Move folder"
                data-move-toggle="true"
                draggable
                onDragStart={() => handleFolderDragStart(folder.id)}
                onDragEnd={handleFolderDragEnd}
                onClick={(event) => { event.stopPropagation(); setMoveMenuFolderId(prev => prev === folder.id ? null : folder.id); }}
              >
                <GripVertical className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-800 text-red-400"
                title="Delete folder"
                onClick={(event) => { event.stopPropagation(); deleteFolder(folder.id); }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {isNoteDragging && dragOverNoteFolderId === folder.id && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-green-600/80 text-white text-xs font-semibold px-2 py-1 rounded-full shadow-lg">
                <Plus className="w-3 h-3" />
                <span>Move here</span>
              </div>
            )}
          </div>
          {moveMenuFolderId === folder.id && (
            <div className="pl-8 pr-3 pb-2" data-move-menu="true">
              <div className="text-[11px] text-gray-500 mb-1">Move “{folder.name}” to:</div>
              <select
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
                value={folder.parentId ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const targetId = value === '' ? null : Number(value);
                  moveFolderToTarget(folder.id, targetId);
                }}
              >
                <option value="">Root</option>
                {folders
                  .filter(f => f.id !== folder.id && !getDescendantFolderIds(folder.id).includes(f.id))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
              </select>
            </div>
          )}
          {isExpanded && hasChildren && (
            <div className="space-y-1">
              {folder.children.map(child => renderFolderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    };

    const activeFolderName = activeFolderId === null
      ? 'All Notes'
      : (folders.find(folder => folder.id === activeFolderId)?.name || 'Notes');

    return (
      <>
      <div className="flex h-full group/notes">
        <div className="border-r border-gray-800 flex flex-col" style={sidebarStyle}>
          <div className="px-4 py-3 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-400">TIDY CODE</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">BETA</span>
                </div>
                <div className="text-sm font-medium text-gray-300">Notes</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => createFolder(activeFolderId ?? null)}
                  className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-200"
                  title="Create Folder"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => createNote(activeFolderId ?? null)}
                  className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-200"
                  title="Create Note"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
          <div
            className={`relative px-3 py-2 rounded cursor-pointer ${activeFolderId === null ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-900/60'} ${dragOverNoteFolderId === null && dragNoteId !== null ? 'border border-indigo-500' : 'border border-transparent'} ${isFolderDragging && !isFolderTargetAllowed(null) ? 'cursor-not-allowed opacity-50' : ''}`}
            onClick={() => setActiveFolderId(null)}
            onDragOver={(event) => handleFolderDragOver(event, null)}
            onDrop={() => handleFolderDrop(null)}
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-medium">All Notes</span>
            </div>
            {isNoteDragging && dragOverNoteFolderId === null && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-green-600/80 text-white text-xs font-semibold px-2 py-1 rounded-full shadow-lg">
                <Plus className="w-3 h-3" />
                <span>Move here</span>
              </div>
            )}
          </div>
            <div className="mt-2 space-y-1">
              {folderTree.length === 0 && (
                <div className="text-xs text-gray-500 px-3 py-2">No folders yet. Create one to get started.</div>
              )}
              {folderTree.map(folder => renderFolderNode(folder))}
            </div>
          </div>
          {/* Ad Banner - Notes panel sidebar (web only) */}
          {!isDesktop() && (
            <AdBanner
              theme={theme}
              onClose={() => console.log('[AdBanner] User requested to hide ads')}
            />
          )}
        </div>
        <button
          type="button"
          className="w-2 bg-gray-900/80 hover:bg-indigo-500 cursor-col-resize transition-colors flex items-center justify-center rounded-md border border-gray-800"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize notes panel"
          onMouseDown={handleNotesResizeStart}
        >
          <span className="h-8 w-0.5 bg-gray-500 rounded-full" />
        </button>
        <div className="flex-1 flex flex-col">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">{activeFolderName}</div>
              <div className="text-xs text-gray-500">{visibleNotes.length} note{visibleNotes.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div
              ref={quickNoteContainerRef}
              className="bg-gray-900 border border-dashed border-gray-700 rounded-lg p-3 space-y-2"
              onPaste={handleQuickNotePaste}
              onDragOver={(event) => handleFolderDragOver(event, null)}
              onDrop={() => handleFolderDrop(null)}
            >
              {isQuickNoteExpanded ? (
                <form className="space-y-2" onSubmit={finishQuickNote}>
                  <div className="flex items-center justify-between gap-2">
                    <input
                      ref={quickNoteInputRef}
                      value={quickNoteTitle}
                      onChange={(e) => setQuickNoteTitle(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-gray-200 focus:outline-none border-b border-gray-700 pb-1"
                      placeholder="Title"
                    />
                    {aiService && aiSettings?.provider !== 'tinyllm' && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowQuickNoteAIMenu(!showQuickNoteAIMenu)}
                          disabled={isQuickNoteAIProcessing || quickNoteAISuggestion}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${(isQuickNoteAIProcessing || quickNoteAISuggestion) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800 text-gray-400 hover:text-white'}`}
                          title="AI Tools"
                        >
                          {isQuickNoteAIProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          <span>AI</span>
                        </button>
                        {showQuickNoteAIMenu && !quickNoteAISuggestion && (
                          <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-10 min-w-[160px]">
                            <button
                              type="button"
                              onClick={() => handleQuickNoteAITransform('improve')}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                            >
                              Improve Writing
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickNoteAITransform('rewrite')}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                            >
                              Rewrite
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickNoteAITransform('rephrase')}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                            >
                              Rephrase
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickNoteAITransform('fix-grammar')}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                            >
                              Fix Grammar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickNoteAITransform('summarize')}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                            >
                              Summarize
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickNoteAITransform('expand')}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 text-gray-200"
                            >
                              Expand
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* AI Suggestion Preview */}
                  {quickNoteAISuggestion && (
                    <div className="border border-blue-500 bg-gray-800 rounded p-2">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-3 h-3 text-blue-400" />
                          <span className="text-xs font-medium text-gray-200">AI Suggestion</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={handleAcceptQuickNoteAISuggestion}
                            className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition-colors"
                            title="Accept Suggestion"
                          >
                            <Check className="w-3 h-3" />
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={handleRejectQuickNoteAISuggestion}
                            className="flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
                            title="Reject Suggestion"
                          >
                            <XCircle className="w-3 h-3" />
                            Reject
                          </button>
                        </div>
                      </div>
                      <div
                        className="bg-gray-900 rounded p-2 text-gray-200 text-xs max-h-[150px] overflow-y-auto prose prose-invert prose-xs max-w-none"
                        dangerouslySetInnerHTML={{ __html: quickNoteAISuggestion.startsWith('<') ? quickNoteAISuggestion : `<pre style="white-space: pre-wrap; margin: 0; font-size: 0.75rem;">${quickNoteAISuggestion}</pre>` }}
                      />
                    </div>
                  )}

                  <textarea
                    value={quickNoteText}
                    onChange={(e) => setQuickNoteText(e.target.value)}
                    disabled={quickNoteAISuggestion}
                    className="w-full bg-transparent text-sm text-gray-200 focus:outline-none resize-none min-h-[100px] disabled:opacity-50"
                    placeholder="Take a note..."
                  />
                  {quickNoteImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {quickNoteImages.map(img => (
                        <div key={img.id} className="bg-gray-800 border border-gray-700 rounded p-1">
                          <img src={img.url} alt="attachment" className="w-full h-24 object-cover rounded" />
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-500 pt-1">Click away to save automatically. Paste images or URLs here.</p>
                </form>
              ) : (
                <button
                  className="w-full text-left text-sm text-gray-400 hover:text-white flex items-center gap-2"
                  onClick={() => setIsQuickNoteExpanded(true)}
                >
                  <Plus className="w-4 h-4" />
                  Take a note
                </button>
              )}
            </div>
            {visibleNotes.length === 0 ? (
              <div className="h-full border border-dashed border-gray-700 rounded-lg flex items-center justify-center text-sm text-gray-500">
                No notes in this folder yet. Create one to start writing.
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleNotes.map(note => {
                  const previewText = stripHtml(note.content || note.title || '').slice(0, 180) || 'Untitled';
                  const firstImage = note.images?.[0];
                  return (
                    <div
                      key={note.id}
                      className="bg-gray-900 border border-gray-800 hover:border-indigo-500 rounded-lg overflow-hidden h-56 flex flex-col cursor-pointer transition-colors"
                      onClick={() => { setActiveNoteId(note.id); setOpenNoteModalId(note.id); }}
                    >
                      <div className="relative h-24 bg-gray-800">
                        {firstImage ? (
                          <img src={firstImage.url} alt="note" className="w-full h-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xs text-gray-500">No image</div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 flex items-center justify-between">
                          <span className="text-white text-sm font-semibold truncate">{String(note.title || '').trim() || 'Untitled note'}</span>
                          <span className="text-[10px] text-gray-200">{note.images?.length || 0} img</span>
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col p-3 gap-2">
                        <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">{previewText}</p>
                        <div className="flex items-center justify-between text-[10px] text-gray-500 mt-auto pt-1">
                          <span>{new Date(note.updatedAt || note.createdAt).toLocaleDateString()}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-gray-800"
                              draggable
                              onDragStart={(event) => handleNoteDragStart(note.id, event)}
                              onDragEnd={handleNoteDragEnd}
                              title="Drag to folder"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <GripVertical className="w-4 h-4 text-indigo-300" />
                            </button>
                            <button
                              className="text-indigo-400 hover:text-indigo-200"
                              onClick={(event) => { event.stopPropagation(); setActiveNoteId(note.id); setOpenNoteModalId(note.id); }}
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {modalNote && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4">
          <div
            ref={noteModalRef}
            className="bg-gray-900 border border-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto"
            onPaste={(event) => {
              const items = event.clipboardData?.items;
              if (!items) return;
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  const file = item.getAsFile();
                  if (!file) continue;
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    updateNote(modalNote.id, {
                      images: [...(modalNote.images || []), { id: Date.now(), url: e.target?.result }]
                    });
                  };
                  reader.readAsDataURL(file);
                  event.preventDefault();
                }
              }
            }}
          >
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800 gap-3">
              <div className="flex-1 space-y-2">
                <input
                  className="w-full bg-transparent text-lg font-semibold text-white focus:outline-none border-b border-gray-800 pb-1"
                  value={modalNote.title}
                  onChange={(e) => updateNote(modalNote.id, { title: e.target.value })}
                  placeholder="Untitled note"
                />
                <div className="text-xs text-gray-500">{modalNote.images?.length || 0} attachment(s)</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-xs text-yellow-300 hover:text-yellow-200 border border-yellow-500/60 px-2 py-1 rounded"
                  onClick={() => { archiveNote(modalNote.id); setOpenNoteModalId(null); }}
                >
                  Archive
                </button>
                <button
                  className="text-xs text-red-300 hover:text-red-200 border border-red-500/60 px-2 py-1 rounded"
                  onClick={() => { removeNote(modalNote.id); setOpenNoteModalId(null); }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setOpenNoteModalId(null)}
                  className="text-gray-400 hover:text-white"
                  title="Close note"
                  aria-label="Close note"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="px-5 py-4 space-y-4">
              <RichTextEditor
                value={modalNote.content}
                onChange={(value) => updateNote(modalNote.id, { content: value })}
                aiService={aiService}
                aiSettings={aiSettings}
                notify={showTransientMessage}
              />
              {modalNote.images?.length ? (
                <div className="grid grid-cols-2 gap-3">
                  {modalNote.images.map(img => (
                    <div key={img.id} className="bg-gray-800 rounded border border-gray-700 p-2">
                      <img src={img.url} alt="attachment" className="w-full h-40 object-cover rounded" />
                      <a href={img.url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 block mt-1 truncate">
                        {img.url}
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">No images attached. Paste an image into this window to attach.</div>
              )}
            </div>
          </div>
        </div>
      )}
      </>
    );
  };

  const renderTodoPanel = () => {
    if (!activeTodoTab) return null;
    const sidebarStyle = { width: `${Math.round(todoSidebarWidth)}px` };
    return (
    <div className="flex h-full group/todo">
      <div className="border-r border-gray-800 flex flex-col" style={sidebarStyle}>
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-400">TIDY NOTE PAD</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">BETA</span>
              </div>
              <div className="text-sm font-medium text-gray-300">Todo Lists</div>
            </div>
            <button onClick={createTodoTab} className="flex items-center gap-1 text-sm text-green-400 hover:text-green-200" title="Create New Todo List">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" onDoubleClick={(e) => { if (!e.target.closest('[data-todo-card]')) createTodoTab(); }}>
          {todoTabs.map(tab => (
            <div
              key={tab.id}
              data-todo-card
              className={`px-4 py-3 border-b border-gray-800 cursor-pointer ${tab.id === activeTodoTabId ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-900 hover:text-white'}`}
              onClick={() => setActiveTodoTabId(tab.id)}
            >
              <div className="flex items-center justify-between gap-2">
                {tab.id === activeTodoTabId ? (
                  <input
                    className="bg-transparent border-b border-gray-600 focus:outline-none w-full"
                    value={tab.title}
                    onChange={(e) => updateTodoTab(tab.id, t => ({ ...t, title: e.target.value }))}
                    placeholder="List title"
                  />
                ) : (
                  <div>
                    <p className="font-semibold text-sm">{String(tab.title || '').trim() || `List ${tab.id}`}</p>
                    <p className="text-xs text-gray-500">{tab.items.length} tasks</p>
                  </div>
                )}
                {todoTabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTodoTab(tab.id); }}
                    className="text-red-400"
                    title="Close todo list"
                    aria-label="Close todo list"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Ad Banner - Todo panel sidebar (web only) */}
        {!isDesktop() && (
          <AdBanner
            theme={theme}
            onClose={() => console.log('[AdBanner] User requested to hide ads')}
          />
        )}
      </div>
      <button
        type="button"
        className="w-2 bg-gray-900/80 hover:bg-green-500 cursor-col-resize transition-colors flex items-center justify-center rounded-md border border-gray-800"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize todo lists panel"
        onMouseDown={handleTodoResizeStart}
      >
        <span className="h-8 w-0.5 bg-gray-500 rounded-full" />
      </button>
      <div className="flex-1 flex flex-col px-6 py-4">
      <div className="flex-1 overflow-y-auto space-y-3">
        {activeTodoTab?.items?.map((item) => (
          <div
            key={item.id}
            className="bg-gray-900 border border-gray-700 rounded p-3"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const draggedId = event.dataTransfer.getData('text/plain');
              if (!draggedId || Number(draggedId) === item.id) return;
              moveTodoItem(draggedId, 0, item.id);
            }}
          >
            <div className="flex gap-3">
              <div
                className="flex items-center justify-center px-2 py-2 bg-gray-800 rounded cursor-move"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', item.id);
                }}
                title="Drag to reorder task"
                aria-label="Drag to reorder task"
              >
                <GripVertical className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 flex-1">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleTodoItem(item.id)}
                    />
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => updateTodoTab(activeTodoTabId, tab => ({
                        ...tab,
                        items: tab.items.map(it => it.id === item.id ? { ...it, text: e.target.value } : it)
                      }))}
                      className={`flex-1 bg-transparent focus:outline-none ${item.done ? 'line-through text-gray-500' : ''}`}
                    />
                  </label>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {item.dueDate && <span>Due: {item.dueDate}</span>}
                    {item.completedDate && <span>Done: {item.completedDate}</span>}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 text-gray-400">
                    <span>Due:</span>
                    <input
                      type="date"
                      value={item.dueDate || ''}
                      onChange={(e) => updateTodoTab(activeTodoTabId, tab => ({
                        ...tab,
                        items: tab.items.map(it => it.id === item.id ? { ...it, dueDate: e.target.value } : it)
                      }))}
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1"
                    />
                  </label>
                  <button onClick={() => removeTodoItem(item.id)} className="text-red-400 text-sm">Remove</button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {(activeTodoTab?.items?.length || 0) === 0 && <p className="text-gray-500">No tasks yet.</p>}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <input
          ref={newTodoInputRef}
          type="text"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTodoItem();
            }
          }}
          placeholder="New task"
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2"
        />
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <span>Due:</span>
          <input
            type="date"
            value={newTodoDueDate}
            onChange={(e) => setNewTodoDueDate(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-3 py-2"
          />
        </label>
        <button
          onClick={addTodoItem}
          className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded"
        >
          Add
        </button>
      </div>
      </div>
    </div>
  );
  };

  const renderEditorWorkspace = () => {
    if (isCsvEditorCollapsed) {
      return null;
    }

    // Render PDF viewer for PDF tabs
    if (activeTab?.isPDF) {
      // Show permission prompt for PDF tabs that need permission (web mode)
      if (activeTab?.needsPermission && activeTab?.fileHandle) {
        return (
          <div className="flex flex-1 overflow-hidden min-w-0 relative items-center justify-center" style={{ maxWidth: '100%', height: '100%' }}>
            <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'} border rounded-lg p-8 max-w-md text-center shadow-xl`}>
              <div className="mb-4">
                <svg className="w-16 h-16 mx-auto text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Permission Required</h3>
              <p className={`mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                Click the button below to grant permission to access <strong className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>{activeTab.title}</strong>
              </p>
              <p className={`text-xs mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                Your browser requires permission to access files you've previously opened
              </p>
              <button
                onClick={async () => {
                  try {
                    const { requestFilePermission } = await import('./utils/fileHandleStorage.js');

                    console.log(`[PDF Permission] Requesting permission for: ${activeTab.title}`);

                    const hasPermission = await requestFilePermission(activeTab.fileHandle);
                    if (!hasPermission) {
                      throw new Error('Permission denied');
                    }

                    // Read PDF as binary data
                    const file = await activeTab.fileHandle.getFile();
                    const arrayBuffer = await file.arrayBuffer();
                    const pdfContent = new Uint8Array(arrayBuffer);

                    // Update tab with PDF content and remove needsPermission flag
                    setTabs(prev => prev.map(t =>
                      t.id === activeTab.id
                        ? { ...t, pdfContent, isModified: false, needsPermission: false }
                        : t
                    ));

                    console.log(`[PDF Permission] Successfully loaded: ${activeTab.title}`);
                  } catch (error) {
                    console.warn(`[PDF Permission] Failed to load ${activeTab.title}:`, error);
                    showTransientMessage(`Permission denied. Please try again or re-open the file.`, 'error');
                  }
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
              >
                Grant Permission
              </button>
            </div>
          </div>
        );
      }
      // Show loading state while PDF content is being loaded (desktop mode)
      if (!activeTab?.pdfContent) {
        return (
          <div className="flex flex-1 overflow-hidden min-w-0 relative items-center justify-center" style={{ maxWidth: '100%', height: '100%' }}>
            <div className="flex flex-col items-center gap-4">
              <Loader2 className={`w-12 h-12 animate-spin ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Loading PDF...</p>
            </div>
          </div>
        );
      }
      return (
        <div className="flex flex-1 overflow-hidden min-w-0 relative" style={{ maxWidth: '100%', height: '100%' }}>
          <PDFViewer
            fileContent={activeTab.pdfContent}
            fileName={activeTab.title}
            filePath={activeTab.absolutePath || ''}
            theme={theme}
            onClose={() => closeTab(activeTab.id)}
            onTogglePanels={(panelsVisible) => {
              // Control Tabs Explorer and File System Browser panels
              setShowTabsExplorer(panelsVisible);
              setShowFileSystemBrowser(panelsVisible);
            }}
            panelsVisible={showTabsExplorer || showFileSystemBrowser}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-1 overflow-hidden min-w-0 relative" style={{ maxWidth: '100%', height: '100%' }}>
        {/* Show permission banner if tab needs permission */}
        {activeTab?.needsPermission && activeTab?.fileHandle && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-95">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 max-w-md text-center shadow-xl">
              <div className="mb-4">
                <svg className="w-16 h-16 mx-auto text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Permission Required</h3>
              <p className="text-gray-300 mb-2">
                Click the button below to grant permission to access <strong className="text-white">{activeTab.title}</strong>
              </p>
              <p className="text-gray-400 text-xs mb-6">
                Your browser requires permission to access files you've previously opened
              </p>
              <button
                onClick={async () => {
                  try {
                    const { readFileFromHandleWithPermission } = await import('./utils/fileHandleStorage.js');

                    console.log(`[PermissionBanner] Requesting permission for: ${activeTab.title}`);

                    // This will prompt the user for permission (user clicked button = user gesture!)
                    const content = await readFileFromHandleWithPermission(activeTab.fileHandle);

                    // Update tab with content and remove needsPermission flag
                    setTabs(prev => prev.map(t =>
                      t.id === activeTab.id
                        ? { ...t, content, isModified: false, needsPermission: false }
                        : t
                    ));

                    console.log(`[PermissionBanner] Successfully loaded: ${activeTab.title}`);
                  } catch (error) {
                    console.warn(`[PermissionBanner] Failed to load ${activeTab.title}:`, error);
                    showTransientMessage(`Permission denied. Please try again or re-open the file.`, 'error');
                  }
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
              >
                Grant Permission
              </button>
            </div>
          </div>
        )}
        {activeTab.useVirtualEditor ? (
          <VirtualEditor
            ref={codeMirrorRef}
            value={activeTab.content}
            onChange={(newValue) => {
              updateTabContent(activeTab.id, newValue);
            }}
            theme={theme}
            fontSize={fontSize}
            searchTerm={findValue}
            caseSensitive={caseSensitive}
            onSearchResults={(count, truncated) => {
              if (truncated) {
                console.log(`[VirtualEditor] Search results truncated at ${count} matches`);
              }
            }}
            onCursorChange={(line, col) => {
              const cursorInfo = { line: line + 1, column: col + 1 };
              lastCursorRef.current = cursorInfo;
              setCursorPosition(cursorInfo);
            }}
            className="w-full h-full"
          />
        ) : (
          <CodeMirrorEditor
            ref={codeMirrorRef}
            value={activeTab.content}
            onChange={(newValue) => {
              updateTabContent(activeTab.id, newValue);
            }}
            language={syntaxLanguage || 'javascript'}
            theme={theme}
            fontSize={fontSize}
            vimEnabled={vimEnabled}
            onVimModeChange={(mode) => {
              setVimMode(mode);
            }}
            aiSettings={aiSettings}
            lspSettings={aiSettings}
            searchTerm={findValue}
            caseSensitive={caseSensitive}
            onCursorChange={(pos) => {
            // Update cursor position for display
            if (activeTab) {
              const contentForCursor = activeTab.content || '';

              // Optimized line/column calculation - count newlines instead of split
              // Avoids creating substring and array allocation on every cursor movement
              let line = 1;
              let column = 1;
              let lastNewlinePos = -1;

              for (let i = 0; i < pos && i < contentForCursor.length; i++) {
                if (contentForCursor[i] === '\n') {
                  line++;
                  lastNewlinePos = i;
                }
              }
              column = pos - lastNewlinePos;

              const cursorInfo = { line, column };

              // Store in refs immediately (no throttle - needed for cursor restoration)
              lastCursorRef.current = cursorInfo;
              tabCursorPositionsRef.current.set(activeTab.id, { pos, line, column });

              // Throttle the state update to reduce React re-renders
              // Update at most once every 50ms for smooth display without excessive renders
              if (cursorUpdateThrottleRef.current) {
                clearTimeout(cursorUpdateThrottleRef.current);
              }
              cursorUpdateThrottleRef.current = setTimeout(() => {
                setCursorPosition(cursorInfo);
                cursorUpdateThrottleRef.current = null;
              }, 50);

              // Sync markdown preview if in markdown mode
              if (isMarkdownTab) {
                markdownSyncScroll(line);
              }

              // Update brace matching (cached and throttled)
              // Only recalculate if content or position changed
              const contentHash = activeTab.content?.length || 0;
              const cache = braceMatchCacheRef.current;

              // Check cache
              if (cache.contentHash === contentHash && cache.pos === pos && cache.result !== undefined) {
                // Cache hit - use cached result
                if (braceMatchThrottleRef.current) {
                  clearTimeout(braceMatchThrottleRef.current);
                }
                braceMatchThrottleRef.current = setTimeout(() => {
                  setBraceMatch(cache.result);
                  braceMatchThrottleRef.current = null;
                }, 50);
              } else {
                // Cache miss - recalculate
                const braceMatchResult = findMatchingBraces(activeTab.content, pos);

                // Update cache
                braceMatchCacheRef.current = {
                  contentHash,
                  pos,
                  result: braceMatchResult
                };

                // Throttle the state update
                if (braceMatchThrottleRef.current) {
                  clearTimeout(braceMatchThrottleRef.current);
                }
                braceMatchThrottleRef.current = setTimeout(() => {
                  setBraceMatch(braceMatchResult);
                  braceMatchThrottleRef.current = null;
                }, 50);
              }

              // Handle CSV row highlighting
              if (isCSVTab && csvRowCount > 0 && csvEditorRowRefs.current.size > 0) {
                let matchedRow = null;
                for (const [rowIndex, meta] of csvEditorRowRefs.current.entries()) {
                  if (pos >= meta.start && pos <= meta.end) {
                    matchedRow = rowIndex;
                    break;
                  }
                }
                if (matchedRow === null && pos > (csvEditorRowRefs.current.get(csvRowCount - 1)?.end ?? 0)) {
                  matchedRow = csvRowCount - 1;
                }
                if (activeCsvRowIndex !== matchedRow) {
                  setActiveCsvRowIndex(matchedRow);
                }
              } else if (isCSVTab && csvRowCount === 0 && activeCsvRowIndex !== null) {
                setActiveCsvRowIndex(null);
              } else if (activeCsvRowIndex !== null && !isCSVTab) {
                setActiveCsvRowIndex(null);
              }
            }
          }}
          placeholder="Start typing..."
          className="w-full h-full"
          style={{ fontSize: '14px' }}
        />
        )}
      </div>
    );
  };

  const renderDevPanel = () => {
    const structurePaneStyle = { width: `${Math.round(structureWidth)}px` };
    // Only show structure panel for JSON and XML files when user has it enabled
    const showStructurePane = !isCSVTab && !isMarkdownTab && structureTree.type !== null && structurePanelVisible;
    return (
    <div className="flex flex-col h-full">
      {/* Menu Bar */}
      <div className={`border-b px-4 py-2 flex items-center gap-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-200 border-gray-300'}`}>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-400">TIDY CODE</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${theme === 'dark' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>BETA</span>
          </div>
          <div className={`text-[11px] font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Code & Text Editor • JSON • XML • CSV • Markdown • TXT</div>
        </div>

        <div className="flex gap-1.5 ml-4">
          <button
            onClick={createNewTab}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
            title="New File"
          >
            <Plus className="w-4 h-4" />
            New
          </button>

          <button
            onClick={openFileWithDialog}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm cursor-pointer transition-colors ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
            title="Open files: JSON, XML, CSV, HTML, JS, TXT, and more"
          >
            <Upload className="w-4 h-4" />
            Open File
          </button>
          {/* Hidden file input for browser fallback */}
          <input
            id="file-input"
            ref={fileInputRef}
            type="file"
            onChange={openFile}
            className="hidden"
          />

          <button
            onClick={() => saveFile()}
            disabled={!activeTab || !activeTab.isModified || activeTab.title === 'Welcome'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${(!activeTab || !activeTab.isModified || activeTab.title === 'Welcome') ? 'bg-gray-600 cursor-not-allowed opacity-50' : theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
            title="Save File (Ctrl/Cmd+S)"
          >
            <Save className="w-4 h-4" />
            Save
          </button>

          <button
            onClick={() => saveFileAs()}
            disabled={!activeTab || activeTab.title === 'Welcome'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${(!activeTab || activeTab.title === 'Welcome') ? 'bg-gray-600 cursor-not-allowed opacity-50' : theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
            title="Save As... (Ctrl/Cmd+Shift+S)"
          >
            <Save className="w-4 h-4" />
            Save As...
          </button>

          <div className={`w-px mx-2 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`}></div>

          <button
            onClick={formatContent}
            disabled={!activeTab}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${!activeTab ? 'bg-gray-600 cursor-not-allowed opacity-50' : theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
            title="Format JSON/XML/YAML/TOML (Auto-detect)"
          >
            <Code2 className="w-4 h-4" />
            Format
          </button>

          {/* Convert Format Dropdown */}
          <div className="relative" ref={convertDropdownRef}>
            <button
              onClick={() => setShowConvertDropdown(!showConvertDropdown)}
              disabled={!activeTab}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${!activeTab ? 'bg-gray-600 cursor-not-allowed opacity-50' : theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
              title="Convert to another format"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Convert
              <ChevronDown className="w-3 h-3" />
            </button>
            {showConvertDropdown && (() => {
              // Detect current format to disable same-format conversion
              const currentFormat = structureTree.type?.toLowerCase() || null;
              return (
                <div className={`absolute top-full left-0 mt-1 py-1 rounded-md shadow-lg z-50 min-w-[140px] ${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
                  <button
                    onClick={() => convertFormat('json')}
                    disabled={currentFormat === 'json'}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      currentFormat === 'json'
                        ? 'opacity-40 cursor-not-allowed text-gray-500'
                        : theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-800'
                    }`}
                  >
                    Convert to JSON {currentFormat === 'json' && '(current)'}
                  </button>
                  <button
                    onClick={() => convertFormat('xml')}
                    disabled={currentFormat === 'xml'}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      currentFormat === 'xml'
                        ? 'opacity-40 cursor-not-allowed text-gray-500'
                        : theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-800'
                    }`}
                  >
                    Convert to XML {currentFormat === 'xml' && '(current)'}
                  </button>
                  <button
                    onClick={() => convertFormat('yaml')}
                    disabled={currentFormat === 'yaml'}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      currentFormat === 'yaml'
                        ? 'opacity-40 cursor-not-allowed text-gray-500'
                        : theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-800'
                    }`}
                  >
                    Convert to YAML {currentFormat === 'yaml' && '(current)'}
                  </button>
                  <button
                    onClick={() => convertFormat('toml')}
                    disabled={currentFormat === 'toml'}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      currentFormat === 'toml'
                        ? 'opacity-40 cursor-not-allowed text-gray-500'
                        : theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-800'
                    }`}
                  >
                    Convert to TOML {currentFormat === 'toml' && '(current)'}
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Toggle Structure Panel - only show for JSON/XML */}
          {!isCSVTab && !isMarkdownTab && structureTree.type !== null && (
            <>
              <div className={`w-px mx-2 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
              <button
                onClick={() => setStructurePanelVisible(!structurePanelVisible)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
                title={structurePanelVisible ? 'Hide Structure Panel' : 'Show Structure Panel'}
              >
                {structurePanelVisible ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
                {structurePanelVisible ? 'Hide' : 'Show'} Structure
              </button>
            </>
          )}
        </div>

        {/* Right side controls */}
        <div className="flex gap-1.5 ml-auto items-center">
          {/* VIM Mode Toggle - disabled for VirtualEditor (large files) */}
          <div className={`flex items-center gap-2 ${activeTab?.useVirtualEditor ? 'opacity-50' : ''}`}>
            <span className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              VIM
            </span>
            <button
              onClick={() => {
                if (activeTab?.useVirtualEditor) return; // Disabled for large files
                setVimEnabled(!vimEnabled);
                if (!vimEnabled) {
                  setVimMode('normal'); // Start in normal mode when enabling VIM
                  // Focus the editor after enabling VIM mode
                  setTimeout(() => {
                    if (codeMirrorRef.current) {
                      codeMirrorRef.current.focus();
                    }
                  }, 100);
                }
              }}
              disabled={activeTab?.useVirtualEditor}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                activeTab?.useVirtualEditor
                  ? theme === 'dark' ? 'bg-gray-800 cursor-not-allowed' : 'bg-gray-200 cursor-not-allowed'
                  : vimEnabled
                    ? 'bg-indigo-600 hover:bg-indigo-500'
                    : theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'
              }`}
              title={activeTab?.useVirtualEditor ? "VIM Mode unavailable for large files" : vimEnabled ? "Disable VIM Mode" : "Enable VIM Mode"}
              role="switch"
              aria-checked={vimEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  vimEnabled && !activeTab?.useVirtualEditor ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            {vimEnabled && !activeTab?.useVirtualEditor && (
              <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                vimMode === 'normal' ? 'bg-green-500 text-white' :
                vimMode === 'insert' ? 'bg-blue-500 text-white' :
                'bg-purple-500 text-white'
              }`}>
                {vimMode === 'normal' ? 'N' : vimMode === 'insert' ? 'I' : 'V'}
              </span>
            )}
          </div>

          <button
            onClick={() => setShowAISettings(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
            title="AI Settings - Configure AI provider for error fixing"
          >
            <Settings className="w-4 h-4" />
            AI Settings
          </button>

          <button
            onClick={() => setShowDiffViewer(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
            title="Diff Viewer - Compare and merge files"
          >
            <GitCompare className="w-4 h-4" />
            Diff
          </button>
        </div>
      </div>

      {/* Find & Replace - Hidden when PDF viewer is active */}
      {!activeTab?.isPDF && (
      <div className={`border-b px-4 py-2 flex flex-wrap items-center gap-2 text-sm ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-gray-100 border-gray-300'}`}>
        <button
          onClick={() => setShowFindReplace(!showFindReplace)}
          className={`px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-2 ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
          title="Toggle Find & Replace"
        >
          <Search className="w-4 h-4" />
          Find/Replace
        </button>

        {showFindReplace && (
          <>
            <div className={`flex items-center gap-2 rounded px-2 py-1 flex-1 min-w-[200px] ${theme === 'dark' ? 'bg-gray-800' : 'bg-white border border-gray-300'}`}>
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={findValue}
                onChange={(e) => {
                  setFindValue(e.target.value);
                  findAllOccurrences(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleFindNext();
                  }
                }}
                placeholder="Find..."
                className={`bg-transparent flex-1 outline-none placeholder-gray-500 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}
              />
              {searchResults.length > 0 && (
                <span className="text-xs text-gray-400">
                  {searchResults.length} {searchResults.length === 1 ? 'match' : 'matches'}
                </span>
              )}
              <button
                onClick={() => {
                  setCaseSensitive(!caseSensitive);
                  // Re-run search with new case sensitivity
                  if (findValue) {
                    setTimeout(() => findAllOccurrences(findValue), 0);
                  }
                }}
                className={`p-1 rounded transition-colors ${
                  caseSensitive
                    ? theme === 'dark'
                      ? 'bg-indigo-500/30 text-indigo-300'
                      : 'bg-indigo-200 text-indigo-700'
                    : theme === 'dark'
                      ? 'text-gray-500 hover:text-gray-300'
                      : 'text-gray-400 hover:text-gray-600'
                }`}
                title={caseSensitive ? 'Case sensitive (click to disable)' : 'Case insensitive (click to enable)'}
              >
                <CaseSensitive className="w-4 h-4" />
              </button>
            </div>
            <div className={`flex items-center gap-2 rounded px-2 py-1 flex-1 min-w-[200px] ${theme === 'dark' ? 'bg-gray-800' : 'bg-white border border-gray-300'}`}>
              <Replace className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={replaceValue}
                onChange={(e) => setReplaceValue(e.target.value)}
                placeholder="Replace with..."
                className={`bg-transparent flex-1 outline-none placeholder-gray-500 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}
              />
            </div>
            <button
              onClick={handleFindNext}
              disabled={!findValue}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${!findValue ? 'bg-gray-600 cursor-not-allowed opacity-50' : theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
              title="Find next occurrence"
            >
              Find Next
            </button>
            <button
              onClick={handleReplace}
              disabled={!findValue || !activeTab}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${(!findValue || !activeTab) ? 'bg-gray-600 cursor-not-allowed opacity-50' : theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
              title="Replace current match"
            >
              Replace
            </button>
            <button
              onClick={handleReplaceAll}
              disabled={!findValue || !activeTab}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${(!findValue || !activeTab) ? 'bg-gray-600 cursor-not-allowed opacity-50' : theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
              title="Replace all matches in document"
            >
              Replace All
            </button>
          </>
        )}
      </div>
      )}

      {/* Tab Bar */}
      <div className="bg-gray-800 border-b border-gray-700 flex items-center">
        <div className="flex border-r border-gray-700">
          <Tooltip content="Tabs Explorer" placement="bottom">
            <button
              onClick={() => setShowTabsExplorer(!showTabsExplorer)}
              className={`px-3 py-2 transition-colors ${
                showTabsExplorer
                  ? theme === 'dark'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                  : theme === 'dark'
                  ? 'text-gray-300 hover:bg-gray-600'
                  : 'text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Layers className="w-4 h-4" />
            </button>
          </Tooltip>
          {isDesktop() && (
            <Tooltip content="File Browser" placement="bottom">
              <button
                onClick={() => setShowFileSystemBrowser(!showFileSystemBrowser)}
                className={`px-3 py-2 transition-colors ${
                  showFileSystemBrowser
                    ? theme === 'dark'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                    : theme === 'dark'
                    ? 'text-gray-300 hover:bg-gray-600'
                    : 'text-gray-700 hover:bg-gray-300'
                }`}
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </Tooltip>
          )}
          <Tooltip content="Previous Tab" placement="bottom">
            <button
              onClick={goToPreviousTab}
              disabled={tabs.length === 0}
              className={`px-3 py-2 ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-300'} disabled:text-gray-600 disabled:hover:bg-transparent`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Next Tab" placement="bottom">
            <button
              onClick={goToNextTab}
              disabled={tabs.length === 0}
              className={`px-3 py-2 ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-300'} disabled:text-gray-600 disabled:hover:bg-transparent`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
        <div
          ref={tabContainerRef}
          className="flex overflow-x-auto flex-1 scrollbar-hide"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
          onDoubleClick={handleTabBarDoubleClick}
        >
          {tabs.map(tab => (
            <div
              key={tab.id}
              ref={(el) => {
                if (el) {
                  tabElementRefs.current.set(tab.id, el);
                } else {
                  tabElementRefs.current.delete(tab.id);
                }
              }}
              data-tab-item="true"
              draggable="true"
              onDragStart={(e) => handleTabDragStart(e, tab.id)}
              onDragOver={(e) => handleTabDragOver(e, tab.id)}
              onDragLeave={handleTabDragLeave}
              onDrop={(e) => handleTabDrop(e, tab.id)}
              onDragEnd={handleTabDragEnd}
              onContextMenu={(e) => {
                e.preventDefault();
                setTabContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  tabId: tab.id
                });
              }}
              title={tab.title}
              className={`flex items-center gap-2 px-4 py-2 border-r border-gray-700 cursor-move min-w-[150px] max-w-[200px] group
                ${tab.id === activeTabId ? 'bg-gray-900 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-750'}
                ${draggedTabId === tab.id ? 'opacity-50' : ''}
                ${dragOverTabId === tab.id && draggedTabId !== tab.id ? 'border-l-2 border-l-indigo-400' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="truncate flex-1 text-sm flex items-center gap-1.5">
                {tab.isModified ? '● ' : ''}
                {tab.title}
                {tab.isLargeFile && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300 font-medium"
                    title={`Large file (${formatFileSize(tab.fileSize || 0)}) - WASM-accelerated`}
                  >
                    WASM
                  </span>
                )}
              </span>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  await closeTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:bg-gray-700 rounded p-0.5 transition-opacity"
                title="Close tab"
                aria-label="Close tab"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="flex-1 min-w-[200px]" />
        </div>
        {/* Persistent New Tab Button - Always visible */}
        <Tooltip content="New Tab" placement="bottom">
          <button
            onClick={createNewTab}
            className={`flex items-center justify-center px-3 py-2 border-l flex-shrink-0 transition-colors ${
              theme === 'dark'
                ? 'text-gray-400 hover:bg-gray-700 hover:text-white border-gray-700'
                : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900 border-gray-300'
            }`}
          >
            <Plus className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>

      {csvDetectionMessage && (
        <div className="bg-yellow-400 border-b-2 border-yellow-500 text-red-800 px-5 py-3 text-sm flex items-center gap-3 shadow-lg font-semibold">
          <Info className="w-4 h-4" />
          <span className="tracking-wide">{csvDetectionMessage}</span>
        </div>
      )}

      {markdownDetectionMessage && (
        <div className="bg-yellow-400 border-b-2 border-yellow-500 text-red-800 px-5 py-3 text-sm flex items-center gap-3 shadow-lg font-semibold">
          <Info className="w-4 h-4" />
          <span className="tracking-wide">{markdownDetectionMessage}</span>
        </div>
      )}

      {/* Editor Area */}
      <div className="flex-1 overflow-hidden flex flex-col" style={{ maxWidth: '100%' }}>
        {activeTab ? (
          <>
            {/* Editor Section */}
            <div className="flex-1 flex overflow-hidden border-b-2 border-gray-700 group" style={{ maxWidth: '100%' }}>
              {/* Left Sidebar with File Browsers */}
              {(showTabsExplorer || (isDesktop() && showFileSystemBrowser)) && (
                <div className={`flex-shrink-0 flex flex-col ${theme === 'dark' ? 'bg-gray-800 border-r border-gray-700' : 'bg-gray-50 border-r border-gray-200'}`} style={{ width: `${leftPanelWidth}px`, position: 'relative' }}>
                  {/* Tabs Explorer (Open Tabs) - Top */}
                  {showTabsExplorer && (
                    <div
                      className="overflow-hidden flex-1"
                      style={{
                        height: isDesktop() && showFileSystemBrowser ? `${tabsExplorerHeight}px` : undefined,
                        flexShrink: isDesktop() && showFileSystemBrowser ? 0 : 1
                      }}
                    >
                      <TabsExplorer
                        ref={tabsExplorerRef}
                        theme={theme}
                        tabs={tabs}
                        activeTabId={activeTabId}
                        onTabSelect={(tabId) => {
                          // Allow FileSystemBrowser scroll when selecting from TabsExplorer
                          // (don't set suppressFileSystemBrowserScrollRef)
                          setActiveTabId(tabId);
                        }}
                        onClose={() => setShowTabsExplorer(false)}
                        onCloseTab={closeTab}
                      />
                    </div>
                  )}

                  {/* Resizable Divider between browsers */}
                  {isDesktop() && showFileSystemBrowser && showTabsExplorer && (
                    <div
                      className={`flex items-center justify-center cursor-ns-resize hover:bg-blue-500 transition-colors ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}
                      style={{ height: '6px', flexShrink: 0 }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const startY = e.clientY;
                        const startHeight = tabsExplorerHeight;

                        const handleMouseMove = (e) => {
                          const deltaY = e.clientY - startY;
                          const newHeight = Math.max(MIN_FILE_EXPLORER_HEIGHT, Math.min(MAX_FILE_EXPLORER_HEIGHT, startHeight + deltaY));
                          setTabsExplorerHeight(newHeight);
                        };

                        const handleMouseUp = () => {
                          document.removeEventListener('mousemove', handleMouseMove);
                          document.removeEventListener('mouseup', handleMouseUp);
                        };

                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                    >
                      <GripVertical size={14} className="opacity-50" />
                    </div>
                  )}

                  {/* File System Browser - Bottom */}
                  {isDesktop() && showFileSystemBrowser && (
                    <div className="flex-1 overflow-hidden">
                      <FileSystemBrowser
                        theme={theme}
                        selectedFilePath={fileSystemBrowserSelectedFile}
                        suppressScrollRef={suppressFileSystemBrowserScrollRef}
                        onFileOpen={async (file) => {
                          console.log('[FileSystemBrowser] onFileOpen called with file:', file);

                          // Suppress FileSystemBrowser scroll since user clicked within FileSystemBrowser
                          suppressFileSystemBrowserScrollRef.current = true;

                          try {
                            const tabId = await ensureTabForPath({
                              filePath: file.path,
                              preloadedContent: file.content,
                              displayName: file.name
                            });
                            // Scroll to the tab in TabsExplorer
                            if (tabId && tabsExplorerRef.current) {
                              // Use setTimeout to ensure the tab is rendered before scrolling
                              setTimeout(() => {
                                tabsExplorerRef.current.scrollToFile(tabId);
                              }, 50);
                            }
                          } catch (err) {
                            console.warn('[FileSystemBrowser] Failed to open file:', file.path, err);
                            showTransientMessage('Failed to open file: ' + err, 'error');
                          }
                        }}
                        onRootPathChange={setFileSystemBrowserRootPath}
                        onClose={() => setShowFileSystemBrowser(false)}
                      />
                    </div>
                  )}

                  {/* Ad Banner - Phase 1: Left sidebar footer (web only) */}
                  {!isDesktop() && (
                    <AdBanner
                      theme={theme}
                      onClose={() => {
                        // In production, this would show premium upgrade prompt
                        console.log('[AdBanner] User requested to hide ads');
                      }}
                    />
                  )}

                  {/* Resize handle for left panel */}
                  <div
                    onMouseDown={handleLeftPanelResizeStart}
                    className={`absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 transition-colors ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-400'}`}
                    style={{ zIndex: 10 }}
                    title="Drag to resize panel"
                  />
                </div>
              )}

              {/* Structure Pane */}
              {showStructurePane && (
                <>
                  <div
                    className="bg-gray-900 border-r border-gray-800 overflow-hidden transition-[width]"
                    style={structurePaneStyle}
                  >
                    <div className="px-3 py-2 border-b border-gray-800 text-xs uppercase tracking-wide text-gray-300 flex items-center justify-between gap-2 bg-gray-900">
                      <span>Structure</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            // Expand all nodes
                            setStructureCollapsed({});
                          }}
                          className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-800"
                          title="Expand All"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            // Collapse all nodes
                            const allNodeIds = {};
                            const collectNodeIds = (nodes) => {
                              nodes.forEach(node => {
                                if (node.children && node.children.length > 0) {
                                  allNodeIds[node.id] = true;
                                  collectNodeIds(node.children);
                                }
                              });
                            };
                            collectNodeIds(structureTree.nodes);
                            setStructureCollapsed(allNodeIds);
                          }}
                          className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-800"
                          title="Collapse All"
                        >
                          <Minimize2 className="w-4 h-4" />
                        </button>
                        <span className="text-gray-400">{structureTree.type || 'Plain'}</span>
                      </div>
                    </div>
                    <div className="p-3 max-h-full overflow-y-auto text-gray-200" ref={structureRef}>
                      {structureTree.nodes.length > 0 ? (
                        renderStructureNodes(structureTree.nodes)
                      ) : (
                        <p className="text-gray-500 text-xs">No structure detected</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="w-1 bg-gray-800/50 hover:bg-indigo-500/60 cursor-col-resize transition-colors flex items-center justify-center"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize structure panel"
                    onMouseDown={handleStructureResizeStart}
                  >
                  </button>
                </>
              )}

              <div className="flex flex-1 overflow-hidden min-w-0" style={{ maxWidth: '100%' }}>
                <div className="flex flex-1 flex-col overflow-hidden min-w-0" style={{ maxWidth: '100%' }}>
                  {isMarkdownTab && (
                    <>
                      <div
                        className="bg-gray-900 border-b border-gray-800 flex flex-col min-w-0"
                        style={
                          !isMarkdownPreviewCollapsed
                            ? { flex: 1, minHeight: 0 }
                            : { height: `${Math.round(markdownPreviewHeight)}px`, minHeight: MIN_CSV_PREVIEW_HEIGHT, maxHeight: MAX_CSV_PREVIEW_HEIGHT }
                        }
                      >
                        <div className="flex items-center justify-between px-4 py-2 text-xs uppercase tracking-wide text-gray-400 flex-shrink-0">
                          <span>Markdown Preview</span>
                        </div>
                        <div
                          ref={markdownPreviewRef}
                          className="flex-1 min-w-0 overflow-auto px-6 py-4"
                          style={{ backgroundColor: theme === 'dark' ? '#111827' : '#ffffff' }}
                          onClick={handleMarkdownPreviewClick}
                        >
                          <div
                            className="markdown-preview prose prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: markdownHtml }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-0.5 border-b border-gray-700/30">
                        <button
                          type="button"
                          className="flex-1 h-1 bg-transparent hover:bg-indigo-500/40 cursor-row-resize transition-colors flex items-center justify-center group"
                          aria-label="Resize markdown preview area"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            markdownPreviewDragState.current.active = true;
                            markdownPreviewDragState.current.startY = e.clientY;
                            markdownPreviewDragState.current.startHeight = markdownPreviewHeight;
                          }}
                        >
                          <span className="w-8 h-0.5 bg-gray-600 rounded-full group-hover:bg-indigo-400" />
                        </button>
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-300 hover:text-white hover:border-indigo-400 transition-colors"
                          onClick={() => {
                            setIsMarkdownPreviewCollapsed(prev => !prev);
                          }}
                          aria-pressed={isMarkdownPreviewCollapsed}
                          title={!isMarkdownPreviewCollapsed ? "Show editor for markdown editing" : "Hide editor to view preview only"}
                        >
                          {!isMarkdownPreviewCollapsed ? (
                            <span className="flex items-center gap-1"><ChevronUp className="w-3 h-3" /> Show Editor</span>
                          ) : (
                            <span className="flex items-center gap-1"><ChevronDown className="w-3 h-3" /> Hide Editor</span>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                  {isCSVTab && csvPreviewStats && (
                    <>
                      <div
                        className="bg-gray-900 border-b border-gray-800 flex flex-col min-w-0"
                        style={
                          isCsvEditorCollapsed
                            ? { flex: 1, minHeight: 0 }
                            : { height: `${Math.round(csvPreviewHeight)}px`, minHeight: MIN_CSV_PREVIEW_HEIGHT, maxHeight: MAX_CSV_PREVIEW_HEIGHT }
                        }
                      >
                        <div className="flex items-center justify-between px-4 py-2 text-xs uppercase tracking-wide text-gray-400 flex-shrink-0">
                          <span>CSV Grid Preview</span>
                          <span className="text-gray-500">
                            {csvPreviewStats.rowCount} rows · {csvPreviewStats.columnCount} columns
                          </span>
                        </div>
                        <div className="csv-table-container flex-1 min-w-0">
                          <table
                            className="csv-table border-collapse text-sm font-mono text-gray-100"
                            style={{
                              width: csvTotalWidth > 0 ? `${csvTotalWidth}px` : '100%',
                              tableLayout: 'fixed'
                            }}
                          >
                              <thead style={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6' }}>
                                <tr className="text-sm font-semibold text-gray-200">
                                  <th
                                    className="line-num-header border-r border-t border-b border-l border-gray-700 px-2 py-1 text-center font-semibold"
                                    style={{
                                      width: '60px',
                                      minWidth: '60px',
                                      backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                                      position: 'sticky',
                                      left: 0,
                                      top: 0,
                                      zIndex: 80,
                                      boxShadow: theme === 'dark' ? '0 2px 0 #0f172a' : '0 2px 0 #e5e7eb'
                                    }}
                                  >
                                    #
                                  </th>
                                  {(csvPreviewStats.header.length ? csvPreviewStats.header : Array.from({ length: csvPreviewStats.columnCount }, (_, idx) => `Column ${idx + 1}`)).map((cell, idx) => (
                                    <th
                                      key={`csv-head-${idx}`}
                                      className="border-r border-t border-b border-gray-700 px-2 py-1 text-left relative select-none overflow-hidden font-semibold"
                                      style={{
                                        backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                                        width: `${csvColumnWidthsForTab[idx] || DEFAULT_CSV_COLUMN_WIDTH}px`,
                                        minWidth: `${MIN_CSV_COLUMN_WIDTH}px`,
                                        borderLeftWidth: idx === 0 ? '1px' : '0',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 40
                                      }}
                                    >
                                      <span className="pr-2 block truncate">{cell || `Column ${idx + 1}`}</span>
                                      <div
                                        className="absolute top-0 right-[-1px] h-full w-[3px] cursor-col-resize hover:bg-indigo-500 flex items-center justify-center z-10"
                                        aria-label={`Resize column ${idx + 1}`}
                                        onMouseDown={(e) => handleCsvColumnResizeStart(e, idx)}
                                        onDoubleClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleCsvColumnAutoFit(idx);
                                        }}
                                        style={{ background: 'rgba(99, 102, 241, 0.2)' }}
                                      >
                                      </div>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {csvPreviewRows.map((row, rowIdx) => {
                                  const lineNumBgColor = theme === 'dark' ? '#1f2937' : '#f3f4f6';
                                  const isActiveRow = csvPreviewHasDataRows && rowIdx === activeCsvRowIndex;
                                  const rowHighlightStyle = isActiveRow ? { backgroundColor: csvRowHighlightBg } : null;
                                  const editorLineNumber = csvEditorRowRefs.current.get(rowIdx)?.lineNumber || (rowIdx + 2);
                                  return (
                                    <tr
                                      key={`csv-row-${rowIdx}`}
                                      ref={(el) => {
                                        if (!csvPreviewHasDataRows) return;
                                        if (el) {
                                          csvPreviewRowRefs.current.set(rowIdx, el);
                                        } else {
                                          csvPreviewRowRefs.current.delete(rowIdx);
                                        }
                                      }}
                                      onClick={csvPreviewHasDataRows ? () => handleCsvPreviewRowClick(rowIdx) : undefined}
                                      className={`${csvPreviewHasDataRows ? 'cursor-pointer transition-colors' : ''}`}
                                      style={rowHighlightStyle || undefined}
                                    >
                                      <td
                                        className={`line-num-cell border-r border-b border-l border-gray-700 px-2 py-1 text-center select-none ${isActiveRow ? `${csvRowHighlightTextClass} font-semibold` : 'text-gray-500'}`}
                                        style={{ width: '60px', minWidth: '60px', backgroundColor: isActiveRow ? csvRowHighlightLineBg : lineNumBgColor, position: 'sticky', left: 0, zIndex: 20 }}
                                      >
                                        {editorLineNumber}
                                      </td>
                                      {Array.from({ length: csvPreviewStats.columnCount }).map((_, cellIdx) => {
                                        // Combine row and column alternating colors for a grid pattern
                                        let cellBg;
                                        if (theme === 'dark') {
                                          // Dark mode: 4 different shades based on row/column combination
                                          if (rowIdx % 2 === 0) {
                                            cellBg = cellIdx % 2 === 0 ? '#1f2937' : '#1a222e'; // Even row
                                          } else {
                                            cellBg = cellIdx % 2 === 0 ? '#161e2a' : '#111827'; // Odd row
                                          }
                                        } else {
                                          // Light mode: 4 different shades
                                          if (rowIdx % 2 === 0) {
                                            cellBg = cellIdx % 2 === 0 ? '#f9fafb' : '#f3f4f6'; // Even row
                                          } else {
                                            cellBg = cellIdx % 2 === 0 ? '#ffffff' : '#f9fafb'; // Odd row
                                          }
                                        }

                                        return (
                                          <td
                                            key={`csv-cell-${rowIdx}-${cellIdx}`}
                                            className={`border-r border-b border-gray-700 px-2 py-1 whitespace-pre overflow-hidden ${isActiveRow ? csvRowHighlightTextClass : ''}`}
                                            style={{
                                              width: `${csvColumnWidthsForTab[cellIdx] || DEFAULT_CSV_COLUMN_WIDTH}px`,
                                              minWidth: `${MIN_CSV_COLUMN_WIDTH}px`,
                                              borderLeftWidth: cellIdx === 0 ? '1px' : '0',
                                              textOverflow: 'ellipsis',
                                              backgroundColor: isActiveRow ? undefined : cellBg
                                            }}
                                          >
                                            {row[cellIdx] ?? ''}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-0.5 border-b border-gray-700/30">
                        <button
                          type="button"
                          className="flex-1 h-1 bg-transparent hover:bg-indigo-500/40 cursor-row-resize transition-colors flex items-center justify-center group"
                          aria-label="Resize CSV preview area"
                          onMouseDown={handleCsvPreviewResizeStart}
                        >
                          <span className="w-8 h-0.5 bg-gray-600 rounded-full group-hover:bg-indigo-400" />
                        </button>
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-300 hover:text-white hover:border-indigo-400 transition-colors"
                          onClick={() => setIsCsvEditorCollapsed(prev => !prev)}
                          aria-pressed={isCsvEditorCollapsed}
                          title={isCsvEditorCollapsed ? "Show editor for CSV content" : "Hide editor to view preview only"}
                        >
                          {isCsvEditorCollapsed ? (
                            <span className="flex items-center gap-1"><ChevronUp className="w-3 h-3" /> Expand Editor</span>
                          ) : (
                            <span className="flex items-center gap-1"><ChevronDown className="w-3 h-3" /> Collapse Editor</span>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                  {activeTab.title === 'Welcome' ? (
                    <div className={`flex items-center justify-center h-full w-full ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      <div className="text-center max-w-2xl px-6">
                        <img
                          src="/tidycode-logo.svg"
                          className="w-24 h-24 mx-auto mb-4"
                          alt="Tidy Code"
                        />
                        <p className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>Welcome to Tidy Code <span className={`text-lg font-normal ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>v{appVersion}</span></p>
                        <p className={`text-sm mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                          A powerful code & text editor with PDF viewer, format conversion, syntax highlighting, AI assistance, and more
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-left mb-6">
                          {/* Column 1: File Support & Editing */}
                          <div>
                            <p className={`text-xs font-semibold mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>📝 File Support & Editing</p>
                            <div className={`text-xs space-y-1.5 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-blue-500">★</span>
                                <span className="font-semibold">PDF viewer with search & focus mode</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>40+ file types with syntax highlighting</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>VIM mode with keybindings support</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-blue-500">★</span>
                                <span className="font-semibold">Format conversion (JSON/XML/YAML/TOML)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>Structure tree for JSON, XML, YAML, TOML</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>CSV editor with live table preview</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>Markdown live preview with editor toggle</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>Multi-tab editing with auto-save</span>
                              </div>
                            </div>
                          </div>

                          {/* Column 2: AI & Advanced Features */}
                          <div>
                            <p className={`text-xs font-semibold mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>🤖 AI & Advanced Features</p>
                            <div className={`text-xs space-y-1.5 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-blue-500">★</span>
                                <span className="font-semibold">Native clipboard (no permission prompts)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>Large file support (100MB+) with WASM</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>AI-assisted error fixing (JSON/XML)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>AI text transformations with accept/reject</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>Multiple AI providers (Ollama, Groq, OpenAI)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>Side-by-side diff viewer for changes</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>Notes with AI features & folders</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                <span>Find & replace with regex support</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className={`text-xs mb-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                          <p className="mb-1"><strong>Supported Languages:</strong></p>
                          <p className="leading-relaxed">
                            JavaScript, TypeScript, JSX/TSX, Python, Java, PHP, Ruby, Go, Rust, C/C++, C#, Swift, Kotlin,
                            Scala, Dart, SQL, Bash, Lua, R, JSON, XML, YAML, TOML, Markdown, CSS, HTML, and more
                          </p>
                        </div>

                        <p className={`text-sm mt-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                          Click{' '}
                          <button
                            onClick={createNewTab}
                            className={`font-semibold underline hover:no-underline cursor-pointer ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                          >
                            New
                          </button>
                          {' '}or{' '}
                          <button
                            onClick={openFileWithDialog}
                            className={`font-semibold underline hover:no-underline cursor-pointer ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                          >
                            Open File
                          </button>
                          {' '}to get started
                        </p>
                      </div>
                    </div>
                  ) : (
                    (() => {
                      // For markdown: show editor when preview is collapsed (isMarkdownPreviewCollapsed = true)
                      // For CSV: respect isCsvEditorCollapsed
                      // For other files: always show editor
                      const shouldRender = isMarkdownTab
                        ? isMarkdownPreviewCollapsed  // Markdown: show editor when preview is collapsed
                        : !isCsvEditorCollapsed;       // Others: show unless CSV editor collapsed

                      return shouldRender && renderEditorWorkspace();
                    })()
                  )}

                </div>
              </div>
            </div>

            {/* Search Results Panel */}
            {showSearchResults && searchResults.length > 0 && (
              <div className={`border-t ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-300'}`} style={{ height: `${searchResultsHeight}px` }}>
                {/* Resize handle */}
                <div
                  onMouseDown={handleSearchResultsResizeStart}
                  className={`h-1.5 cursor-ns-resize hover:bg-indigo-500 transition-colors ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-400'}`}
                  title="Drag to resize search results panel"
                />
                <div className={`flex items-center justify-between px-3 py-1 border-b ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-200 border-gray-300'}`}>
                  <div className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-indigo-400" />
                    <span className={`text-xs font-semibold ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
                      Search Results
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${theme === 'dark' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>
                      {searchResults.length} {searchResults.length === 1 ? 'match' : 'matches'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setShowSearchResults(false);
                      setFindValue('');
                      setSearchResults([]);
                    }}
                    className={`p-1 rounded hover:bg-gray-700 ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}
                    title="Close search results"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="overflow-y-auto" style={{ height: 'calc(100% - 34px)' }}>
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      onClick={() => {
                        focusEditorRange(result.position, result.position + findValue.length);
                      }}
                      className={`px-2 py-px border-b cursor-pointer transition-colors ${
                        theme === 'dark'
                          ? 'border-gray-800 hover:bg-gray-800'
                          : 'border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-mono whitespace-nowrap ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'}`}>
                          {result.line}:{result.column}
                        </span>
                        <div className="flex-1 min-w-0 truncate">
                          <code className={`text-xs font-mono leading-tight ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            {result.text.substring(0, result.matchStart)}
                            <span className={`${theme === 'dark' ? 'bg-yellow-500/30 text-yellow-200' : 'bg-yellow-200 text-yellow-900'}`}>
                              {result.text.substring(result.matchStart, result.matchEnd)}
                            </span>
                            {result.text.substring(result.matchEnd)}
                          </code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full-width Error/Warning Panel Below Editor */}
            {errorMessage && (
              <div
                className={`overflow-hidden border-t-2 flex flex-col ${
                  errorMessage.type === 'Warning'
                    ? theme === 'dark'
                      ? 'bg-gradient-to-b from-amber-900/30 to-gray-800 border-amber-500'
                      : 'bg-gradient-to-b from-amber-50 to-gray-100 border-amber-400'
                    : errorMessage.type === 'Conversion'
                      ? theme === 'dark'
                        ? 'bg-gradient-to-b from-red-900/30 to-gray-800 border-red-500'
                        : 'bg-gradient-to-b from-red-50 to-gray-100 border-red-400'
                      : theme === 'dark'
                        ? 'bg-gray-800 border-gray-700'
                        : 'bg-gray-100 border-gray-300'
                }`}
                style={{
                  height: (errorMessage.type === 'Warning' || errorMessage.type === 'Conversion')
                    ? `${infoPanelHeight}px`
                    : '50%',
                  minHeight: '80px',
                  maxHeight: '300px'
                }}
              >
                {/* Resize handle for Warning/Conversion panels */}
                {(errorMessage.type === 'Warning' || errorMessage.type === 'Conversion') && (
                  <div
                    className={`h-2 cursor-ns-resize flex items-center justify-center hover:bg-opacity-50 ${
                      theme === 'dark' ? 'hover:bg-gray-600' : 'hover:bg-gray-300'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      infoPanelResizing.current = true;
                      const startY = e.clientY;
                      const startHeight = infoPanelHeight;

                      const handleMouseMove = (moveEvent) => {
                        if (infoPanelResizing.current) {
                          const deltaY = startY - moveEvent.clientY;
                          const newHeight = Math.min(300, Math.max(80, startHeight + deltaY));
                          setInfoPanelHeight(newHeight);
                        }
                      };

                      const handleMouseUp = () => {
                        infoPanelResizing.current = false;
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                      };

                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    }}
                  >
                    <div className={`w-12 h-1 rounded-full ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-400'}`} />
                  </div>
                )}

                <div className={`${(errorMessage.type === 'Warning' || errorMessage.type === 'Conversion') ? 'p-3' : 'p-6'} overflow-y-auto flex-1`}>
                  {/* Header */}
                  <div className={`flex items-center justify-between ${(errorMessage.type === 'Warning' || errorMessage.type === 'Conversion') ? 'mb-2' : 'mb-4'}`}>
                    <div className="flex items-center gap-2">
                      {errorMessage.type === 'Warning' && (
                        <div className={`p-1 rounded-full ${theme === 'dark' ? 'bg-amber-500/20' : 'bg-amber-100'}`}>
                          <Info className={`w-4 h-4 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`} />
                        </div>
                      )}
                      <span className={`font-semibold ${(errorMessage.type === 'Warning' || errorMessage.type === 'Conversion') ? 'text-sm' : 'text-lg font-bold'} ${
                        errorMessage.type === 'Warning'
                          ? theme === 'dark' ? 'text-amber-300' : 'text-amber-700'
                          : theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
                      }`}>
                        {errorMessage.type === 'Warning' ? (
                          <>Conversion Complete - Please Review</>
                        ) : errorMessage.type === 'Conversion' ? (
                          <>Conversion Failed</>
                        ) : (
                          <>Invalid {errorMessage.type} - Formatting Failed</>
                        )}
                      </span>
                      {errorMessage.type !== 'Warning' && errorMessage.type !== 'Conversion' && (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-300 text-gray-700'}`}>
                          {errorMessage.allErrors?.length || 1} Error{(errorMessage.allErrors?.length || 1) > 1 ? 's' : ''} Found
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Only show AI Fix and related buttons for actual format errors */}
                      {(errorMessage.type === 'JSON' || errorMessage.type === 'XML' || errorMessage.type === 'YAML' || errorMessage.type === 'TOML') && (
                        <>
                          <button
                            onClick={handleAIFix}
                            disabled={aiFixState.isLoading}
                            className={`px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-2 ${
                              aiFixState.isLoading
                                ? 'bg-purple-600/50 cursor-not-allowed text-white'
                                : theme === 'dark'
                                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                                  : 'bg-purple-500 hover:bg-purple-600 text-white'
                            }`}
                            title="Use AI to automatically fix errors"
                          >
                            {aiFixState.isLoading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {aiFixState.progress ? aiFixState.progress.text : 'Fixing...'}
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                AI Fix
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setShowAISettings(true)}
                            className={`px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-2 ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-300 hover:bg-gray-400 text-gray-800'}`}
                            title="Configure AI settings"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (errorMessage.type === 'JSON') {
                                formatJSON({ autoTriggered: false });
                              } else if (errorMessage.type === 'XML') {
                                formatXML({ autoTriggered: false });
                              }
                            }}
                            className={`px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-2 ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-300 hover:bg-gray-400 text-gray-800'}`}
                            title="Retry formatting after fixing errors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Retry Format
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setErrorMessage(null)}
                        className={`${(errorMessage.type === 'Warning' || errorMessage.type === 'Conversion') ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded transition-colors flex items-center gap-1 ${
                          errorMessage.type === 'Warning'
                            ? theme === 'dark'
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'bg-amber-500 hover:bg-amber-600 text-white'
                            : theme === 'dark'
                              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                              : 'bg-gray-300 hover:bg-gray-400 text-gray-800'
                        }`}
                      >
                        <X className={`${(errorMessage.type === 'Warning' || errorMessage.type === 'Conversion') ? 'w-3 h-3' : 'w-4 h-4'}`} />
                        {errorMessage.type === 'Warning' ? 'Dismiss' : 'Close'}
                      </button>
                    </div>
                  </div>

                  {/* Warning/Info Panel for conversions */}
                  {(errorMessage.type === 'Warning' || errorMessage.type === 'Conversion') ? (
                    <div className="space-y-2">
                      {/* Main message */}
                      <div className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        {errorMessage.message}
                      </div>

                      {/* Adjustments list - clickable to go to line */}
                      {errorMessage.adjustments && errorMessage.adjustments.length > 0 && (
                        <div className={`rounded p-2 ${theme === 'dark' ? 'bg-gray-900/60' : 'bg-white/80'}`}>
                          <div className={`text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-amber-300' : 'text-amber-700'}`}>
                            Adjustments Made ({errorMessage.adjustments.length}):
                          </div>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {errorMessage.adjustments.map((adj, idx) => (
                              <div
                                key={idx}
                                role="button"
                                tabIndex={0}
                                onClick={() => adj.line && goToPosition(adj.line, 1)}
                                onKeyDown={(e) => {
                                  if ((e.key === 'Enter' || e.key === ' ') && adj.line) {
                                    e.preventDefault();
                                    goToPosition(adj.line, 1);
                                  }
                                }}
                                className={`flex items-start gap-2 text-xs py-0.5 px-1 rounded ${
                                  adj.line
                                    ? `cursor-pointer ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`
                                    : ''
                                }`}
                                title={adj.line ? `Go to line ${adj.line}` : ''}
                              >
                                {adj.line && (
                                  <span className={`font-mono shrink-0 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>
                                    L{adj.line}
                                  </span>
                                )}
                                <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>
                                  {adj.message}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tips - only show if no adjustments */}
                      {errorMessage.tips && errorMessage.tips.length > 0 && (
                        <div className={`rounded p-2 ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-gray-100'}`}>
                          <ul className={`text-xs space-y-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                            {errorMessage.tips.map((tip, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className={theme === 'dark' ? 'text-amber-400' : 'text-amber-500'}>•</span>
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                  /* Errors Grid */
                  <div className="grid grid-cols-1 gap-3 mb-4">
                    {errorMessage.allErrors && errorMessage.allErrors.length > 0 ? (
                      errorMessage.allErrors.map((error, idx) => (
                        <div 
                          key={idx}
                          role="button"
                          tabIndex={0}
                          onClick={() => goToPosition(error.line, error.column)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              goToPosition(error.line, error.column);
                            }
                          }}
                          className={`cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-400 border-l-4 ${error.isPrimary ? 'border-orange-400' : 'border-yellow-400'} ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} pl-4 pr-4 py-3 rounded-r-lg`}
                          title="Jump to this error location"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`font-bold text-lg ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                              Error #{idx + 1}
                            </span>
                            {error.isPrimary && (
                              <span className="bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                                PRIMARY ERROR
                              </span>
                            )}
                            {error.severity === 'warning' && (
                              <span className="bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                                WARNING
                              </span>
                            )}
                            <span className={`font-mono text-base font-bold ml-auto ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-700'}`}>
                              📍 Line {error.line}, Column {error.column}
                            </span>
                          </div>
                          <div className={`text-base leading-relaxed ${theme === 'dark' ? 'text-red-100' : 'text-red-900'}`}>
                            {error.message}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => goToPosition(errorMessage.line, errorMessage.column)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            goToPosition(errorMessage.line, errorMessage.column);
                          }
                        }}
                        className={`cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-400 border-l-4 border-yellow-400 pl-4 pr-4 py-3 rounded-r-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`font-bold text-lg ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            Error #1
                          </span>
                          {errorMessage.line && (
                            <span className={`font-mono text-base font-bold ml-auto ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-700'}`}>
                              📍 Line {errorMessage.line}, Column {errorMessage.column}
                            </span>
                          )}
                        </div>
                        <div className={`text-base leading-relaxed ${theme === 'dark' ? 'text-red-100' : 'text-red-900'}`}>
                          {errorMessage.message}
                        </div>
                      </div>
                    )}
                  </div>
                  )}

                  {/* AI Fix Error Display */}
                  {aiFixState.error && (
                    <div className={`mb-4 p-4 rounded-lg border ${
                      theme === 'dark'
                        ? 'bg-red-900/20 border-red-800'
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-start gap-2">
                        <X className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                          theme === 'dark' ? 'text-red-400' : 'text-red-600'
                        }`} />
                        <div>
                          <p className={`text-sm font-semibold ${
                            theme === 'dark' ? 'text-red-300' : 'text-red-900'
                          }`}>
                            AI Fix Failed
                          </p>
                          <p className={`text-xs mt-1 ${
                            theme === 'dark' ? 'text-red-400' : 'text-red-700'
                          }`}>
                            {aiFixState.error}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Common JSON Issues Section */}
                  {errorMessage.type === 'JSON' && errorMessage.tips && errorMessage.tips.length > 0 && (
                    <div className={`rounded-lg p-4 ${theme === 'dark' ? 'bg-black bg-opacity-40' : 'bg-gray-200'}`}>
                      <button
                        onClick={() => setTipsCollapsed(prev => !prev)}
                        className={`w-full flex items-center justify-between font-bold text-base mb-3 ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-700'}`}
                      >
                        <span>💡 Common JSON Issues to Check</span>
                        <span className="text-xs uppercase tracking-wide">
                          {tipsCollapsed ? 'Show' : 'Hide'}
                        </span>
                      </button>
                      {!tipsCollapsed && (
                        <ul className={`text-sm space-y-2 list-disc list-inside ${theme === 'dark' ? 'text-red-100' : 'text-gray-800'}`}>
                          {errorMessage.tips.map((tip, idx) => (
                            <li key={idx} className="leading-relaxed">{tip}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={`flex items-center justify-center h-full w-full ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
            <div className="text-center max-w-2xl px-6">
              <img
                src="/tidycode-logo.svg"
                className="w-24 h-24 mx-auto mb-4"
                alt="Tidy Code"
              />
              <p className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>Welcome to Tidy Code <span className={`text-lg font-normal ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>v{appVersion}</span></p>
              <p className={`text-sm mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                A powerful code & text editor with syntax highlighting, AI-assisted error fixing, and more
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-left mb-6">
                {/* Column 1: File Support & Editing */}
                <div>
                  <p className={`text-xs font-semibold mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>📝 File Support & Editing</p>
                  <div className={`text-xs space-y-1.5 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>40+ file types with syntax highlighting</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>VIM mode with keybindings support</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>JSON/XML formatter & validator</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Structure tree for JSON, XML, YAML</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>CSV editor with live table preview</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Markdown live preview with editor toggle</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Multi-tab editing with auto-save</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Desktop app with file associations</span>
                    </div>
                  </div>
                </div>

                {/* Column 2: AI & Advanced Features */}
                <div>
                  <p className={`text-xs font-semibold mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>🤖 AI & Advanced Features</p>
                  <div className={`text-xs space-y-1.5 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Large file support (20MB+) with WASM</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>AI-assisted error fixing (JSON/XML)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>AI text transformations with accept/reject</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Markdown formatting for AI responses</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Multiple AI providers (Ollama, Groq, OpenAI)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Side-by-side diff viewer for changes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Notes with AI features & folders</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Find & replace with regex support</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`text-xs mb-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                <p className="mb-1"><strong>Supported Languages:</strong></p>
                <p className="leading-relaxed">
                  JavaScript, TypeScript, JSX/TSX, Python, Java, PHP, Ruby, Go, Rust, C/C++, C#, Swift, Kotlin,
                  Scala, Dart, SQL, Bash, Lua, R, JSON, XML, YAML, TOML, Markdown, CSS, HTML, and more
                </p>
              </div>

              <p className={`text-sm mt-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                Click{' '}
                <button
                  onClick={createNewTab}
                  className={`font-semibold underline hover:no-underline cursor-pointer ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                >
                  New
                </button>
                {' '}or{' '}
                <button
                  onClick={openFileWithDialog}
                  className={`font-semibold underline hover:no-underline cursor-pointer ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                >
                  Open File
                </button>
                {' '}to get started
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar - Hidden for Welcome tab */}
      {activeTab?.title !== 'Welcome' && (
        <div className={`border-t px-4 py-1.5 flex items-center justify-between text-xs ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-gray-200 border-gray-300 text-gray-600'}`}>
          <div className="flex gap-4">
            <span>Tabs: {tabs.length}</span>
            {activeTab && (
              <>
                <span>Size: {formatFileSize(activeTab.fileSize || new Blob([activeTab.content || '']).size)}</span>
                <span>Lines: {String(activeTab.content || '').split('\n').length}</span>
                <span className="text-blue-400">Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
              </>
            )}
          </div>
          <div className="flex gap-4 items-center">
            {activeTab?.isModified && <span className="text-yellow-400">● Modified</span>}
            <span className={theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}>v{appVersion}</span>
          </div>
        </div>
      )}
    </div>
  );
  };

  const renderPanel = () => {
    if (currentPanel === 'notes') return renderNotesPanel();
    if (currentPanel === 'todo') return renderTodoPanel();
    return renderDevPanel();
  };

  const navItems = [
    { id: 'dev', label: 'Code', icon: Code2 },
    { id: 'notes', label: 'Notes', icon: StickyNote },
    { id: 'todo', label: 'Tasks', icon: CheckSquare },
    ...(isDesktop() ? [{ id: 'terminal', label: 'Terminal', icon: Terminal }] : []),
    { id: 'help', label: 'Help', icon: HelpCircle }
  ];

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const MIN_STRUCTURE_WIDTH = 200;
  const MAX_STRUCTURE_WIDTH = 520;
  const MIN_NOTES_SIDEBAR_WIDTH = 220;
  const MAX_NOTES_SIDEBAR_WIDTH = 520;
  const MIN_TODO_SIDEBAR_WIDTH = 200;
  const MAX_TODO_SIDEBAR_WIDTH = 480;
  const handleStructureResizeMove = useCallback((event) => {
    if (!structureDragState.current.active) return;
    const delta = event.clientX - structureDragState.current.startX;
    const nextWidth = Math.min(
      MAX_STRUCTURE_WIDTH,
      Math.max(MIN_STRUCTURE_WIDTH, structureDragState.current.startWidth + delta)
    );
    setStructureWidth(nextWidth);
  }, []);

  const handleStructureResizeEnd = useCallback(() => {
    if (!structureDragState.current.active) return;
    structureDragState.current = {
      ...structureDragState.current,
      active: false
    };
    document.removeEventListener('mousemove', handleStructureResizeMove);
    document.removeEventListener('mouseup', handleStructureResizeEnd);
  }, [handleStructureResizeMove]);

  const handleStructureResizeStart = useCallback((event) => {
    event.preventDefault();
    structureDragState.current = {
      active: true,
      startX: event.clientX,
      startWidth: structureWidth
    };
    document.addEventListener('mousemove', handleStructureResizeMove);
    document.addEventListener('mouseup', handleStructureResizeEnd);
  }, [structureWidth, handleStructureResizeMove, handleStructureResizeEnd]);

  // Left panel (File Explorer / File System Browser) resize handlers
  const MIN_LEFT_PANEL_WIDTH = 200;
  const MAX_LEFT_PANEL_WIDTH = 600;

  const handleLeftPanelResizeMove = useCallback((event) => {
    if (!leftPanelDragState.current.active) return;
    const delta = event.clientX - leftPanelDragState.current.startX;
    const nextWidth = Math.min(
      MAX_LEFT_PANEL_WIDTH,
      Math.max(MIN_LEFT_PANEL_WIDTH, leftPanelDragState.current.startWidth + delta)
    );
    setLeftPanelWidth(nextWidth);
  }, []);

  const handleLeftPanelResizeEnd = useCallback(() => {
    if (!leftPanelDragState.current.active) return;
    leftPanelDragState.current = {
      ...leftPanelDragState.current,
      active: false
    };
    document.removeEventListener('mousemove', handleLeftPanelResizeMove);
    document.removeEventListener('mouseup', handleLeftPanelResizeEnd);
  }, [handleLeftPanelResizeMove]);

  const handleLeftPanelResizeStart = useCallback((event) => {
    event.preventDefault();
    leftPanelDragState.current = {
      active: true,
      startX: event.clientX,
      startWidth: leftPanelWidth
    };
    document.addEventListener('mousemove', handleLeftPanelResizeMove);
    document.addEventListener('mouseup', handleLeftPanelResizeEnd);
  }, [leftPanelWidth, handleLeftPanelResizeMove, handleLeftPanelResizeEnd]);

  const handleNotesResizeMove = useCallback((event) => {
    if (!notesSidebarDragState.current.active) return;
    const delta = event.clientX - notesSidebarDragState.current.startX;
    const nextWidth = Math.min(
      MAX_NOTES_SIDEBAR_WIDTH,
      Math.max(MIN_NOTES_SIDEBAR_WIDTH, notesSidebarDragState.current.startWidth + delta)
    );
    setNotesSidebarWidth(nextWidth);
  }, []);

  const handleNotesResizeEnd = useCallback(() => {
    if (!notesSidebarDragState.current.active) return;
    notesSidebarDragState.current = {
      ...notesSidebarDragState.current,
      active: false
    };
    document.removeEventListener('mousemove', handleNotesResizeMove);
    document.removeEventListener('mouseup', handleNotesResizeEnd);
  }, [handleNotesResizeMove]);

  const handleNotesResizeStart = useCallback((event) => {
    event.preventDefault();
    notesSidebarDragState.current = {
      active: true,
      startX: event.clientX,
      startWidth: notesSidebarWidth
    };
    document.addEventListener('mousemove', handleNotesResizeMove);
    document.addEventListener('mouseup', handleNotesResizeEnd);
  }, [notesSidebarWidth, handleNotesResizeMove, handleNotesResizeEnd]);

  const handleTodoResizeMove = useCallback((event) => {
    if (!todoSidebarDragState.current.active) return;
    const delta = event.clientX - todoSidebarDragState.current.startX;
    const nextWidth = Math.min(
      MAX_TODO_SIDEBAR_WIDTH,
      Math.max(MIN_TODO_SIDEBAR_WIDTH, todoSidebarDragState.current.startWidth + delta)
    );
    setTodoSidebarWidth(nextWidth);
  }, []);

  const handleTodoResizeEnd = useCallback(() => {
    if (!todoSidebarDragState.current.active) return;
    todoSidebarDragState.current = {
      ...todoSidebarDragState.current,
      active: false
    };
    document.removeEventListener('mousemove', handleTodoResizeMove);
    document.removeEventListener('mouseup', handleTodoResizeEnd);
  }, [handleTodoResizeMove]);

  const handleTodoResizeStart = useCallback((event) => {
    event.preventDefault();
    todoSidebarDragState.current = {
      active: true,
      startX: event.clientX,
      startWidth: todoSidebarWidth
    };
    document.addEventListener('mousemove', handleTodoResizeMove);
    document.addEventListener('mouseup', handleTodoResizeEnd);
  }, [todoSidebarWidth, handleTodoResizeMove, handleTodoResizeEnd]);
  const handleCsvPreviewResizeMove = useCallback((event) => {
    if (!csvPreviewDragState.current.active) return;
    const delta = event.clientY - csvPreviewDragState.current.startY;
    const nextHeight = Math.min(
      MAX_CSV_PREVIEW_HEIGHT,
      Math.max(MIN_CSV_PREVIEW_HEIGHT, csvPreviewDragState.current.startHeight + delta)
    );
    setCsvPreviewHeight(nextHeight);
  }, []);

  const handleCsvPreviewResizeEnd = useCallback(() => {
    if (!csvPreviewDragState.current.active) return;
    csvPreviewDragState.current = {
      ...csvPreviewDragState.current,
      active: false
    };
    document.removeEventListener('mousemove', handleCsvPreviewResizeMove);
    document.removeEventListener('mouseup', handleCsvPreviewResizeEnd);
  }, [handleCsvPreviewResizeMove]);

  const handleCsvPreviewResizeStart = useCallback((event) => {
    event.preventDefault();
    csvPreviewDragState.current = {
      active: true,
      startY: event.clientY,
      startHeight: csvPreviewHeight
    };
    document.addEventListener('mousemove', handleCsvPreviewResizeMove);
    document.addEventListener('mouseup', handleCsvPreviewResizeEnd);
  }, [csvPreviewHeight, handleCsvPreviewResizeMove, handleCsvPreviewResizeEnd]);

  // Search results resize handlers
  const handleSearchResultsResizeMove = useCallback((event) => {
    if (!searchResultsDragState.current.active) return;
    const delta = searchResultsDragState.current.startY - event.clientY; // Inverted for upward drag = increase
    const nextHeight = Math.min(
      MAX_SEARCH_RESULTS_HEIGHT,
      Math.max(MIN_SEARCH_RESULTS_HEIGHT, searchResultsDragState.current.startHeight + delta)
    );
    setSearchResultsHeight(nextHeight);
  }, []);

  const handleSearchResultsResizeEnd = useCallback(() => {
    if (!searchResultsDragState.current.active) return;
    searchResultsDragState.current = {
      ...searchResultsDragState.current,
      active: false
    };
    document.removeEventListener('mousemove', handleSearchResultsResizeMove);
    document.removeEventListener('mouseup', handleSearchResultsResizeEnd);
  }, [handleSearchResultsResizeMove]);

  const handleSearchResultsResizeStart = useCallback((event) => {
    event.preventDefault();
    searchResultsDragState.current = {
      active: true,
      startY: event.clientY,
      startHeight: searchResultsHeight
    };
    document.addEventListener('mousemove', handleSearchResultsResizeMove);
    document.addEventListener('mouseup', handleSearchResultsResizeEnd);
  }, [searchResultsHeight, handleSearchResultsResizeMove, handleSearchResultsResizeEnd]);

  // Markdown preview resize handlers
  const handleMarkdownPreviewResizeMove = useCallback((event) => {
    if (!markdownPreviewDragState.current.active) return;
    const delta = event.clientY - markdownPreviewDragState.current.startY;
    const nextHeight = Math.min(
      MAX_CSV_PREVIEW_HEIGHT,
      Math.max(MIN_CSV_PREVIEW_HEIGHT, markdownPreviewDragState.current.startHeight + delta)
    );
    setMarkdownPreviewHeight(nextHeight);
  }, []);

  const handleMarkdownPreviewResizeEnd = useCallback(() => {
    if (!markdownPreviewDragState.current.active) return;
    markdownPreviewDragState.current = {
      ...markdownPreviewDragState.current,
      active: false
    };
    document.removeEventListener('mousemove', handleMarkdownPreviewResizeMove);
    document.removeEventListener('mouseup', handleMarkdownPreviewResizeEnd);
  }, [handleMarkdownPreviewResizeMove]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (markdownPreviewDragState.current.active) {
        handleMarkdownPreviewResizeMove(e);
      }
    };
    const handleMouseUp = () => {
      if (markdownPreviewDragState.current.active) {
        handleMarkdownPreviewResizeEnd();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMarkdownPreviewResizeMove, handleMarkdownPreviewResizeEnd]);

  const csvColumnResizeMoveRef = useRef(null);
  const csvColumnResizeEndRef = useRef(null);

  csvColumnResizeMoveRef.current = (event) => {
    if (!csvColumnDragState.current.active || csvColumnDragState.current.columnIndex === null) return;
    event.preventDefault();
    const delta = event.clientX - csvColumnDragState.current.startX;
    const nextWidth = Math.min(
      MAX_CSV_COLUMN_WIDTH,
      Math.max(MIN_CSV_COLUMN_WIDTH, csvColumnDragState.current.startWidth + delta)
    );
    const tabId = csvColumnDragState.current.tabId;
    const columnIndex = csvColumnDragState.current.columnIndex;
    setCsvColumnWidths(prev => {
      const newTabWidths = prev[tabId] ? [...prev[tabId]] : [];
      newTabWidths[columnIndex] = nextWidth;
      return { ...prev, [tabId]: newTabWidths };
    });
  };

  csvColumnResizeEndRef.current = () => {
    if (!csvColumnDragState.current.active) return;
    csvColumnDragState.current = {
      active: false,
      startX: 0,
      startWidth: DEFAULT_CSV_COLUMN_WIDTH,
      columnIndex: null,
      tabId: null
    };
    document.removeEventListener('mousemove', csvColumnResizeMoveRef.current);
    document.removeEventListener('mouseup', csvColumnResizeEndRef.current);
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = '';
    }
  };

  const handleCsvColumnAutoFit = useCallback((columnIndex) => {
    if (!activeTab || !csvPreviewStats) return;

    // Get all values in this column (header + all rows)
    const header = csvPreviewStats.header[columnIndex] || `Column ${columnIndex + 1}`;
    const columnValues = [header];

    csvPreviewStats.rows.forEach(row => {
      const value = row[columnIndex] || '';
      columnValues.push(String(value));
    });

    // Calculate max length - rough estimate: 8px per character + padding
    const maxContentLength = Math.max(...columnValues.map(v => v.length));
    const estimatedWidth = Math.min(
      MAX_CSV_COLUMN_WIDTH,
      Math.max(MIN_CSV_COLUMN_WIDTH, maxContentLength * 8 + 32)
    );

    // Update the width
    setCsvColumnWidths(prev => {
      const newTabWidths = prev[activeTab.id] ? [...prev[activeTab.id]] : [];
      newTabWidths[columnIndex] = estimatedWidth;
      return { ...prev, [activeTab.id]: newTabWidths };
    });
  }, [activeTab, csvPreviewStats]);

  const handleCsvColumnResizeStart = useCallback((event, columnIndex) => {
    if (!activeTab) return;
    event.preventDefault();
    event.stopPropagation();
    const currentWidths = csvColumnWidths[activeTab.id] || [];
    csvColumnDragState.current = {
      active: true,
      startX: event.clientX,
      startWidth: currentWidths[columnIndex] || DEFAULT_CSV_COLUMN_WIDTH,
      columnIndex,
      tabId: activeTab.id
    };
    document.addEventListener('mousemove', csvColumnResizeMoveRef.current);
    document.addEventListener('mouseup', csvColumnResizeEndRef.current);
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = 'none';
    }
  }, [activeTab, csvColumnWidths]);

  const navActiveClass = theme === 'dark'
    ? 'border-indigo-500 bg-gray-900 text-white'
    : 'border-indigo-500 bg-indigo-50 text-indigo-700';

  const navInactiveClass = theme === 'dark'
    ? 'border-transparent text-gray-400 hover:bg-gray-900 hover:text-white'
    : 'border-transparent text-gray-500 hover:bg-indigo-50 hover:text-indigo-700';

  return (
    <div className="flex h-screen w-screen max-w-full bg-gray-950 text-gray-100 overflow-hidden" data-theme={theme}>
      {appMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-md shadow-lg border transition-opacity ${
            theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900'
          } ${
            appMessage.tone === 'error'
              ? 'border-red-500/70 text-red-200'
              : appMessage.tone === 'warn'
                ? 'border-yellow-500/70 text-yellow-900 dark:text-yellow-200 dark:bg-yellow-900/40 bg-yellow-50/80'
                : 'border-blue-500/70 text-blue-900 dark:text-blue-100 dark:bg-blue-900/40 bg-blue-50/80'
          }`}
        >
          <div className="text-sm font-semibold mb-0.5">Notice</div>
          <div className="text-sm leading-snug">{appMessage.message}</div>
        </div>
      )}

      {/* Privacy-first banner for new users (web only) */}
      {showPrivacyBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full mx-4">
          <div className={`px-4 py-3 rounded-lg shadow-xl border ${
            theme === 'dark'
              ? 'bg-gray-900 border-emerald-500/50'
              : 'bg-white border-emerald-400 shadow-emerald-100'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                theme === 'dark' ? 'bg-emerald-500/20' : 'bg-emerald-100'
              }`}>
                <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Your data stays on your device
                </h3>
                <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Tidy Code stores all notes, todos, and files locally in your browser. Nothing is sent to the cloud. No account required.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
                    theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    No cloud storage
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
                    theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Works offline
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
                    theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Privacy-respecting ads
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowPrivacyBanner(false);
                  localStorage.setItem('privacy-banner-dismissed', 'true');
                }}
                className={`flex-shrink-0 p-1 rounded ${
                  theme === 'dark' ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-16 bg-gray-950 border-r border-gray-800 flex flex-col relative">
        <div className="flex items-center justify-center px-3 py-3 text-sm text-gray-400 uppercase tracking-wide">
          <LogoMark size={26} />
        </div>
        <div className="flex-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = item.id === 'terminal' ? showTerminalPanel : currentPanel === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'help') {
                    // Always open welcome page in new tab/window for both web and desktop
                    if (isDesktop()) {
                      openUrl(HELP_URLS.welcome);
                    } else {
                      window.open('/docs/index.html', '_blank');
                    }
                  } else if (item.id === 'terminal') {
                    // Toggle terminal panel at bottom
                    setShowTerminalPanel(prev => !prev);
                  } else {
                    setCurrentPanel(item.id);
                  }
                }}
                aria-label={item.label}
                className={`w-full flex flex-col items-center justify-center px-1 py-2 border-l-4 transition-colors ${active ? navActiveClass : navInactiveClass}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] mt-1 font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
        {/* Privacy indicator (web only) */}
        {!isDesktop() && (
          <div className="px-2 py-2">
            <Tooltip content="All data stored locally on your device" placement="right">
              <div className="flex items-center justify-center gap-1 text-[9px] text-emerald-400 bg-emerald-500/10 rounded-md px-2 py-1.5 cursor-default">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="font-medium">Local</span>
              </div>
            </Tooltip>
          </div>
        )}
        <div className="border-t border-gray-800 px-2 py-2 flex justify-center">
          <div className="relative w-full" ref={settingsMenuRef}>
            <button
              onClick={() => setIsSettingsOpen(open => !open)}
              className="w-full flex flex-col items-center justify-center px-1 py-2 rounded-md text-sm border border-transparent hover:border-indigo-400 text-gray-300 hover:text-white transition-colors"
              aria-haspopup="menu"
              aria-expanded={isSettingsOpen}
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
              <span className="text-[10px] mt-1 font-medium">Settings</span>
            </button>
            {isSettingsOpen && (
              <div className="absolute left-full bottom-0 ml-2 w-64 bg-gray-950 border border-gray-800 rounded-lg shadow-2xl z-40">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                  <span className="text-sm font-semibold">Settings</span>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="text-gray-400 hover:text-white"
                    aria-label="Close settings menu"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3 space-y-4 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Theme</p>
                    <div className="flex flex-col gap-2">
                      {[
                        { id: 'dark', label: 'Dark Mode', icon: <Moon className="w-4 h-4" /> },
                        { id: 'light', label: 'Light Mode', icon: <Sun className="w-4 h-4" /> }
                      ].map(option => (
                        <button
                          key={option.id}
                          onClick={() => {
                            setTheme(option.id);
                            setIsSettingsOpen(false);
                          }}
                          className={`flex items-center justify-between px-3 py-2 rounded border ${
                            theme === option.id ? 'border-indigo-400 bg-indigo-900/40 text-white' : 'border-gray-700 hover:border-indigo-300 text-gray-300'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {option.icon}
                            {option.label}
                          </span>
                          {theme === option.id && <span className="text-xs text-indigo-200 uppercase tracking-wide">Active</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Font Size</p>
                    <div className="flex flex-col gap-2">
                      {[
                        { id: '2xs', label: 'Extra Small', size: '10px' },
                        { id: 'xs', label: 'Small (Default)', size: '12px' },
                        { id: 'sm', label: 'Medium', size: '14px' },
                        { id: 'base', label: 'Large', size: '16px' }
                      ].map(option => (
                        <button
                          key={option.id}
                          onClick={() => {
                            setFontSize(option.id);
                          }}
                          className={`flex items-center justify-between px-3 py-2 rounded border ${
                            fontSize === option.id ? 'border-indigo-400 bg-indigo-900/40 text-white' : 'border-gray-700 hover:border-indigo-300 text-gray-300'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {option.label}
                            <span className="text-xs text-gray-500">({option.size})</span>
                          </span>
                          {fontSize === option.id && <span className="text-xs text-indigo-200 uppercase tracking-wide">Active</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Editor</p>
                    <button
                      onClick={() => setAutoPairingEnabled(!autoPairingEnabled)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded border ${
                        autoPairingEnabled ? 'border-indigo-400 bg-indigo-900/40 text-white' : 'border-gray-700 hover:border-indigo-300 text-gray-300'
                      }`}
                    >
                      <span className="text-left">
                        <div className="font-medium">Auto-pairing</div>
                        <div className="text-xs text-gray-400 mt-0.5">Automatically close brackets and quotes</div>
                      </span>
                      <span className={`text-xs uppercase tracking-wide ${autoPairingEnabled ? 'text-indigo-200' : 'text-gray-500'}`}>
                        {autoPairingEnabled ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  </div>
                  <div className="pt-3 border-t border-gray-800">
                    <a
                      href="/privacy.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-indigo-400 hover:bg-gray-900 rounded transition-colors"
                    >
                      <Info className="w-4 h-4" />
                      <span className="text-sm">Privacy Policy</span>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {renderPanel()}
        </div>

        {/* Terminal Panel */}
        {isDesktop() && (
          <div style={{ display: showTerminalPanel ? 'flex' : 'none', flexDirection: 'column' }}>
            <TerminalPanel
              ref={terminalPanelRef}
              theme={theme}
              onClose={() => setShowTerminalPanel(false)}
            />
          </div>
        )}
      </div>

      {/* Tab Context Menu */}
      {tabContextMenu && (
        <div
          className="fixed bg-gray-800 border border-gray-700 rounded shadow-lg py-1 z-50"
          style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={async () => {
              await closeTab(tabContextMenu.tabId);
              setTabContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Close Tab
          </button>
          <button
            onClick={() => {
              closeOtherTabs(tabContextMenu.tabId);
              setTabContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Close Other Tabs
          </button>
          <button
            onClick={() => {
              closeTabsToRight(tabContextMenu.tabId);
              setTabContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
            disabled={tabs.findIndex(t => t.id === tabContextMenu.tabId) === tabs.length - 1}
          >
            <X className="w-4 h-4" />
            Close Tabs to Right
          </button>
          <div className="border-t border-gray-700 my-1" />
          <button
            onClick={() => {
              openDiffWithTab(tabContextMenu.tabId);
              setTabContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
            disabled={tabs.length < 2}
          >
            <GitCompare className="w-4 h-4" />
            Compare with...
          </button>
          <div className="border-t border-gray-700 my-1" />
          <button
            onClick={() => {
              closeAllTabs();
              setTabContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Close All Tabs
          </button>
        </div>
      )}

      {/* About Modal */}
      {showAboutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowAboutModal(false)}
        >
          <div
            className={`relative w-full max-w-lg rounded-xl border shadow-2xl ${
              theme === 'dark'
                ? 'bg-gray-900/95 border-gray-800 text-gray-100'
                : 'bg-white border-gray-200 text-gray-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAboutModal(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors"
              aria-label="Close About dialog"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-4 p-6 pb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/15 border border-indigo-500/40">
                <LogoMark size={44} />
              </div>
              <div className="flex-1 space-y-1">
                <div className="text-xl font-semibold leading-tight">{aboutInfo?.name || 'Tidy Code'}</div>
                <div className="text-sm text-gray-400">
                  A powerful code, text editor & formatter with syntax highlighting, AI-assisted error fixing, and more.
                </div>
              </div>
            </div>
            <div className={`grid grid-cols-2 gap-3 px-6 pb-4 text-sm ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">Version</span>
                <span className="font-mono">{aboutInfo?.version || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">Tauri</span>
                <span className="font-mono">{aboutInfo?.tauriVersion || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">OS</span>
                <span className="font-mono truncate">{aboutInfo?.os || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">Arch</span>
                <span className="font-mono">{aboutInfo?.arch || '—'}</span>
              </div>
            </div>

            {/* Open Source Attributions */}
            <div className={`px-6 pb-4 ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Open Source Libraries
              </div>
              <div className={`max-h-48 overflow-y-auto rounded-lg border p-3 space-y-2 text-xs ${
                theme === 'dark'
                  ? 'bg-gray-950/50 border-gray-800'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div>
                  <div className="font-semibold text-indigo-400">Code Editor</div>
                  <div className="text-gray-500 mt-0.5">
                    • CodeMirror (MIT) - <a href="https://codemirror.net" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">codemirror.net</a>
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-indigo-400">PDF Viewer</div>
                  <div className="text-gray-500 mt-0.5">
                    • PDF.js (Apache-2.0) - <a href="https://mozilla.github.io/pdf.js" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Mozilla Foundation</a><br />
                    • react-pdf (MIT) - <a href="https://github.com/wojtekmaj/react-pdf" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Wojciech Maj</a>
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-indigo-400">UI Framework</div>
                  <div className="text-gray-500 mt-0.5">
                    • React (MIT) - <a href="https://react.dev" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Meta Platforms</a><br />
                    • Lucide Icons (ISC) - <a href="https://lucide.dev" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">lucide.dev</a>
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-indigo-400">Desktop Framework</div>
                  <div className="text-gray-500 mt-0.5">
                    • Tauri (MIT/Apache-2.0) - <a href="https://tauri.app" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">tauri.app</a>
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-indigo-400">Terminal</div>
                  <div className="text-gray-500 mt-0.5">
                    • xterm.js (MIT) - <a href="https://xtermjs.org" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Microsoft Corporation</a>
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-indigo-400">AI Integration</div>
                  <div className="text-gray-500 mt-0.5">
                    • WebLLM (Apache-2.0) - <a href="https://github.com/mlc-ai/web-llm" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">MLC AI</a>
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-indigo-400">Additional Libraries</div>
                  <div className="text-gray-500 mt-0.5">
                    • Marked (MIT) - Markdown parser<br />
                    • Prism.js (MIT) - Syntax highlighting<br />
                    • diff (BSD-3-Clause) - Text diffing<br />
                    • Express (MIT) - HTTP server
                  </div>
                </div>
                <div className={`text-xs pt-2 border-t ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
                  <a
                    href="https://github.com/mknashi/tidycode/blob/main/LICENSES.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-500 hover:underline"
                  >
                    View full license details →
                  </a>
                </div>
              </div>
            </div>

            <div
              className={`flex items-center justify-between px-6 py-3 rounded-b-xl text-xs ${
                theme === 'dark'
                  ? 'bg-gray-900/80 border-t border-gray-800 text-gray-400'
                  : 'bg-gray-50 border-t border-gray-200 text-gray-600'
              }`}
            >
              <span>© {new Date().getFullYear()} {aboutInfo?.name || 'Tidy Code'}</span>
              <span className="uppercase tracking-wide text-indigo-400">Built for focus</span>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        contentType={helpContentType}
        theme={theme}
      />

      {/* AI Fix Diff Viewer Modal */}
      {aiFixState.showDiff && aiFixState.fixedContent && aiFixState.originalContent && (
        <DiffViewerModal
          original={aiFixState.originalContent}
          fixed={aiFixState.fixedContent}
          onAccept={handleAcceptFix}
          onReject={handleRejectFix}
          theme={theme}
        />
      )}

      {/* AI Settings Modal */}
      {showAISettings && (
        <AISettingsModal
          settings={aiSettings}
          onSave={handleSaveAISettings}
          onClose={() => setShowAISettings(false)}
          theme={theme}
          isDesktop={isDesktop()}
          desktopAIService={aiService}
          onTriggerSetupWizard={handleTriggerSetupWizard}
        />
      )}

      {/* Diff Viewer */}
      {showDiffViewer && (
        <DiffViewer
          theme={theme}
          fontSize={fontSize}
          onClose={() => {
            setShowDiffViewer(false);
            setDiffTabsData({ left: null, right: null });
          }}
          initialLeft={diffTabsData.left?.content || activeTab?.content || ''}
          initialLeftLabel={diffTabsData.left?.label || activeTab?.name || activeTab?.title || 'Current Tab'}
          initialRight={diffTabsData.right?.content || ''}
          initialRightLabel={diffTabsData.right?.label || 'Right'}
          availableTabs={tabs}
        />
      )}

      {/* Quick Open Modal (Ctrl/Cmd+P) */}
      {showQuickOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-start justify-center pt-32 z-50"
          onClick={closeQuickOpen}
        >
          <div
            className={`w-full max-w-2xl ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg shadow-2xl overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} p-4`}>
              <input
                type="text"
                value={quickOpenQuery}
                onChange={(e) => {
                  setQuickOpenQuery(e.target.value);
                  searchFiles(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    closeQuickOpen();
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setQuickOpenSelectedIndex(prev =>
                      Math.min(prev + 1, quickOpenResults.length - 1)
                    );
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setQuickOpenSelectedIndex(prev => Math.max(prev - 1, 0));
                  } else if (e.key === 'Enter' && quickOpenResults[quickOpenSelectedIndex]) {
                    e.preventDefault();
                    const selected = quickOpenResults[quickOpenSelectedIndex];
                    ensureTabForPath({ filePath: selected.path, displayName: selected.name });
                    closeQuickOpen();
                  }
                }}
                placeholder="Search files by name..."
                className={`w-full px-4 py-2 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'} border-none outline-none rounded text-lg`}
                autoFocus
              />
            </div>

            {/* Results List */}
            <div className="max-h-96 overflow-y-auto">
              {quickOpenResults.length === 0 && quickOpenQuery && (
                <div className={`p-8 text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  No files found matching "{quickOpenQuery}"
                </div>
              )}
              {quickOpenResults.length === 0 && !quickOpenQuery && (
                <div className={`p-8 text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p className="mb-2">Start typing to search files</p>
                  <p className="text-sm">Searches from: {fileSystemBrowserRootPath || 'current directory'}</p>
                </div>
              )}
              {quickOpenResults.map((file, index) => {
                const isSelected = index === quickOpenSelectedIndex;
                return (
                  <div
                    key={file.path}
                    className={`px-4 py-3 cursor-pointer border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-100'} ${
                      isSelected
                        ? theme === 'dark' ? 'bg-blue-600/30' : 'bg-blue-100'
                        : theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      ensureTabForPath({ filePath: file.path, displayName: file.name });
                      closeQuickOpen();
                    }}
                    onMouseEnter={() => setQuickOpenSelectedIndex(index)}
                  >
                    <div className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {file.name}
                    </div>
                    <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} truncate`}>
                      {file.directory}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className={`border-t ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'} px-4 py-2 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} flex items-center justify-between`}>
              <div className="flex items-center gap-4">
                <span>↑↓ Navigate</span>
                <span>↵ Open</span>
                <span>ESC Close</span>
              </div>
              <div>{quickOpenResults.length} results</div>
            </div>
          </div>
        </div>
      )}

      {/* Ollama Setup Wizard (Desktop Only) */}
      {showOllamaSetup && aiService && (
        <OllamaSetupWizard
          onClose={() => setShowOllamaSetup(false)}
          onComplete={() => {
            localStorage.setItem('tidycode-ollama-setup-completed', 'true');
            setShowOllamaSetup(false);
          }}
          theme={theme}
          desktopAIService={aiService}
          defaultModel={aiSettings.ollamaModel}
        />
      )}

      {/* PDF Viewer Modal */}
      {showPDFViewer && pdfViewerData && (
        <PDFViewer
          fileContent={pdfViewerData.content}
          fileName={pdfViewerData.fileName}
          filePath={pdfViewerData.filePath || pdfViewerData.absolutePath || ''}
          theme={theme}
          onClose={() => {
            setShowPDFViewer(false);
            setPDFViewerData(null);
          }}
        />
      )}

      {/* SVG Viewer Modal */}
      {showSVGViewer && svgViewerData && (
        <SVGViewer
          content={svgViewerData.content}
          fileName={svgViewerData.fileName}
          theme={theme}
          onClose={() => {
            setShowSVGViewer(false);
            setSVGViewerData(null);
          }}
          onEditAsText={() => {
            // Close viewer and open SVG as text in editor
            const content = svgViewerData.content;
            const fileName = svgViewerData.fileName;
            setShowSVGViewer(false);
            setSVGViewerData(null);

            // Create a new tab with the SVG content
            const newTabId = nextIdRef.current;
            nextIdRef.current += 1;

            const newTab = {
              id: newTabId,
              title: fileName,
              content: content,
              isModified: false,
              filePath: fileName,
              absolutePath: svgViewerData.filePath,
              wasmFileHandle: null,
              isWasmBacked: false
            };

            setTabs(prev => [...prev, newTab]);
            setActiveTabId(newTabId);
            requestEditorFocus(newTabId);
            setTimeout(() => scrollTabIntoView(newTabId), 0);
          }}
        />
      )}

      {/* Cookie Consent Banner - Only shown in web mode */}
      <CookieConsent theme={theme} />

    </div>
  );
};

export default TidyCode;
