import React, { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import { List, useListRef } from 'react-window';

// Font size mapping (matching CodeMirrorEditor)
const getFontSizePixels = (size) => {
  const sizeMap = {
    '2xs': 10,
    'xs': 12,
    'sm': 14,
    'base': 16
  };
  return sizeMap[size] || 12;
};

const getLineHeight = (fontSize) => {
  // Line height ~1.5x font size for readability
  return Math.round(fontSize * 1.5);
};

// Row component for react-window v2 (receives index, style, ariaAttributes, and rowProps spread)
const RowComponent = React.memo(({
  index,
  style,
  // rowProps are spread directly onto the component
  lines,
  theme,
  fontSize,
  searchMatches,
  currentMatchIndex,
  onLineClick,
  gutterWidth,
  lineHeight
}) => {
  const rowIndex = index;
  const line = lines?.[rowIndex] || '';
  const lineNumber = rowIndex + 1;
  const isDark = theme === 'dark';

  // Check if this line has search matches
  const lineMatches = searchMatches?.filter(m => m.lineIndex === rowIndex) || [];
  const isCurrentMatch = lineMatches.some((m) =>
    searchMatches.indexOf(m) === currentMatchIndex
  );

  // Render line with search highlighting
  const renderLineContent = () => {
    if (lineMatches.length === 0) {
      return <span>{line || ' '}</span>;
    }

    // Sort matches by column position
    const sortedMatches = [...lineMatches].sort((a, b) => a.colStart - b.colStart);
    const segments = [];
    let lastEnd = 0;

    sortedMatches.forEach((match, i) => {
      // Text before match
      if (match.colStart > lastEnd) {
        segments.push(
          <span key={`pre-${i}`}>{line.slice(lastEnd, match.colStart)}</span>
        );
      }
      // Matched text
      const isThisCurrentMatch = searchMatches.indexOf(match) === currentMatchIndex;
      segments.push(
        <span
          key={`match-${i}`}
          style={{
            backgroundColor: isThisCurrentMatch
              ? (isDark ? 'rgba(251, 191, 36, 0.5)' : 'rgba(251, 191, 36, 0.7)')
              : (isDark ? 'rgba(234, 179, 8, 0.3)' : 'rgba(253, 224, 71, 0.5)'),
            outline: isDark ? '1px solid rgba(234, 179, 8, 0.5)' : '1px solid rgba(202, 138, 4, 0.5)',
            borderRadius: '2px'
          }}
        >
          {line.slice(match.colStart, match.colEnd)}
        </span>
      );
      lastEnd = match.colEnd;
    });

    // Remaining text after last match
    if (lastEnd < line.length) {
      segments.push(<span key="post">{line.slice(lastEnd)}</span>);
    }

    return segments;
  };

  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'stretch',
        backgroundColor: isCurrentMatch
          ? (isDark ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.2)')
          : 'transparent'
      }}
      onClick={() => onLineClick?.(rowIndex)}
    >
      {/* Line number gutter */}
      <div
        style={{
          width: gutterWidth,
          minWidth: gutterWidth,
          paddingRight: '8px',
          paddingLeft: '8px',
          textAlign: 'right',
          color: isDark ? '#6b7280' : '#9ca3af',
          backgroundColor: isDark ? '#1f2937' : '#f6f8fa',
          fontSize: `${fontSize}px`,
          lineHeight: `${lineHeight}px`,
          userSelect: 'none',
          borderRight: isDark ? '1px solid #374151' : '1px solid #e5e7eb'
        }}
      >
        {lineNumber}
      </div>
      {/* Line content */}
      <div
        style={{
          flex: 1,
          paddingLeft: '8px',
          whiteSpace: 'pre',
          overflow: 'hidden',
          fontSize: `${fontSize}px`,
          lineHeight: `${lineHeight}px`,
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          color: isDark ? '#e5e7eb' : '#24292e'
        }}
      >
        {renderLineContent()}
      </div>
    </div>
  );
});

RowComponent.displayName = 'RowComponent';

/**
 * VirtualEditor - A lightweight, virtualized text editor for large files
 *
 * Uses react-window for efficient rendering of large documents.
 * Supports: editing, search, formatting, saving
 * Does NOT support: syntax highlighting (by design for large files)
 */
const VirtualEditor = forwardRef(({
  value = '',
  onChange,
  theme = 'light',
  fontSize = 'xs',
  readOnly = false,
  className = '',
  style = {},
  searchTerm = '',
  caseSensitive = false,
  onSearchResults,
  onCursorChange
}, ref) => {
  const containerRef = useRef(null);
  const listRef = useListRef();
  const textareaRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(500);
  const [isEditing, setIsEditing] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState(null);
  const [cursorPosition, setCursorPosition] = useState({ line: 0, col: 0 });
  const [searchMatches, setSearchMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchWorkerRef = useRef(null);

  // Parse content into lines
  const lines = useMemo(() => {
    return (value || '').split('\n');
  }, [value]);

  // Calculate dimensions
  const fontSizePx = getFontSizePixels(fontSize);
  const lineHeight = getLineHeight(fontSizePx);
  const gutterWidth = Math.max(40, `${lines.length}`.length * 10 + 16);

  // Resize observer for container
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Search functionality using Web Worker
  useEffect(() => {
    // Create inline worker for search
    const workerCode = `
      self.onmessage = function(e) {
        const { content, searchTerm, caseSensitive, id } = e.data;

        if (!searchTerm || !content) {
          self.postMessage({ matches: [], id });
          return;
        }

        const matches = [];
        const lines = content.split('\\n');
        const searchStr = caseSensitive ? searchTerm : searchTerm.toLowerCase();

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex];
          const searchLine = caseSensitive ? line : line.toLowerCase();
          let colStart = 0;

          while (true) {
            const foundIndex = searchLine.indexOf(searchStr, colStart);
            if (foundIndex === -1) break;

            matches.push({
              lineIndex,
              colStart: foundIndex,
              colEnd: foundIndex + searchTerm.length,
              text: line.slice(foundIndex, foundIndex + searchTerm.length)
            });

            colStart = foundIndex + 1;

            // Limit matches to prevent memory issues
            if (matches.length >= 10000) {
              self.postMessage({ matches, id, truncated: true });
              return;
            }
          }
        }

        self.postMessage({ matches, id });
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    searchWorkerRef.current = new Worker(workerUrl);

    return () => {
      if (searchWorkerRef.current) {
        searchWorkerRef.current.terminate();
      }
      URL.revokeObjectURL(workerUrl);
    };
  }, []);

  // Perform search when searchTerm changes
  useEffect(() => {
    if (!searchWorkerRef.current) return;

    const searchId = Date.now();

    searchWorkerRef.current.onmessage = (e) => {
      if (e.data.id === searchId) {
        setSearchMatches(e.data.matches);
        setCurrentMatchIndex(0);
        onSearchResults?.(e.data.matches.length, e.data.truncated);
      }
    };

    searchWorkerRef.current.postMessage({
      content: value,
      searchTerm,
      caseSensitive,
      id: searchId
    });
  }, [value, searchTerm, caseSensitive, onSearchResults]);

  // Scroll to row helper
  const scrollToRow = useCallback((rowIndex) => {
    listRef.current?.scrollTo({ index: rowIndex, align: 'center' });
  }, [listRef]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      containerRef.current?.focus();
    },
    getValue: () => value,
    scrollToLine: (lineIndex) => {
      scrollToRow(lineIndex);
    },
    nextMatch: () => {
      if (searchMatches.length === 0) return;
      const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
      setCurrentMatchIndex(nextIndex);
      const match = searchMatches[nextIndex];
      if (match) {
        scrollToRow(match.lineIndex);
      }
      return nextIndex + 1; // 1-indexed for display
    },
    prevMatch: () => {
      if (searchMatches.length === 0) return;
      const prevIndex = currentMatchIndex === 0
        ? searchMatches.length - 1
        : currentMatchIndex - 1;
      setCurrentMatchIndex(prevIndex);
      const match = searchMatches[prevIndex];
      if (match) {
        scrollToRow(match.lineIndex);
      }
      return prevIndex + 1; // 1-indexed for display
    },
    getCurrentMatchIndex: () => currentMatchIndex + 1,
    getTotalMatches: () => searchMatches.length,
    getSearchMatches: () => searchMatches,
    // Edit operations
    insertText: (text, position) => {
      if (readOnly) return;
      const pos = position || cursorPosition;
      const linesBefore = lines.slice(0, pos.line);
      const linesAfter = lines.slice(pos.line + 1);
      const currentLine = lines[pos.line] || '';
      const newLine = currentLine.slice(0, pos.col) + text + currentLine.slice(pos.col);
      const newContent = [...linesBefore, newLine, ...linesAfter].join('\n');
      onChange?.(newContent);
    },
    replaceAll: (searchStr, replaceStr) => {
      if (readOnly) return;
      const flags = caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      const newContent = value.replace(regex, replaceStr);
      onChange?.(newContent);
      return (value.match(regex) || []).length;
    }
  }));

  // Handle line click for editing
  const handleLineClick = useCallback((lineIndex) => {
    if (readOnly) return;
    setEditingLineIndex(lineIndex);
    setIsEditing(true);
    setCursorPosition({ line: lineIndex, col: 0 });
    onCursorChange?.(lineIndex, 0);
  }, [readOnly, onCursorChange]);

  // Handle textarea change during editing
  const handleTextareaChange = useCallback((e) => {
    if (readOnly) return;
    const newValue = e.target.value;
    onChange?.(newValue);
  }, [onChange, readOnly]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    // Cmd/Ctrl+F - let parent handle search
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      return;
    }

    // Cmd/Ctrl+G - next match
    if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey) {
      e.preventDefault();
      if (searchMatches.length > 0) {
        const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
        setCurrentMatchIndex(nextIndex);
        const match = searchMatches[nextIndex];
        if (match) {
          scrollToRow(match.lineIndex);
        }
      }
      return;
    }

    // Cmd/Ctrl+Shift+G - prev match
    if ((e.metaKey || e.ctrlKey) && e.key === 'g' && e.shiftKey) {
      e.preventDefault();
      if (searchMatches.length > 0) {
        const prevIndex = currentMatchIndex === 0
          ? searchMatches.length - 1
          : currentMatchIndex - 1;
        setCurrentMatchIndex(prevIndex);
        const match = searchMatches[prevIndex];
        if (match) {
          scrollToRow(match.lineIndex);
        }
      }
      return;
    }

    // Escape - exit editing mode
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditingLineIndex(null);
      containerRef.current?.focus();
    }
  }, [searchMatches, currentMatchIndex, scrollToRow]);

  const isDark = theme === 'dark';

  // Row props for react-window v2
  const rowProps = useMemo(() => ({
    lines,
    theme,
    fontSize: fontSizePx,
    searchMatches,
    currentMatchIndex,
    onLineClick: handleLineClick,
    gutterWidth,
    lineHeight
  }), [lines, theme, fontSizePx, searchMatches, currentMatchIndex, handleLineClick, gutterWidth, lineHeight]);

  return (
    <div
      ref={containerRef}
      className={`virtual-editor ${className}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: isDark ? '#111827' : '#ffffff',
        color: isDark ? '#e5e7eb' : '#24292e',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: `${fontSizePx}px`,
        position: 'relative',
        outline: 'none',
        ...style
      }}
    >
      {/* Virtual scrolling list */}
      <List
        listRef={listRef}
        defaultHeight={containerHeight}
        rowCount={lines.length}
        rowHeight={lineHeight}
        rowComponent={RowComponent}
        rowProps={rowProps}
        overscanCount={20}
        style={{
          outline: 'none'
        }}
      />

      {/* Hidden textarea for full-file editing (activated on double-click or edit mode) */}
      {isEditing && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: isDark ? '#111827' : '#ffffff',
            zIndex: 10
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              setIsEditing(false);
              setEditingLineIndex(null);
            }}
            autoFocus
            style={{
              width: '100%',
              height: '100%',
              resize: 'none',
              border: 'none',
              outline: 'none',
              padding: '8px',
              paddingLeft: `${gutterWidth + 8}px`,
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
              fontSize: `${fontSizePx}px`,
              lineHeight: `${lineHeight}px`,
              backgroundColor: isDark ? '#111827' : '#ffffff',
              color: isDark ? '#e5e7eb' : '#24292e',
              whiteSpace: 'pre',
              overflowWrap: 'normal'
            }}
            spellCheck={false}
          />
        </div>
      )}

      {/* Info bar showing line count and search status */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          padding: '4px 8px',
          backgroundColor: isDark ? 'rgba(31, 41, 55, 0.9)' : 'rgba(246, 248, 250, 0.9)',
          borderTopLeftRadius: '4px',
          fontSize: '11px',
          color: isDark ? '#9ca3af' : '#6b7280',
          zIndex: 5
        }}
      >
        {lines.length.toLocaleString()} lines
        {searchMatches.length > 0 && (
          <span style={{ marginLeft: '8px' }}>
            {currentMatchIndex + 1}/{searchMatches.length} matches
          </span>
        )}
      </div>
    </div>
  );
});

VirtualEditor.displayName = 'VirtualEditor';

export default VirtualEditor;
