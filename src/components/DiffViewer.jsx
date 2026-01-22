import React, { useState, useRef, useEffect } from 'react';
import {
  X, FileText, Copy, Download, ArrowLeft, ArrowRight,
  Upload, Check, RotateCcw, Trash2,
  ChevronUp, ChevronDown, Search, CheckCircle
} from 'lucide-react';
import * as Diff from 'diff';

// Font size utility
const getFontSizeClass = (size) => {
  const sizeMap = {
    '2xs': 'text-[10px]',
    'xs': 'text-xs',
    'sm': 'text-sm',
    'base': 'text-base'
  };
  return sizeMap[size] || 'text-xs';
};

const getLineSpacing = (size) => {
  const spacingMap = {
    '2xs': 'py-0',
    'xs': 'py-0.5',
    'sm': 'py-1',
    'base': 'py-1.5'
  };
  return spacingMap[size] || 'py-0.5';
};

// Character-level diff for inline comparison
function computeCharDiff(text1, text2) {
  if (!text1 && !text2) return [];
  if (!text1) return [{ type: 'added', value: text2 }];
  if (!text2) return [{ type: 'deleted', value: text1 }];

  const parts = [];
  let i = 0, j = 0;

  // Find common prefix
  while (i < text1.length && j < text2.length && text1[i] === text2[j]) {
    i++;
    j++;
  }

  if (i > 0) {
    parts.push({ type: 'equal', value: text1.substring(0, i) });
  }

  // Find common suffix
  let i2 = text1.length - 1;
  let j2 = text2.length - 1;

  while (i2 >= i && j2 >= j && text1[i2] === text2[j2]) {
    i2--;
    j2--;
  }

  // Add different parts
  if (i <= i2) {
    parts.push({ type: 'deleted', value: text1.substring(i, i2 + 1) });
  }

  if (j <= j2) {
    parts.push({ type: 'added', value: text2.substring(j, j2 + 1) });
  }

  // Add common suffix
  if (i2 < text1.length - 1) {
    parts.push({ type: 'equal', value: text1.substring(i2 + 1) });
  }

  return parts;
}

// Proper Myers diff algorithm using the 'diff' library
function computeDiff(text1, text2) {
  // Use the diff library for accurate line-by-line comparison
  const changes = Diff.diffLines(text1, text2);

  const result = [];
  let leftLineNum = 1;
  let rightLineNum = 1;

  changes.forEach(change => {
    const lines = change.value.split('\n');
    // Remove last empty line if the value ends with \n
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }

    lines.forEach(line => {
      if (change.added) {
        // Line added on the right
        result.push({
          type: 'added',
          left: null,
          right: line,
          leftLine: null,
          rightLine: rightLineNum++
        });
      } else if (change.removed) {
        // Line removed from the left
        result.push({
          type: 'deleted',
          left: line,
          right: null,
          leftLine: leftLineNum++,
          rightLine: null
        });
      } else {
        // Unchanged line
        result.push({
          type: 'equal',
          left: line,
          right: line,
          leftLine: leftLineNum++,
          rightLine: rightLineNum++
        });
      }
    });
  });

  // Post-process to detect modified lines (deleted + added adjacent pairs)
  const processed = [];
  let i = 0;
  while (i < result.length) {
    const current = result[i];
    const next = result[i + 1];

    // If we have a deleted line followed by an added line, treat as modified
    if (current && next &&
        current.type === 'deleted' && next.type === 'added' &&
        current.left && next.right) {
      const charDiff = computeCharDiff(current.left, next.right);
      processed.push({
        type: 'modified',
        left: current.left,
        right: next.right,
        leftLine: current.leftLine,
        rightLine: next.rightLine,
        charDiff: charDiff
      });
      i += 2; // Skip both the deleted and added
    } else {
      processed.push(current);
      i++;
    }
  }

  return processed;
}

const DiffViewer = ({ theme, fontSize = 'xs', onClose, initialLeft = '', initialRight = '', initialLeftLabel = 'Left', initialRightLabel = 'Right', availableTabs = [] }) => {
  // Font size classes
  const fontSizeClass = getFontSizeClass(fontSize);
  const lineSpacingClass = getLineSpacing(fontSize);

  const [leftText, setLeftText] = useState(initialLeft);
  const [rightText, setRightText] = useState(initialRight);
  const [leftLabel, setLeftLabel] = useState(initialLeftLabel);
  const [rightLabel, setRightLabel] = useState(initialRightLabel);
  const [selectedLeftTabId, setSelectedLeftTabId] = useState(() => {
    // Find the tab that matches the initial left content
    const matchingTab = availableTabs.find(t =>
      (t.name === initialLeftLabel || t.title === initialLeftLabel) &&
      (t.content || '') === initialLeft
    );
    return matchingTab ? matchingTab.id : '';
  });
  const [selectedRightTabId, setSelectedRightTabId] = useState(() => {
    // Find the tab that matches the initial right content
    const matchingTab = availableTabs.find(t =>
      (t.name === initialRightLabel || t.title === initialRightLabel) &&
      (t.content || '') === initialRight
    );
    return matchingTab ? matchingTab.id : '';
  });
  const [diff, setDiff] = useState([]);
  const [mergedText, setMergedText] = useState('');
  const [showMerged, setShowMerged] = useState(false);
  const [showTextInput, setShowTextInput] = useState({ left: false, right: false });
  const [textInput, setTextInput] = useState({ left: '', right: '' });
  const [showInlineDiff, setShowInlineDiff] = useState(true); // Toggle for character-level diff
  const [currentChangeIndex, setCurrentChangeIndex] = useState(-1); // Track current change for navigation
  const [searchQuery, setSearchQuery] = useState(''); // Search query
  const [searchResults, setSearchResults] = useState([]); // Matching line indices
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1); // Current search result
  const [showSearch, setShowSearch] = useState(false); // Toggle search bar
  const [showHelp, setShowHelp] = useState(false); // Toggle keyboard shortcuts help
  const [mergeSelections, setMergeSelections] = useState(new Map()); // Track which side was selected for each line
  const [previewHeight, setPreviewHeight] = useState(200); // Height of merged preview panel
  const [isResizing, setIsResizing] = useState(false);
  const [mergeHistory, setMergeHistory] = useState([]); // History for undo
  const [historyIndex, setHistoryIndex] = useState(-1); // Current position in history
  const [leftPanelWidth, setLeftPanelWidth] = useState(50); // Percentage width for left panel
  const [isResizingPanels, setIsResizingPanels] = useState(false); // Track if we're resizing the panels
  const leftFileInputRef = useRef(null);
  const rightFileInputRef = useRef(null);
  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);
  const mergedScrollRef = useRef(null);
  const lineRefs = useRef([]); // Refs for scrolling to specific lines
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const containerRef = useRef(null);

  // Compute diff whenever text changes
  useEffect(() => {
    if (leftText || rightText) {
      const computed = computeDiff(leftText, rightText);
      setDiff(computed);

      // Initialize merged text with left side
      setMergedText(leftText);
    }
  }, [leftText, rightText]);

  // Perform search when query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results = diff
      .map((line, index) => {
        const leftMatch = line.left && line.left.toLowerCase().includes(query);
        const rightMatch = line.right && line.right.toLowerCase().includes(query);
        return (leftMatch || rightMatch) ? index : -1;
      })
      .filter(index => index !== -1);

    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);

    // Scroll to first result
    if (results.length > 0) {
      scrollToLine(results[0]);
    }
  }, [searchQuery, diff]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd+F - Toggle search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }

      // Escape - Close help, search, or diff viewer
      if (e.key === 'Escape') {
        if (showHelp) {
          setShowHelp(false);
        } else if (showSearch) {
          setShowSearch(false);
          setSearchQuery('');
        } else {
          onClose();
        }
      }

      // ? - Show keyboard shortcuts help
      if (e.key === '?' && !showSearch) {
        e.preventDefault();
        setShowHelp(prev => !prev);
      }

      // Alt+↑ - Previous change
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        goToPreviousChange();
      }

      // Alt+↓ - Next change
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        goToNextChange();
      }

      // Enter - Next search result (when search is active)
      if (e.key === 'Enter' && showSearch && searchResults.length > 0) {
        e.preventDefault();
        if (e.shiftKey) {
          goToPreviousSearchResult();
        } else {
          goToNextSearchResult();
        }
      }

      // Ctrl+Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && !showMerged) {
        e.preventDefault();
        undo();
      }

      // Ctrl+Y or Ctrl+Shift+Z - Redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') && !showMerged) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, searchResults, searchQuery, currentChangeIndex, historyIndex, mergeHistory]);

  // Resize handlers for merged preview panel
  const handleResizeStart = (e) => {
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = previewHeight;
    e.preventDefault();
  };

  // Resize handlers for left/right panels
  const handlePanelResizeStart = (e) => {
    setIsResizingPanels(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = leftPanelWidth;
    e.preventDefault();
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const deltaY = resizeStartY.current - e.clientY; // Inverted because we're resizing from top
      const newHeight = Math.max(100, Math.min(600, resizeStartHeight.current + deltaY));
      setPreviewHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Handle panel resizing
  useEffect(() => {
    if (!isResizingPanels) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const deltaX = e.clientX - resizeStartX.current;
      const deltaPercent = (deltaX / containerWidth) * 100;
      const newWidth = Math.max(20, Math.min(80, resizeStartWidth.current + deltaPercent));
      setLeftPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingPanels(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanels]);

  // Synchronized scrolling
  const handleScroll = (source) => (e) => {
    const scrollTop = e.target.scrollTop;

    if (source === 'left') {
      if (rightScrollRef.current) {
        rightScrollRef.current.scrollTop = scrollTop;
      }
      if (mergedScrollRef.current) {
        mergedScrollRef.current.scrollTop = scrollTop;
      }
    } else if (source === 'right') {
      if (leftScrollRef.current) {
        leftScrollRef.current.scrollTop = scrollTop;
      }
      if (mergedScrollRef.current) {
        mergedScrollRef.current.scrollTop = scrollTop;
      }
    } else if (source === 'merged') {
      if (leftScrollRef.current) {
        leftScrollRef.current.scrollTop = scrollTop;
      }
      if (rightScrollRef.current) {
        rightScrollRef.current.scrollTop = scrollTop;
      }
    }
  };

  const handleFileSelect = async (side) => {
    const input = side === 'left' ? leftFileInputRef.current : rightFileInputRef.current;
    const file = input.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      if (side === 'left') {
        setLeftText(text);
        setLeftLabel(file.name);
      } else {
        setRightText(text);
        setRightLabel(file.name);
      }
    } catch (error) {
      console.error('Error reading file:', error);
      alert(`Failed to read file: ${error.message}`);
    }
  };

  const handlePaste = (side) => async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (side === 'left') {
        setLeftText(text);
        setLeftLabel('Pasted Content');
      } else {
        setRightText(text);
        setRightLabel('Pasted Content');
      }
    } catch (error) {
      console.error('Error pasting:', error);
      alert('Failed to paste from clipboard. Please paste manually in the text area.');
    }
  };

  const toggleTextInput = (side) => {
    setShowTextInput(prev => ({ ...prev, [side]: !prev[side] }));
  };

  const applyTextInput = (side) => {
    if (side === 'left') {
      setLeftText(textInput.left);
      setLeftLabel('Typed Content');
      setShowTextInput(prev => ({ ...prev, left: false }));
      setTextInput(prev => ({ ...prev, left: '' }));
    } else {
      setRightText(textInput.right);
      setRightLabel('Typed Content');
      setShowTextInput(prev => ({ ...prev, right: false }));
      setTextInput(prev => ({ ...prev, right: '' }));
    }
  };

  const handleTabSelect = (side, tabId) => {
    const tab = availableTabs.find(t => t.id === parseInt(tabId));
    if (!tab) return;

    const content = tab.content || '';
    const label = tab.name || tab.title || 'Untitled';

    if (side === 'left') {
      setLeftText(content);
      setLeftLabel(label);
      setSelectedLeftTabId(tab.id);
    } else {
      setRightText(content);
      setRightLabel(label);
      setSelectedRightTabId(tab.id);
    }
  };

  // Helper to save history for undo/redo
  const saveHistory = (newMergedText, newSelections) => {
    // Remove any history after current index (when doing new action after undo)
    const newHistory = mergeHistory.slice(0, historyIndex + 1);
    newHistory.push({
      mergedText: newMergedText,
      selections: new Map(newSelections)
    });
    // Keep only last 50 history items
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      setHistoryIndex(prev => prev + 1);
    }
    setMergeHistory(newHistory);
  };

  const acceptChange = (index, direction) => {
    const change = diff[index];
    const lines = mergedText.split('\n');
    const currentSelection = mergeSelections.get(index);

    // Toggle logic: if clicking the same side that's already selected, switch to the other side
    let newDirection = direction;
    if (currentSelection === direction) {
      // Toggle to the opposite side
      newDirection = direction === 'left' ? 'right' : 'left';
    }

    if (change.type === 'added') {
      // Add the right side line
      if (newDirection === 'right' && change.right !== null) {
        const insertIndex = change.rightLine - 1;
        lines.splice(insertIndex, 0, change.right);
      }
    } else if (change.type === 'deleted') {
      // Keep or remove the left side line
      if (newDirection === 'left' && change.left !== null) {
        // Keep it (already in merged)
      } else if (newDirection === 'right') {
        // Remove it
        const deleteIndex = lines.indexOf(change.left);
        if (deleteIndex !== -1) {
          lines.splice(deleteIndex, 1);
        }
      }
    } else if (change.type === 'modified') {
      // Replace with chosen side
      const lineIndex = change.leftLine - 1;
      if (newDirection === 'left' && change.left !== null) {
        lines[lineIndex] = change.left;
      } else if (newDirection === 'right' && change.right !== null) {
        lines[lineIndex] = change.right;
      }
    }

    const newMergedText = lines.join('\n');
    const newSelections = new Map(mergeSelections);
    newSelections.set(index, newDirection);

    setMergedText(newMergedText);
    setMergeSelections(newSelections);

    // Save to history
    saveHistory(newMergedText, newSelections);
  };

  const acceptAllLeft = () => {
    const newSelections = new Map();
    setMergedText(leftText);
    setMergeSelections(newSelections);
    saveHistory(leftText, newSelections);
  };

  const acceptAllRight = () => {
    const newSelections = new Map();
    setMergedText(rightText);
    setMergeSelections(newSelections);
    saveHistory(rightText, newSelections);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const historyItem = mergeHistory[newIndex];
      setHistoryIndex(newIndex);
      setMergedText(historyItem.mergedText);
      setMergeSelections(new Map(historyItem.selections));
    }
  };

  const redo = () => {
    if (historyIndex < mergeHistory.length - 1) {
      const newIndex = historyIndex + 1;
      const historyItem = mergeHistory[newIndex];
      setHistoryIndex(newIndex);
      setMergedText(historyItem.mergedText);
      setMergeSelections(new Map(historyItem.selections));
    }
  };

  const saveMerged = () => {
    const blob = new Blob([mergedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merged-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyMerged = async () => {
    try {
      await navigator.clipboard.writeText(mergedText);
      alert('Merged content copied to clipboard!');
    } catch (error) {
      console.error('Error copying:', error);
      alert('Failed to copy to clipboard');
    }
  };

  const resetMerged = () => {
    setMergedText(leftText);
  };

  // Navigation: Get list of changes (non-equal lines)
  const getChanges = () => {
    return diff.map((line, index) => ({ line, index })).filter(({ line }) => line.type !== 'equal');
  };

  // Navigate to previous change
  const goToPreviousChange = () => {
    const changes = getChanges();
    if (changes.length === 0) return;

    const currentIdx = currentChangeIndex === -1 ? changes.length : changes.findIndex(c => c.index === currentChangeIndex);
    const prevIdx = currentIdx > 0 ? currentIdx - 1 : changes.length - 1;
    const prevChange = changes[prevIdx];

    setCurrentChangeIndex(prevChange.index);
    scrollToLine(prevChange.index);
  };

  // Navigate to next change
  const goToNextChange = () => {
    const changes = getChanges();
    if (changes.length === 0) return;

    const currentIdx = changes.findIndex(c => c.index === currentChangeIndex);
    const nextIdx = currentIdx < changes.length - 1 ? currentIdx + 1 : 0;
    const nextChange = changes[nextIdx];

    setCurrentChangeIndex(nextChange.index);
    scrollToLine(nextChange.index);
  };

  // Scroll to specific line
  const scrollToLine = (lineIndex) => {
    const lineElement = lineRefs.current[lineIndex];
    if (!lineElement || !leftScrollRef.current) return;

    // Calculate the position to scroll to (center the line in view)
    const containerRect = leftScrollRef.current.getBoundingClientRect();
    const lineRect = lineElement.getBoundingClientRect();
    const containerScrollTop = leftScrollRef.current.scrollTop;

    // Calculate offset to center the line
    const lineOffsetFromTop = lineRect.top - containerRect.top + containerScrollTop;
    const targetScroll = lineOffsetFromTop - (containerRect.height / 2) + (lineRect.height / 2);

    // Scroll all panels to the same position (instant for immediate feedback)
    leftScrollRef.current.scrollTo({ top: targetScroll, behavior: 'auto' });

    if (rightScrollRef.current) {
      rightScrollRef.current.scrollTo({ top: targetScroll, behavior: 'auto' });
    }

    if (mergedScrollRef.current) {
      mergedScrollRef.current.scrollTo({ top: targetScroll, behavior: 'auto' });
    }
  };

  // Navigate to next search result
  const goToNextSearchResult = () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    scrollToLine(searchResults[nextIndex]);
  };

  // Navigate to previous search result
  const goToPreviousSearchResult = () => {
    if (searchResults.length === 0) return;
    const prevIndex = currentSearchIndex > 0 ? currentSearchIndex - 1 : searchResults.length - 1;
    setCurrentSearchIndex(prevIndex);
    scrollToLine(searchResults[prevIndex]);
  };

  // Render text with inline character-level diff highlighting
  const renderInlineDiff = (charDiff, side) => {
    if (!charDiff) return null;

    // When inline diff is toggled off, just return the plain text
    if (!showInlineDiff) {
      return charDiff.map(part => part.value).join('');
    }

    return charDiff.map((part, idx) => {
      if (part.type === 'equal') {
        return <span key={idx}>{part.value}</span>;
      } else if ((part.type === 'deleted' && side === 'left') || (part.type === 'added' && side === 'right')) {
        // Highlight the changed portion with a stronger background
        const bgColor = theme === 'dark'
          ? (part.type === 'deleted' ? 'bg-red-600/50' : 'bg-green-600/50')
          : (part.type === 'deleted' ? 'bg-red-300/70' : 'bg-green-300/70');
        return (
          <span key={idx} className={`${bgColor} px-0.5 rounded`}>
            {part.value}
          </span>
        );
      }
      return null;
    }).filter(Boolean);
  };

  // Helper to check if a line is included in the merged result
  const isLineInMerge = (line, index, side) => {
    if (line.type === 'equal') return true; // Equal lines are always included
    const selection = mergeSelections.get(index);
    if (selection === side) return true;
    // For lines without explicit selection, check default behavior
    if (!selection && side === 'left' && (line.type === 'deleted' || line.type === 'modified')) return true;
    return false;
  };

  const getLineStyle = (type) => {
    if (theme === 'dark') {
      switch (type) {
        case 'added':
          return 'bg-green-900/30 border-l-4 border-green-500';
        case 'deleted':
          return 'bg-red-900/30 border-l-4 border-red-500';
        case 'modified':
          return 'bg-yellow-900/30 border-l-4 border-yellow-500';
        default:
          return '';
      }
    } else {
      switch (type) {
        case 'added':
          return 'bg-green-100 border-l-4 border-green-500';
        case 'deleted':
          return 'bg-red-100 border-l-4 border-red-500';
        case 'modified':
          return 'bg-yellow-100 border-l-4 border-yellow-500';
        default:
          return '';
      }
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
      theme === 'dark' ? 'bg-black/80' : 'bg-gray-900/50'
    }`}>
      <div className={`w-full h-full max-w-[95vw] max-h-[95vh] rounded-lg shadow-2xl flex flex-col ${
        theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <h2 className="text-xl font-semibold">Diff Viewer</h2>
            {!showMerged && getChanges().length > 0 && (
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={goToPreviousChange}
                  className={`p-1.5 rounded transition-colors ${
                    theme === 'dark'
                      ? 'hover:bg-gray-700 text-gray-400'
                      : 'hover:bg-gray-200 text-gray-600'
                  }`}
                  title="Previous change (Alt+↑)"
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
                <button
                  onClick={goToNextChange}
                  className={`p-1.5 rounded transition-colors ${
                    theme === 'dark'
                      ? 'hover:bg-gray-700 text-gray-400'
                      : 'hover:bg-gray-200 text-gray-600'
                  }`}
                  title="Next change (Alt+↓)"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
                <span className={`text-sm ml-2 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {currentChangeIndex >= 0 && getChanges().findIndex(c => c.index === currentChangeIndex) + 1} of {getChanges().length} changes
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`p-2 rounded-lg transition-colors ${
                showSearch
                  ? theme === 'dark'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                  : theme === 'dark'
                    ? 'hover:bg-gray-700 text-gray-400'
                    : 'hover:bg-gray-200 text-gray-600'
              }`}
              title="Search (Ctrl+F)"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowInlineDiff(!showInlineDiff)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showInlineDiff
                  ? theme === 'dark'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                  : theme === 'dark'
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              title="Toggle character-level diff highlighting"
            >
              Inline Diff
            </button>

            {/* Merge Control Buttons - Show in diff view */}
            {!showMerged && (leftText || rightText) && (
              <>
                <div className={`h-6 w-px ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                <button
                  onClick={acceptAllLeft}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                    theme === 'dark'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                  title="Accept all from left side"
                >
                  <ArrowLeft className="w-4 h-4" />
                  All Left
                </button>
                <button
                  onClick={acceptAllRight}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                    theme === 'dark'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                  title="Accept all from right side"
                >
                  All Right
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              onClick={() => setShowMerged(!showMerged)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                showMerged
                  ? theme === 'dark'
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-purple-500 text-white hover:bg-purple-600'
                  : theme === 'dark'
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {showMerged ? 'Show Diff' : 'Show Merged'}
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                  : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        {showSearch && !showMerged && (
          <div className={`px-4 py-3 border-b ${
            theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-center gap-2">
              <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border ${
                theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'
              }`}>
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in diff..."
                  className={`flex-1 bg-transparent outline-none ${
                    theme === 'dark' ? 'text-gray-100 placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'
                  }`}
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className={`p-0.5 rounded transition-colors ${
                      theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-600'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {searchResults.length > 0 && (
                <>
                  <span className={`text-sm whitespace-nowrap ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {currentSearchIndex + 1} of {searchResults.length}
                  </span>
                  <button
                    onClick={goToPreviousSearchResult}
                    className={`p-1.5 rounded transition-colors ${
                      theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-600'
                    }`}
                    title="Previous result"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goToNextSearchResult}
                    className={`p-1.5 rounded transition-colors ${
                      theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-600'
                    }`}
                    title="Next result"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!showMerged ? (
            <>
            <div className="flex-1 flex p-4 overflow-hidden" ref={containerRef}>
              {/* Left Panel */}
              <div className="flex flex-col h-full min-h-0" style={{ width: `${leftPanelWidth}%` }}>
                <div className={`flex items-center justify-between mb-2 pb-2 border-b ${
                  theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                }`}>
                  <h3 className="font-semibold truncate">{leftLabel}</h3>
                  <div className="flex gap-2">
                    {availableTabs.length > 0 && (
                      <select
                        value={selectedLeftTabId}
                        onChange={(e) => handleTabSelect('left', e.target.value)}
                        className={`px-2 py-1 text-xs rounded border ${
                          theme === 'dark'
                            ? 'bg-gray-700 border-gray-600 text-gray-200'
                            : 'bg-white border-gray-300 text-gray-700'
                        }`}
                        title="Select from open tabs"
                      >
                        <option value="" disabled>Select tab...</option>
                        {availableTabs.map(tab => (
                          <option key={tab.id} value={tab.id}>
                            {tab.name || tab.title || 'Untitled'}
                          </option>
                        ))}
                      </select>
                    )}
                    {leftText && (
                      <button
                        onClick={() => {
                          setLeftText('');
                          setLeftLabel('Left');
                          setSelectedLeftTabId('');
                        }}
                        className={`p-2 rounded transition-colors ${
                          theme === 'dark'
                            ? 'hover:bg-red-900/50 text-gray-400 hover:text-red-400'
                            : 'hover:bg-red-50 text-gray-600 hover:text-red-600'
                        }`}
                        title="Clear content from left panel"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <input
                    ref={leftFileInputRef}
                    type="file"
                    onChange={() => handleFileSelect('left')}
                    className="hidden"
                    accept=".txt,.json,.xml,.md,.js,.jsx,.ts,.tsx,.css,.html"
                  />
                </div>

                {showTextInput.left ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <textarea
                      value={textInput.left}
                      onChange={(e) => setTextInput(prev => ({ ...prev, left: e.target.value }))}
                      placeholder="Type or paste content here..."
                      className={`flex-1 p-3 font-mono text-sm border rounded-lg resize-none ${
                        theme === 'dark'
                          ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                      }`}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => applyTextInput('left')}
                        className={`flex-1 px-4 py-2 rounded transition-colors ${
                          theme === 'dark'
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        <Check className="w-4 h-4 inline mr-1" />
                        Apply
                      </button>
                      <button
                        onClick={() => toggleTextInput('left')}
                        className={`px-4 py-2 rounded transition-colors ${
                          theme === 'dark'
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                        }`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : !leftText ? (
                  <div className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    theme === 'dark' ? 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }`}>
                    <div className="text-center p-8 pointer-events-none">
                      <FileText className={`w-12 h-12 mx-auto mb-3 ${
                        theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
                      }`} />
                      <p className={`mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        Click to open a file or paste content
                      </p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            leftFileInputRef.current?.click();
                          }}
                          className={`px-4 py-2 rounded flex items-center gap-2 pointer-events-auto transition-colors ${
                            theme === 'dark'
                              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                          }`}
                        >
                          <Upload className="w-4 h-4" />
                          Open File
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePaste('left')();
                          }}
                          className={`px-4 py-2 rounded flex items-center gap-2 pointer-events-auto transition-colors ${
                            theme === 'dark'
                              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                          }`}
                        >
                          <Copy className="w-4 h-4" />
                          Paste
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    ref={leftScrollRef}
                    onScroll={handleScroll('left')}
                    className={`flex-1 overflow-auto font-mono ${fontSizeClass} border rounded-lg ${
                      theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-gray-50'
                    }`}
                    style={{ overflowX: 'auto', overflowY: 'auto' }}
                  >
                    {diff.map((line, index) => {
                      const isSearchMatch = searchResults.includes(index);
                      const isCurrentSearchResult = searchResults[currentSearchIndex] === index;
                      const selection = mergeSelections.get(index);
                      const isSelected = selection === 'left';
                      // Check if this is the default selection (no explicit selection and left would be used)
                      const isDefault = !selection && (line.type === 'modified' || line.type === 'deleted');
                      const isChecked = isSelected || isDefault;
                      const inMerge = isLineInMerge(line, index, 'left');
                      return (<div
                        key={index}
                        ref={el => lineRefs.current[index] = el}
                        className={`flex items-center ${getLineStyle(line.type)} ${
                          index === currentChangeIndex ? 'ring-2 ring-blue-500 ring-inset' : ''
                        } ${
                          isSearchMatch ? (isCurrentSearchResult ? 'ring-2 ring-orange-500' : 'ring-1 ring-yellow-500/50') : ''
                        } ${
                          isSelected ? 'ring-2 ring-green-500 ring-inset' : ''
                        }`}
                      >
                        {inMerge && line.type !== 'equal' && rightText && (
                          <CheckCircle className={`w-3.5 h-3.5 ml-1 flex-shrink-0 ${
                            theme === 'dark' ? 'text-green-400' : 'text-green-600'
                          }`} title="Included in merge" />
                        )}
                        <span className={`inline-block w-10 text-right pr-1.5 select-none ${
                          theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                        }`}>
                          {line.leftLine || ''}
                        </span>
                        <span className={`flex-1 px-1.5 ${lineSpacingClass} whitespace-pre-wrap break-all`}>
                          {line.left !== null ? (
                            line.type === 'modified' && line.charDiff ? (
                              renderInlineDiff(line.charDiff, 'left')
                            ) : (
                              line.left
                            )
                          ) : ''}
                        </span>
                        {line.type !== 'equal' && rightText && (
                          <label className="mr-1.5 flex items-center cursor-pointer" title="Select left version">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => acceptChange(index, 'left')}
                              className={`w-3.5 h-3.5 rounded cursor-pointer transition-colors ${
                                theme === 'dark'
                                  ? 'bg-gray-700 border-gray-600 text-green-500 focus:ring-green-500'
                                  : 'bg-white border-gray-300 text-green-600 focus:ring-green-500'
                              }`}
                            />
                          </label>
                        )}
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>

              {/* Center Resize Handle */}
              <div className="flex-shrink-0 flex items-stretch">
                <div
                  onMouseDown={handlePanelResizeStart}
                  className={`w-1.5 cursor-col-resize transition-colors ${
                    isResizingPanels
                      ? theme === 'dark' ? 'bg-blue-500' : 'bg-blue-400'
                      : theme === 'dark' ? 'hover:bg-gray-600 bg-gray-700' : 'hover:bg-gray-300 bg-gray-200'
                  }`}
                  title="Drag to resize panels"
                />
              </div>

              {/* Right Panel */}
              <div className="flex flex-col h-full min-h-0" style={{ width: `${100 - leftPanelWidth}%` }}>
                <div className={`flex items-center justify-between mb-2 pb-2 border-b ${
                  theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                }`}>
                  <h3 className="font-semibold truncate">{rightLabel}</h3>
                  <div className="flex gap-2">
                    {availableTabs.length > 0 && (
                      <select
                        value={selectedRightTabId}
                        onChange={(e) => handleTabSelect('right', e.target.value)}
                        className={`px-2 py-1 text-xs rounded border ${
                          theme === 'dark'
                            ? 'bg-gray-700 border-gray-600 text-gray-200'
                            : 'bg-white border-gray-300 text-gray-700'
                        }`}
                        title="Select from open tabs"
                      >
                        <option value="" disabled>Select tab...</option>
                        {availableTabs.map(tab => (
                          <option key={tab.id} value={tab.id}>
                            {tab.name || tab.title || 'Untitled'}
                          </option>
                        ))}
                      </select>
                    )}
                    {rightText && (
                      <button
                        onClick={() => {
                          setRightText('');
                          setRightLabel('Right');
                          setSelectedRightTabId('');
                        }}
                        className={`p-2 rounded transition-colors ${
                          theme === 'dark'
                            ? 'hover:bg-red-900/50 text-gray-400 hover:text-red-400'
                            : 'hover:bg-red-50 text-gray-600 hover:text-red-600'
                        }`}
                        title="Clear content from right panel"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <input
                    ref={rightFileInputRef}
                    type="file"
                    onChange={() => handleFileSelect('right')}
                    className="hidden"
                    accept=".txt,.json,.xml,.md,.js,.jsx,.ts,.tsx,.css,.html"
                  />
                </div>

                {showTextInput.right ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <textarea
                      value={textInput.right}
                      onChange={(e) => setTextInput(prev => ({ ...prev, right: e.target.value }))}
                      placeholder="Type or paste content here..."
                      className={`flex-1 p-3 font-mono text-sm border rounded-lg resize-none ${
                        theme === 'dark'
                          ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                      }`}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => applyTextInput('right')}
                        className={`flex-1 px-4 py-2 rounded transition-colors ${
                          theme === 'dark'
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        <Check className="w-4 h-4 inline mr-1" />
                        Apply
                      </button>
                      <button
                        onClick={() => toggleTextInput('right')}
                        className={`px-4 py-2 rounded transition-colors ${
                          theme === 'dark'
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                        }`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : !rightText ? (
                  <div className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    theme === 'dark' ? 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }`}>
                    <div className="text-center p-8 pointer-events-none">
                      <FileText className={`w-12 h-12 mx-auto mb-3 ${
                        theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
                      }`} />
                      <p className={`mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        Click to open a file or paste content
                      </p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            rightFileInputRef.current?.click();
                          }}
                          className={`px-4 py-2 rounded flex items-center gap-2 pointer-events-auto transition-colors ${
                            theme === 'dark'
                              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                          }`}
                        >
                          <Upload className="w-4 h-4" />
                          Open File
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePaste('right')();
                          }}
                          className={`px-4 py-2 rounded flex items-center gap-2 pointer-events-auto transition-colors ${
                            theme === 'dark'
                              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                          }`}
                        >
                          <Copy className="w-4 h-4" />
                          Paste
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    ref={rightScrollRef}
                    onScroll={handleScroll('right')}
                    className={`flex-1 overflow-auto font-mono ${fontSizeClass} border rounded-lg ${
                      theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-gray-50'
                    }`}
                    style={{ overflowX: 'auto', overflowY: 'auto' }}
                  >
                    {diff.map((line, index) => {
                      const isSearchMatch = searchResults.includes(index);
                      const isCurrentSearchResult = searchResults[currentSearchIndex] === index;
                      const isSelected = mergeSelections.get(index) === 'right';
                      const inMerge = isLineInMerge(line, index, 'right');
                      return (<div
                        key={index}
                        className={`flex items-center ${getLineStyle(line.type)} ${
                          index === currentChangeIndex ? 'ring-2 ring-blue-500 ring-inset' : ''
                        } ${
                          isSearchMatch ? (isCurrentSearchResult ? 'ring-2 ring-orange-500' : 'ring-1 ring-yellow-500/50') : ''
                        } ${
                          isSelected ? 'ring-2 ring-green-500 ring-inset' : ''
                        }`}
                      >
                        {line.type !== 'equal' && (
                          <label className="ml-1.5 flex items-center cursor-pointer" title="Select right version">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => acceptChange(index, 'right')}
                              className={`w-3.5 h-3.5 rounded cursor-pointer transition-colors ${
                                theme === 'dark'
                                  ? 'bg-gray-700 border-gray-600 text-green-500 focus:ring-green-500'
                                  : 'bg-white border-gray-300 text-green-600 focus:ring-green-500'
                              }`}
                            />
                          </label>
                        )}
                        <span className={`inline-block w-10 text-right pr-1.5 select-none ${
                          theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                        }`}>
                          {line.rightLine || ''}
                        </span>
                        <span className={`flex-1 px-1.5 ${lineSpacingClass} whitespace-pre-wrap break-all`}>
                          {line.right !== null ? (
                            line.type === 'modified' && line.charDiff ? (
                              renderInlineDiff(line.charDiff, 'right')
                            ) : (
                              line.right
                            )
                          ) : ''}
                        </span>
                        {inMerge && line.type !== 'equal' && (
                          <CheckCircle className={`w-3.5 h-3.5 mr-1 flex-shrink-0 ${
                            theme === 'dark' ? 'text-green-400' : 'text-green-600'
                          }`} title="Included in merge" />
                        )}
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>

              {/* Mini-map / Visual Indicator on the far right */}
              <div className={`w-6 flex-shrink-0 border-l ${
                theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-100'
              }`}>
                <div className="h-full relative">
                  {diff.map((line, index) => {
                    if (line.type === 'equal') return null;

                    const percentage = (index / diff.length) * 100;
                    const heightPercentage = (1 / diff.length) * 100;

                    let bgColor = '';
                    let hoverColor = '';
                    let title = '';

                    switch (line.type) {
                      case 'added':
                        bgColor = theme === 'dark' ? 'bg-green-600' : 'bg-green-500';
                        hoverColor = theme === 'dark' ? 'hover:bg-green-500' : 'hover:bg-green-600';
                        title = `Added line ${line.rightLine}`;
                        break;
                      case 'deleted':
                        bgColor = theme === 'dark' ? 'bg-red-600' : 'bg-red-500';
                        hoverColor = theme === 'dark' ? 'hover:bg-red-500' : 'hover:bg-red-600';
                        title = `Deleted line ${line.leftLine}`;
                        break;
                      case 'modified':
                        bgColor = theme === 'dark' ? 'bg-yellow-600' : 'bg-yellow-500';
                        hoverColor = theme === 'dark' ? 'hover:bg-yellow-500' : 'hover:bg-yellow-600';
                        title = `Modified line ${line.leftLine}`;
                        break;
                      default:
                        return null;
                    }

                    return (
                      <button
                        key={index}
                        onClick={() => {
                          setCurrentChangeIndex(index);
                          scrollToLine(index);
                        }}
                        className={`absolute w-full ${bgColor} ${hoverColor} cursor-pointer transition-all ${
                          index === currentChangeIndex ? 'ring-2 ring-blue-400' : ''
                        }`}
                        style={{
                          top: `${percentage}%`,
                          height: `${Math.max(heightPercentage, 0.5)}%`,
                          minHeight: '2px'
                        }}
                        title={title}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Merged Preview Panel */}
            {(leftText || rightText) && (
              <div className={`border-t ${theme === 'dark' ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50/50'}`}>
                {/* Resize Handle */}
                <div
                  onMouseDown={handleResizeStart}
                  className={`h-1.5 cursor-ns-resize transition-colors ${
                    isResizing
                      ? theme === 'dark' ? 'bg-blue-500' : 'bg-blue-400'
                      : theme === 'dark' ? 'hover:bg-gray-600' : 'hover:bg-gray-300'
                  }`}
                  title="Drag to resize"
                />
                <div className={`px-4 py-2 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        Merged Preview
                        {mergeSelections.size > 0 && (
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                            theme === 'dark' ? 'bg-green-600/20 text-green-400' : 'bg-green-100 text-green-700'
                          }`}>
                            {mergeSelections.size} {mergeSelections.size === 1 ? 'selection' : 'selections'}
                          </span>
                        )}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={undo}
                        disabled={historyIndex <= 0}
                        className={`p-1.5 rounded text-xs transition-colors ${
                          historyIndex <= 0
                            ? theme === 'dark' ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 cursor-not-allowed'
                            : theme === 'dark'
                              ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                              : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'
                        }`}
                        title="Undo (Ctrl+Z)"
                      >
                        ↶ Undo
                      </button>
                      <button
                        onClick={redo}
                        disabled={historyIndex >= mergeHistory.length - 1}
                        className={`p-1.5 rounded text-xs transition-colors ${
                          historyIndex >= mergeHistory.length - 1
                            ? theme === 'dark' ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 cursor-not-allowed'
                            : theme === 'dark'
                              ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                              : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'
                        }`}
                        title="Redo (Ctrl+Y)"
                      >
                        Redo ↷
                      </button>
                      <button
                        onClick={copyMerged}
                        className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors ${
                          theme === 'dark'
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-green-500 hover:bg-green-600 text-white'
                        }`}
                        title="Copy merged result to clipboard"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                      <button
                        onClick={saveMerged}
                        className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors ${
                          theme === 'dark'
                            ? 'bg-purple-600 hover:bg-purple-700 text-white'
                            : 'bg-purple-500 hover:bg-purple-600 text-white'
                        }`}
                        title="Download merged result"
                      >
                        <Download className="w-3 h-3" />
                        Save
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  ref={mergedScrollRef}
                  onScroll={handleScroll('merged')}
                  className={`overflow-auto font-mono ${fontSizeClass} ${
                    theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'
                  }`}
                  style={{ height: `${previewHeight}px` }}
                >
                  {(() => {
                    let lineNumber = 0;
                    return diff.map((line, index) => {
                      const selection = mergeSelections.get(index);
                      let displayLine = null;
                      let lineStyle = '';

                      if (line.type === 'equal') {
                        displayLine = line.left;
                        lineStyle = theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100';
                      } else if (line.type === 'modified') {
                        displayLine = selection === 'right' ? line.right : line.left;
                        lineStyle = selection === 'right'
                          ? theme === 'dark' ? 'bg-green-900/30' : 'bg-green-100'
                          : selection === 'left'
                            ? theme === 'dark' ? 'bg-yellow-900/30' : 'bg-yellow-100'
                            : theme === 'dark' ? 'bg-yellow-900/30' : 'bg-yellow-100';
                      } else if (line.type === 'added') {
                        if (selection === 'right') {
                          displayLine = line.right;
                          lineStyle = theme === 'dark' ? 'bg-green-900/30' : 'bg-green-100';
                        } else {
                          return null; // Don't show if not selected
                        }
                      } else if (line.type === 'deleted') {
                        if (selection === 'left') {
                          displayLine = line.left;
                          lineStyle = theme === 'dark' ? 'bg-red-900/30' : 'bg-red-100';
                        } else if (!selection) {
                          // Default: show left side for deleted lines
                          displayLine = line.left;
                          lineStyle = theme === 'dark' ? 'bg-yellow-900/30' : 'bg-yellow-100';
                        } else {
                          return null; // Don't show if right was selected
                        }
                      }

                      if (displayLine === null) return null;

                      lineNumber++;
                      return (
                        <div
                          key={index}
                          className={`flex items-center ${lineStyle} ${
                            theme === 'dark' ? 'text-gray-300' : 'text-gray-800'
                          }`}
                        >
                          <span className={`inline-block w-10 text-right pr-2 ${lineSpacingClass} select-none flex-shrink-0 ${
                            theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                          }`}>
                            {lineNumber}
                          </span>
                          <span className={`flex-1 px-2 ${lineSpacingClass} whitespace-pre-wrap break-all`}>{displayLine}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
            </>
          ) : (
            /* Merged View */
            <div className="h-full p-4 flex flex-col">
              <div className={`flex items-center justify-between mb-2 pb-2 border-b ${
                theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <h3 className="font-semibold">Merged Result</h3>
                <div className="flex gap-2">
                  <button
                    onClick={resetMerged}
                    className={`px-3 py-1.5 rounded flex items-center gap-2 transition-colors ${
                      theme === 'dark'
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                    title="Reset to left side"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </button>
                  <button
                    onClick={acceptAllLeft}
                    className={`px-3 py-1.5 rounded flex items-center gap-2 transition-colors ${
                      theme === 'dark'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    All Left
                  </button>
                  <button
                    onClick={acceptAllRight}
                    className={`px-3 py-1.5 rounded flex items-center gap-2 transition-colors ${
                      theme === 'dark'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    All Right
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={copyMerged}
                    className={`px-3 py-1.5 rounded flex items-center gap-2 transition-colors ${
                      theme === 'dark'
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-green-500 hover:bg-green-600 text-white'
                    }`}
                  >
                    <Copy className="w-4 h-4" />
                    Copy
                  </button>
                  <button
                    onClick={saveMerged}
                    className={`px-3 py-1.5 rounded flex items-center gap-2 transition-colors ${
                      theme === 'dark'
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : 'bg-purple-500 hover:bg-purple-600 text-white'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    Save
                  </button>
                </div>
              </div>

              <textarea
                ref={mergedScrollRef}
                value={mergedText}
                onChange={(e) => setMergedText(e.target.value)}
                className={`flex-1 w-full p-4 font-mono text-sm border rounded-lg resize-none ${
                  theme === 'dark'
                    ? 'bg-gray-800 border-gray-700 text-gray-100'
                    : 'bg-gray-50 border-gray-300 text-gray-900'
                }`}
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Footer Stats */}
        {diff.length > 0 && !showMerged && (
          <div className={`flex items-center justify-center gap-6 p-3 border-t text-sm ${
            theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500"></div>
              <span>{diff.filter(d => d.type === 'added').length} added</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500"></div>
              <span>{diff.filter(d => d.type === 'deleted').length} deleted</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-yellow-500"></div>
              <span>{diff.filter(d => d.type === 'modified').length} modified</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gray-500"></div>
              <span>{diff.filter(d => d.type === 'equal').length} unchanged</span>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Help Overlay */}
        {showHelp && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
            <div className={`w-full max-w-2xl mx-4 rounded-lg shadow-2xl ${
              theme === 'dark' ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'
            }`}>
              <div className={`flex items-center justify-between p-4 border-b ${
                theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <h3 className="text-lg font-semibold">Keyboard Shortcuts</h3>
                <button
                  onClick={() => setShowHelp(false)}
                  className={`p-1.5 rounded transition-colors ${
                    theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-4 max-h-[70vh] overflow-y-auto">
                {[
                  { keys: ['Ctrl', 'F'], desc: 'Toggle search' },
                  { keys: ['?'], desc: 'Show this help' },
                  { keys: ['Esc'], desc: 'Close search/help/viewer' },
                  { keys: ['Alt', '↑'], desc: 'Previous change' },
                  { keys: ['Alt', '↓'], desc: 'Next change' },
                  { keys: ['Enter'], desc: 'Next search result' },
                  { keys: ['Shift', 'Enter'], desc: 'Previous search result' },
                ].map(({ keys, desc }, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-4">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>{desc}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((key, kidx) => (
                        <React.Fragment key={kidx}>
                          <kbd className={`px-2 py-1 text-xs font-mono rounded ${
                            theme === 'dark'
                              ? 'bg-gray-700 text-gray-200 border border-gray-600'
                              : 'bg-gray-100 text-gray-800 border border-gray-300'
                          }`}>
                            {key}
                          </kbd>
                          {kidx < keys.length - 1 && <span className="text-gray-500">+</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiffViewer;
