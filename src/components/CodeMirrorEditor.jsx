import React, { useCallback, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { vim, Vim, getCM } from '@replit/codemirror-vim';

// Language imports
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { php } from '@codemirror/lang-php';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { StreamLanguage } from '@codemirror/language';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { toml } from '@codemirror/legacy-modes/mode/toml';

// Theme imports
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, drawSelection } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { highlightSelectionMatches, searchKeymap, SearchQuery } from '@codemirror/search';
import { StateField, StateEffect } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

// Completion imports
import { autocompletion, acceptCompletion, completionStatus, startCompletion } from '@codemirror/autocomplete';
import { createSmartCompletionSource } from '../utils/completions/completionSource';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';

// LSP imports
import { lspService } from '../services/LSPService';

// Clipboard extension for Tauri
import { clipboardExtension } from '../utils/codemirror/clipboardExtension';

// Font size mapping
const getFontSizePixels = (size) => {
  const sizeMap = {
    '2xs': '10px',
    'xs': '12px',
    'sm': '14px',
    'base': '16px'
  };
  return sizeMap[size] || '12px';
};

const getLineHeightValue = (size) => {
  const lineHeightMap = {
    '2xs': '1.375',  // tight
    'xs': '1.5',     // snug
    'sm': '1.625',   // normal
    'base': '1.75'   // relaxed
  };
  return lineHeightMap[size] || '1.5';
};

// Custom syntax highlighting for dark mode
const darkHighlighting = HighlightStyle.define([
  { tag: t.keyword, color: '#c678dd' }, // purple - keywords like if, const, function
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: '#e06c75' }, // red
  { tag: [t.function(t.variableName), t.labelName], color: '#61afef' }, // blue - function names
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#d19a66' }, // orange
  { tag: [t.definition(t.name), t.separator], color: '#abb2bf' }, // light gray
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#e5c07b' }, // yellow
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: '#56b6c2' }, // cyan
  { tag: [t.meta, t.comment], color: '#5c6370', fontStyle: 'italic' }, // gray comments
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: '#61afef', textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: '#e06c75' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#d19a66' }, // orange
  { tag: [t.processingInstruction, t.string, t.inserted], color: '#98c379' }, // green - strings
  { tag: t.invalid, color: '#ffffff', backgroundColor: '#e06c75' },
]);

// Custom syntax highlighting for light mode
const lightHighlighting = HighlightStyle.define([
  { tag: t.keyword, color: '#a626a4' }, // purple
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: '#e45649' }, // red
  { tag: [t.function(t.variableName), t.labelName], color: '#4078f2' }, // blue
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#c18401' }, // orange
  { tag: [t.definition(t.name), t.separator], color: '#383a42' }, // dark gray
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#986801' }, // brown
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: '#0184bc' }, // cyan
  { tag: [t.meta, t.comment], color: '#a0a1a7', fontStyle: 'italic' }, // gray
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: '#4078f2', textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: '#e45649' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#c18401' },
  { tag: [t.processingInstruction, t.string, t.inserted], color: '#50a14f' }, // green
  { tag: t.invalid, color: '#ffffff', backgroundColor: '#e45649' },
]);

const CodeMirrorEditor = forwardRef(({
  value,
  onChange,
  language = 'javascript',
  theme = 'light',
  fontSize = 'xs',
  vimEnabled = false,
  onVimModeChange,
  onCursorChange,
  readOnly = false,
  placeholder = '',
  className = '',
  style = {},
  aiSettings = null, // AI completion settings
  lspSettings = null, // LSP settings
  searchTerm = '', // Search term to highlight
  caseSensitive = false, // Case sensitivity for search
  onContextMenu = null, // Right-click handler for AI actions
  onSelectionChange = null, // Selection change handler for floating toolbar
}, ref) => {
  const editorRef = useRef(null);
  const vimModeRef = useRef('normal');
  const viewRef = useRef(null);
  const [viewReady, setViewReady] = React.useState(false);

  // Stable refs for callbacks used inside extensions (avoids rebuilding extensions on every render)
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onContextMenuRef = useRef(onContextMenu);
  onContextMenuRef.current = onContextMenu;

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (viewRef.current) {
        viewRef.current.focus();
      }
    },
    getView: () => viewRef.current,
    setSelection: (from, to) => {
      if (viewRef.current) {
        viewRef.current.dispatch({
          selection: { anchor: from, head: to || from }
        });
      }
    },
    getValue: () => {
      if (viewRef.current) {
        return viewRef.current.state.doc.toString();
      }
      return value;
    }
  }));

  // Map language names to CodeMirror language extensions
  const getLanguageExtension = useCallback((lang) => {
    const langMap = {
      'javascript': javascript({ jsx: true }),
      'typescript': javascript({ jsx: true, typescript: true }),
      'jsx': javascript({ jsx: true }),
      'tsx': javascript({ jsx: true, typescript: true }),
      'python': python(),
      'java': java(),
      'cpp': cpp(),
      'c': cpp(),
      'rust': rust(),
      'php': php(),
      'sql': sql(),
      'xml': xml(),
      'html': html(),
      'css': css(),
      'json': json(),
      'markdown': markdown(),
      'markup': html(), // For XML/HTML
      'yaml': StreamLanguage.define(yaml),
      'yml': StreamLanguage.define(yaml),
      'toml': StreamLanguage.define(toml),
      'config': StreamLanguage.define(toml), // Default for config files
    };
    return langMap[lang] || javascript();
  }, []);

  // Build extensions array
  const extensions = useCallback(() => {
    const exts = [];

    // Add vim mode if enabled
    if (vimEnabled) {
      exts.push(vim());
    }

    // Add language support
    exts.push(getLanguageExtension(language));

    // Add syntax highlighting based on theme
    if (theme === 'dark') {
      exts.push(syntaxHighlighting(darkHighlighting));
    } else {
      exts.push(syntaxHighlighting(lightHighlighting));
    }

    // Add line wrapping
    exts.push(EditorView.lineWrapping);

    // Explicitly add drawSelection extension
    exts.push(drawSelection());


    // Add monospace font for all themes
    exts.push(EditorView.theme({
      '&': {
        height: '100%',
        overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      },
      '.cm-scroller': {
        overflow: 'auto'
      },
      '.cm-content': {
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      },
      '.cm-gutters': {
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      }
    }));

    // Add font size theme
    const fontSizeValue = getFontSizePixels(fontSize);
    const lineHeightValue = getLineHeightValue(fontSize);
    exts.push(EditorView.theme({
      '&': {
        fontSize: fontSizeValue,
        lineHeight: lineHeightValue,
      },
      '.cm-content': {
        fontSize: fontSizeValue,
        lineHeight: lineHeightValue,
      },
      '.cm-gutters': {
        fontSize: fontSizeValue,
        lineHeight: lineHeightValue,
      },
      '.cm-line': {
        lineHeight: lineHeightValue,
      }
    }));

    // Add cursor position and selection tracking
    // Uses refs for onSelectionChange to avoid rebuilding extensions on callback changes
    exts.push(EditorView.updateListener.of((update) => {
      if (update.selectionSet) {
        const sel = update.state.selection.main;
        onCursorChange?.(sel.head);
        const selCb = onSelectionChangeRef.current;
        if (selCb) {
          if (!sel.empty) {
            const coords = update.view.coordsAtPos(sel.from);
            const endCoords = update.view.coordsAtPos(sel.to);
            selCb({
              text: update.state.sliceDoc(sel.from, sel.to),
              from: sel.from,
              to: sel.to,
              coords: coords ? { top: coords.top, left: coords.left, bottom: endCoords?.bottom || coords.bottom } : null,
            });
          } else {
            selCb(null);
          }
        }
      }
    }));

    // Add DOM-level event handlers with highest precedence
    exts.push(Prec.highest(EditorView.domEventHandlers({
      keydown: (event, view) => {
        // Handle Tab for completion
        if (event.key === 'Tab') {
          const status = completionStatus(view.state);
          if (status === 'active') {
            event.preventDefault();
            event.stopPropagation();
            acceptCompletion(view);
            return true;
          }
        }
        return false;
      },
      contextmenu: (event, view) => {
        const ctxCb = onContextMenuRef.current;
        if (ctxCb) {
          const sel = view.state.selection.main;
          const selectedText = sel.empty ? '' : view.state.sliceDoc(sel.from, sel.to);
          ctxCb({
            x: event.clientX,
            y: event.clientY,
            selectedText,
            selectionRange: sel.empty ? null : { from: sel.from, to: sel.to },
          });
          event.preventDefault();
          return true;
        }
        return false;
      },
    })));


    // Add error boundary extension to catch IndexSizeError from DOM range operations
    // This handles a known CodeMirror issue when clicking at end of wrapped lines
    exts.push(EditorView.exceptionSink.of((exception) => {
      if (exception instanceof DOMException && exception.name === 'IndexSizeError') {
        console.warn('[CodeMirror] Caught and suppressed IndexSizeError during DOM measurement');
        // Suppress the error - CodeMirror will recover on next update
        return true;
      }
      // Let other errors propagate
      return false;
    }));

    // Add custom completion source with language-specific keywords and snippets
    // Pass AI settings to enable AI-powered completions
    exts.push(autocompletion({
      override: [createSmartCompletionSource(language, aiSettings)],
      activateOnTyping: true,
      maxRenderedOptions: 10,
      closeOnBlur: true,
      defaultKeymap: true, // Enable default keymap for arrow keys, Enter, Escape
      interactionDelay: 75,
      aboveCursor: false,
    }));

    // Add Ctrl-Space to trigger completion manually
    exts.push(keymap.of([
      {
        key: 'Ctrl-Space',
        run: startCompletion
      }
    ]));

    // Add Tab indentation (lower priority, runs when completion doesn't handle it)
    exts.push(keymap.of([indentWithTab]));

    // Initialize LSP if enabled
    if (lspSettings?.enableLSP) {
      lspService.initialize(lspSettings);

      // LSP extensions will be added here when LSP client is fully implemented
      // For now, just log that LSP is enabled
      console.log('[CodeMirrorEditor] LSP enabled for language:', language);

      // Check if language is supported
      if (lspService.isLanguageSupported(language)) {
        console.log('[CodeMirrorEditor] LSP support available for', language);
        // Future: Add LSP extensions here
        // const lspExts = lspService.getLSPExtensions(language, documentUri, view);
        // lspExts.forEach(ext => exts.push(ext));
      } else {
        console.log('[CodeMirrorEditor] LSP not supported for', language);
      }
    }

    // Add search highlighting if searchTerm is provided
    if (searchTerm) {
      const searchHighlightMark = Decoration.mark({
        class: 'cm-searchMatch'
      });

      const searchHighlightField = StateField.define({
        create() {
          return Decoration.none;
        },
        update(decorations, tr) {
          const doc = tr.state.doc;
          const docLength = doc.length;
          const text = doc.toString();
          const searchLower = caseSensitive ? searchTerm : searchTerm.toLowerCase();
          const textToSearch = caseSensitive ? text : text.toLowerCase();

          const newDecorations = [];
          let pos = 0;

          while (true) {
            const index = textToSearch.indexOf(searchLower, pos);
            if (index === -1) break;

            // Validate decoration range to prevent "No tile at position" errors
            const rangeStart = index;
            const rangeEnd = index + searchTerm.length;

            // Ensure range is within document bounds and properly ordered
            if (rangeStart >= 0 && rangeEnd <= docLength && rangeStart < rangeEnd) {
              try {
                newDecorations.push(searchHighlightMark.range(rangeStart, rangeEnd));
              } catch (error) {
                console.warn(`[CodeMirror] Failed to create decoration at ${rangeStart}-${rangeEnd}:`, error);
              }
            }

            pos = index + searchTerm.length;
          }

          return Decoration.set(newDecorations, true);
        },
        provide: f => EditorView.decorations.from(f)
      });

      const searchHighlightTheme = EditorView.theme({
        '.cm-searchMatch': {
          backgroundColor: theme === 'dark' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(253, 224, 71, 0.5)',
          outline: theme === 'dark' ? '1px solid rgba(234, 179, 8, 0.5)' : '1px solid rgba(202, 138, 4, 0.5)',
        }
      });

      exts.push(searchHighlightField);
      exts.push(searchHighlightTheme);
    }

    // Add clipboard extension for Tauri (prevents permission prompts in desktop mode)
    exts.push(clipboardExtension());

    return exts;
  }, [vimEnabled, language, getLanguageExtension, onCursorChange, theme, fontSize, aiSettings, lspSettings, searchTerm, caseSensitive]);

  // Prevent browser from intercepting VIM Ctrl keys (MUST use capture phase)
  useEffect(() => {
    if (!vimEnabled || !viewRef.current) return;

    const editorElement = viewRef.current.dom;
    if (!editorElement) return;

    const handleKeyDown = (event) => {
      // Only handle Ctrl keys (not Cmd on Mac, not Alt, not Shift)
      if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
        const key = event.key.toLowerCase();
        const vimCtrlKeys = ['f', 'b', 'd', 'u', 'e', 'y', 'w', 'n', 'p', 'g', 'o', 'i', 'r', 'v', 'h', 'j', 'k', 'l', '[', ']'];

        if (vimCtrlKeys.includes(key)) {
          event.preventDefault();
          event.stopPropagation();

          // Forward the key to VIM using the Vim API
          try {
            const cm = getCM(viewRef.current);
            if (cm && cm.state && cm.state.vim) {
              // Use Vim.handleKey to process the key
              Vim.handleKey(cm, '<C-' + key + '>');
            }
          } catch (e) {
            // Silently handle errors - VIM might not be fully initialized
            console.debug('[VIM] Failed to forward key to VIM:', e);
          }

          return;
        }
      }
    };

    // Use capture phase to intercept BEFORE browser handles it
    editorElement.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      editorElement.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [vimEnabled, viewReady]); // Re-run when editor view becomes ready

  // Handle VIM mode changes
  useEffect(() => {
    if (!vimEnabled || !viewRef.current) return;

    // Listen for mode changes
    const checkMode = () => {
      try {
        const cm = getCM(viewRef.current);
        if (!cm || !cm.state || !cm.state.vim) return;

        const mode = cm.state.vim.mode || 'normal';
        if (mode !== vimModeRef.current) {
          vimModeRef.current = mode;
          if (onVimModeChange) {
            onVimModeChange(mode);
          }
        }
      } catch (e) {
        // Silently handle errors during mode checking
        console.debug('VIM mode check error:', e);
      }
    };

    // Check mode periodically (VIM doesn't provide direct mode change events)
    const interval = setInterval(checkMode, 100);

    return () => clearInterval(interval);
  }, [vimEnabled, onVimModeChange]);

  // Custom theme based on dark/light mode
  const customTheme = theme === 'dark'
    ? EditorView.theme({
        '&': {
          backgroundColor: '#111827', // bg-gray-900
          color: '#e5e7eb', // text-gray-200
        },
        '.cm-content': {
          caretColor: '#e5e7eb',
        },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: '#e5e7eb',
        },
        '.cm-activeLine': {
          backgroundColor: '#374151', // Light gray for active line in dark mode
        },
        '.cm-activeLineGutter': {
          backgroundColor: '#374151', // Match active line
        },
        '.cm-gutters': {
          backgroundColor: '#1f2937', // bg-gray-800
          color: '#9ca3af', // text-gray-400
          border: 'none',
        },
        // Selection styling - teal background with enhanced 3D depth effect for dark mode
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
          background: 'rgba(95, 232, 200, 0.35) !important',
          boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.35), inset 0 3px 0 rgba(255,255,255,0.12), inset 0 0 0 1px rgba(95, 232, 200, 0.15) !important',
        },
        '.cm-selectionLayer .cm-selectionBackground': {
          background: 'rgba(95, 232, 200, 0.35) !important',
          boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.35), inset 0 3px 0 rgba(255,255,255,0.12), inset 0 0 0 1px rgba(95, 232, 200, 0.15) !important',
        },
        // Selection match highlighting - teal at 34%
        '.cm-selectionMatch': {
          backgroundColor: 'rgba(95, 232, 200, 0.34) !important',
        },
      }, { dark: true })
    : EditorView.theme({
        '&': {
          backgroundColor: '#ffffff',
          color: '#24292e',
        },
        '.cm-content': {
          caretColor: '#24292e',
        },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: '#24292e',
        },
        '.cm-activeLine': {
          backgroundColor: '#e5e7eb', // Light gray (bg-gray-200) for active line in light mode
        },
        '.cm-activeLineGutter': {
          backgroundColor: '#e5e7eb', // Match active line
        },
        '.cm-gutters': {
          backgroundColor: '#f6f8fa',
          color: '#6e7781',
          border: 'none',
        },
        // Selection styling - light blue for light mode
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: '#add6ff !important',
        },
        '.cm-selectionLayer .cm-selectionBackground': {
          backgroundColor: '#add6ff !important',
        },
      });

  return (
    <div className={`codemirror-wrapper ${className}`} style={{ height: '100%', width: '100%', overflow: 'hidden', ...style }}>
      <style>{`
        /* AI completion styling */
        .codemirror-wrapper .cm-completionIcon-ai::after {
          content: "✨";
          font-size: 14px;
        }
        .codemirror-wrapper .cm-completionLabel[aria-selected] .cm-completionIcon-ai::after {
          filter: brightness(1.2);
        }
        .codemirror-wrapper .cm-tooltip-autocomplete ul li[aria-selected] {
          background-color: ${theme === 'dark' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(59, 130, 246, 0.2)'} !important;
        }
      `}</style>
      <CodeMirror
        ref={(r) => {
          editorRef.current = r;
          if (r && r.view) {
            viewRef.current = r.view;
            setViewReady(true);
          } else {
            setViewReady(false);
          }
        }}
        value={typeof value === 'string' ? value : String(value || '')}
        height="100%"
        width="100%"
        extensions={extensions()}
        onChange={onChange}
        theme={customTheme}
        readOnly={readOnly}
        placeholder={placeholder}
        style={{
          height: '100%',
          overflow: 'auto'
        }}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightSpecialChars: true,
          history: true,
          foldGutter: true,
          drawSelection: false, // We add it manually in extensions with custom styling
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          syntaxHighlighting: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false, // Disabled - using custom completion in extensions
          rectangularSelection: true,
          crosshairCursor: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          defaultKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
        }}
      />
    </div>
  );
});

CodeMirrorEditor.displayName = 'CodeMirrorEditor';

export default CodeMirrorEditor;
