/**
 * PDF Viewer Component
 * Full-featured PDF viewer with navigation, zoom, and download capabilities
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Document, Page } from 'react-pdf';
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Download, Maximize2, Minimize2, ChevronsLeft, ChevronsRight, Expand, Shrink,
  List, Columns, LayoutGrid, BookOpen, Search, ChevronUp, ChevronDown, Eye, EyeOff, Printer
} from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { PDF_OPTIONS } from '../utils/pdfConfig.js'; // Initialize PDF.js worker and get options
import { isDesktop } from '../utils/platform.js';
import NativePrintDialog from './NativePrintDialog.jsx';

const PDFViewer = ({ fileContent, fileName, filePath, theme, onClose, isFullscreen = false, onToggleFullscreen, onTogglePanels, panelsVisible = false }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false); // Focus mode hides UI elements
  const [preFocusPanelState, setPreFocusPanelState] = useState(null); // Store panel states before focus mode
  const [pageWidth, setPageWidth] = useState(null);
  const [pageHeight, setPageHeight] = useState(null);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [viewMode, setViewMode] = useState('continuous'); // 'single' or 'continuous'
  const [outline, setOutline] = useState([]);
  const [showOutline, setShowOutline] = useState(false);
  const [visiblePages, setVisiblePages] = useState(new Set([1]));
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState(''); // Current query being highlighted
  const [hasSearched, setHasSearched] = useState(false); // Track if search has been performed
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const pdfDocumentRef = useRef(null);
  const thumbnailRefs = useRef({});
  const searchInputRef = useRef(null);

  const isDark = theme === 'dark';
  const THUMBNAIL_WIDTH = 140;
  const actuallyFullscreen = isFullscreen ?? internalFullscreen;
  const canPrint = isDesktop() && !!filePath;

  useEffect(() => {
    if (!showPrintDialog || !window.__TAURI__) {
      return;
    }
    console.log('[PDF] Print dialog opened', {
      filePath,
      fileName,
      hasBytes: !!printableBytes,
      bytesLength: printableBytes?.length
    });
    const adjustWindow = async () => {
      try {
        const { appWindow } = await import('@tauri-apps/api/window');
        await appWindow.setResizable(true);
        await appWindow.unmaximize();
      } catch (error) {
        console.warn('[PDF] Failed to adjust window for print dialog:', error);
      }
    };
    adjustWindow();
  }, [showPrintDialog]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const handleClick = () => setContextMenu(null);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleClick, true);
    window.addEventListener('resize', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleClick, true);
      window.removeEventListener('resize', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const handleContextMenu = useCallback((event) => {
    if (!isDesktop() || showPrintDialog) {
      return;
    }
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY
    });
  }, [showPrintDialog]);

  // Scroll to page in continuous mode
  const scrollToPage = useCallback((page) => {
    if (viewMode === 'continuous' && pageRefs.current[page]) {
      pageRefs.current[page].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setPageNumber(page);
  }, [viewMode]);

  // Toggle focus mode - hides UI elements for distraction-free viewing
  const toggleFocusMode = useCallback(() => {
    setFocusMode(prev => {
      const newFocusMode = !prev;
      if (newFocusMode) {
        // Entering focus mode - save current panel states and hide all panels
        setPreFocusPanelState({
          thumbnails: showThumbnails,
          outline: showOutline,
          search: showSearch,
          parentPanels: panelsVisible // Save parent panels state
        });
        setShowThumbnails(false);
        setShowOutline(false);
        setShowSearch(false);
        // Hide parent panels (File Explorer and File System Browser)
        if (onTogglePanels) {
          onTogglePanels(false);
        }
      } else {
        // Exiting focus mode - restore previous panel states
        if (preFocusPanelState) {
          setShowThumbnails(preFocusPanelState.thumbnails);
          setShowOutline(preFocusPanelState.outline);
          setShowSearch(preFocusPanelState.search);
          // Restore parent panels
          if (onTogglePanels && preFocusPanelState.parentPanels !== undefined) {
            onTogglePanels(preFocusPanelState.parentPanels);
          }
        }
      }
      console.log(`[PDF] Focus mode ${newFocusMode ? 'enabled' : 'disabled'}`);
      return newFocusMode;
    });
  }, [showThumbnails, showOutline, showSearch, preFocusPanelState, panelsVisible, onTogglePanels]);

  // Keep the fullscreen handler for web-only use
  const toggleFullscreen = useCallback(async () => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
    } else {
      // Toggle internal fullscreen state
      const newFullscreenState = !internalFullscreen;
      setInternalFullscreen(newFullscreenState);

      try {
        // Check if we're in Tauri (desktop app)
        if (window.__TAURI__) {
          // Use Tauri's window API for fullscreen
          const { appWindow } = await import('@tauri-apps/api/window');
          await appWindow.setFullscreen(newFullscreenState);
          console.log(`[PDF] Tauri fullscreen ${newFullscreenState ? 'enabled' : 'disabled'}`);
        } else {
          // Use browser fullscreen API for web
          if (newFullscreenState) {
            // Request fullscreen on document.documentElement (entire page)
            if (document.documentElement.requestFullscreen) {
              await document.documentElement.requestFullscreen();
            }
          } else {
            // Exit browser fullscreen if active
            if (document.fullscreenElement) {
              await document.exitFullscreen();
            }
          }
        }
      } catch (err) {
        console.log('[PDF] Fullscreen API error:', err);
        // Internal fullscreen CSS will still work as fallback
      }
    }
  }, [onToggleFullscreen, internalFullscreen]);

  // Memoize the file object to prevent unnecessary reloads
  // Create a copy of the Uint8Array to avoid detached ArrayBuffer issues
  const pdfFile = useMemo(() => {
    if (!fileContent) return null;

    // Create a fresh copy of the data to avoid ArrayBuffer detachment
    const dataCopy = new Uint8Array(fileContent);

    console.log('[PDF] Creating PDF file object:', {
      fileName,
      fileContentType: fileContent?.constructor?.name,
      fileContentLength: fileContent?.length,
      isUint8Array: fileContent instanceof Uint8Array,
      firstBytes: Array.from(fileContent?.slice(0, 10) || [])
    });

    // Verify it's actually a PDF
    const isPDF = fileContent && fileContent[0] === 0x25 && fileContent[1] === 0x50 &&
                  fileContent[2] === 0x44 && fileContent[3] === 0x46; // %PDF
    console.log('[PDF] File starts with PDF signature:', isPDF);

    return { data: dataCopy };
  }, [fileContent, fileName]);

  const printableBytes = useMemo(() => {
    if (!fileContent) {
      return null;
    }
    try {
      return new Uint8Array(fileContent);
    } catch (error) {
      console.warn('[PDF] Failed to clone PDF bytes for printing:', error);
      return null;
    }
  }, [fileContent]);

  // Use imported PDF options (already configured for both web and desktop)
  const pdfOptions = useMemo(() => PDF_OPTIONS, []);

  const onDocumentLoadSuccess = useCallback((pdf) => {
    // Store PDF document reference for navigation
    pdfDocumentRef.current = pdf;

    setNumPages(pdf.numPages);
    setLoading(false);
    console.log(`[PDF] Loaded ${pdf.numPages} pages successfully`);

    // Get first page dimensions for fit calculations
    pdf.getPage(1).then(page => {
      const viewport = page.getViewport({ scale: 1 });
      setPageWidth(viewport.width);
      setPageHeight(viewport.height);
      console.log(`[PDF] Page dimensions: ${viewport.width} x ${viewport.height}`);
    });

    // Extract table of contents (outline)
    pdf.getOutline().then(outline => {
      if (outline && outline.length > 0) {
        console.log('[PDF] Outline found:', outline);
        setOutline(outline);
      } else {
        console.log('[PDF] No outline found in PDF');
        setOutline([]);
      }
    }).catch(err => {
      console.warn('[PDF] Failed to load outline:', err);
      setOutline([]);
    });
  }, []);

  const onDocumentLoadError = useCallback((error) => {
    console.error('[PDF] Load error:', error);
    console.error('[PDF] Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    setError(error.message || 'Failed to load PDF');
    setLoading(false);
  }, []);

  const changePage = useCallback((offset) => {
    const newPage = Math.min(Math.max(1, pageNumber + offset), numPages || 1);
    scrollToPage(newPage);
  }, [pageNumber, numPages, scrollToPage]);

  const previousPage = useCallback(() => changePage(-1), [changePage]);
  const nextPage = useCallback(() => changePage(1), [changePage]);
  const firstPage = useCallback(() => scrollToPage(1), [scrollToPage]);
  const lastPage = useCallback(() => scrollToPage(numPages || 1), [scrollToPage, numPages]);

  const zoomIn = useCallback(() => {
    setScale((prevScale) => Math.min(prevScale + 0.25, 3.0));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prevScale) => Math.max(prevScale - 0.25, 0.5));
  }, []);

  const fitToWidth = useCallback(() => {
    setScale(1);
    console.log('[PDF] Fit to width: using 100% zoom');
  }, []);

  const fitToPage = useCallback(() => {
    if (!containerRef.current || !pageWidth || !pageHeight) return;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const padding = 64;

    const scaleWidth = (containerWidth - padding) / pageWidth;
    const scaleHeight = (containerHeight - padding) / pageHeight;
    const newScale = Math.min(scaleWidth, scaleHeight);
    setScale(Math.max(0.1, Math.min(3.0, newScale)));
    console.log(`[PDF] Fit to page: container=${containerWidth}x${containerHeight}, page=${pageWidth}x${pageHeight}, scale=${newScale.toFixed(2)}`);
  }, [pageWidth, pageHeight]);

  const handleDownload = useCallback(() => {
    try {
      const blob = new Blob([fileContent], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[PDF] Download failed:', error);
    }
  }, [fileContent, fileName]);

  // PDF Search functionality
  const performSearch = useCallback(async (query) => {
    if (!query.trim() || !pdfDocumentRef.current) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }

    setIsSearching(true);
    const results = [];

    try {
      const pdf = pdfDocumentRef.current;
      const searchLower = query.toLowerCase();

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        const pageTextLower = pageText.toLowerCase();

        // Find all occurrences in this page
        let startIndex = 0;
        while ((startIndex = pageTextLower.indexOf(searchLower, startIndex)) !== -1) {
          // Extract context around the match (50 chars before and after)
          const contextStart = Math.max(0, startIndex - 50);
          const contextEnd = Math.min(pageText.length, startIndex + searchLower.length + 50);
          const context = pageText.substring(contextStart, contextEnd);

          results.push({
            pageNum,
            index: startIndex,
            context: context,
            matchStart: startIndex - contextStart,
            matchLength: searchLower.length
          });
          startIndex += searchLower.length;
        }
      }

      setSearchResults(results);
      setCurrentSearchIndex(0);

      // Navigate to first result
      if (results.length > 0) {
        scrollToPage(results[0].pageNum);
      }

      console.log(`[PDF Search] Found ${results.length} results for "${query}"`);
    } catch (error) {
      console.error('[PDF Search] Error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [scrollToPage]);

  const goToSearchResult = useCallback((index) => {
    if (index < 0 || index >= searchResults.length) return;
    setCurrentSearchIndex(index);
    scrollToPage(searchResults[index].pageNum);
  }, [searchResults, scrollToPage]);

  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    goToSearchResult(nextIndex);
  }, [searchResults.length, currentSearchIndex, goToSearchResult]);

  const previousSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    goToSearchResult(prevIndex);
  }, [searchResults.length, currentSearchIndex, goToSearchResult]);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    performSearch(searchQuery);
    setActiveSearchQuery(searchQuery); // Set active query for highlighting
    setHasSearched(true); // Mark that search has been performed
  }, [searchQuery, performSearch]);

  const toggleSearch = useCallback(() => {
    setShowSearch(prev => {
      const newState = !prev;
      if (newState) {
        // When opening search, hide thumbnails and outline
        setShowThumbnails(false);
        setShowOutline(false);
        // Focus search input
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else {
        // When closing search, clear highlights
        setActiveSearchQuery('');
        setSearchResults([]);
        setSearchQuery('');
        setHasSearched(false);
      }
      return newState;
    });
  }, []);

  const handleKeyDown = useCallback((e) => {
    // Ctrl/Cmd+F for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      toggleSearch();
      return;
    }
    // Don't handle navigation keys if search input is focused
    if (showSearch && document.activeElement === searchInputRef.current) {
      return;
    }
    if (e.key === 'ArrowLeft') previousPage();
    else if (e.key === 'ArrowRight') nextPage();
    else if (e.key === 'Home') firstPage();
    else if (e.key === 'End') lastPage();
    else if (e.key === '+' || e.key === '=') zoomIn();
    else if (e.key === '-') zoomOut();
    else if (e.key === 'Escape') {
      if (showSearch) {
        setShowSearch(false);
      } else {
        onClose?.();
      }
    }
  }, [previousPage, nextPage, firstPage, lastPage, zoomIn, zoomOut, onClose, toggleSearch, showSearch]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Focus the container so it receives keyboard events
    container.focus();

    // Use capture phase to intercept Ctrl+P before browser handles it
    container.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => container.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleKeyDown]);

  // Add wheel zoom support (Ctrl/Cmd + scroll)
  React.useEffect(() => {
    const handleWheel = (e) => {
      // Only handle wheel zoom if Ctrl/Cmd is pressed
      if (e.ctrlKey || e.metaKey) {
        // Prevent browser zoom
        e.preventDefault();
        e.stopPropagation();

        const delta = -Math.sign(e.deltaY);
        if (delta > 0) {
          setScale((prev) => Math.min(prev + 0.1, 3.0));
        } else {
          setScale((prev) => Math.max(prev - 0.1, 0.5));
        }
      }
    };

    const container = containerRef.current;
    if (container) {
      // Use capture phase to ensure we catch the event before it bubbles up
      container.addEventListener('wheel', handleWheel, { passive: false, capture: true });
      return () => container.removeEventListener('wheel', handleWheel, { capture: true });
    }
  }, []);

  // Track visible pages in continuous mode to optimize rendering
  React.useEffect(() => {
    if (showPrintDialog) {
      return;
    }
    if (viewMode !== 'continuous' || !numPages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find all currently intersecting pages
        const intersectingPages = entries
          .filter(entry => entry.isIntersecting)
          .map(entry => ({
            pageNum: parseInt(entry.target.dataset.page),
            top: entry.boundingClientRect.top
          }))
          .sort((a, b) => a.top - b.top);

        if (intersectingPages.length === 0) return;

        // The topmost visible page (closest to top of viewport)
        const topMostPage = intersectingPages[0].pageNum;

        // Update current page number
        setPageNumber(topMostPage);

        // Update visible pages for virtualization
        const newVisiblePages = new Set();
        intersectingPages.forEach(({ pageNum }) => {
          // Add visible page and surrounding pages (buffering)
          for (let i = Math.max(1, pageNum - 2); i <= Math.min(numPages, pageNum + 2); i++) {
            newVisiblePages.add(i);
          }
        });

        setVisiblePages(newVisiblePages);
      },
      {
        root: containerRef.current,
        rootMargin: '-10% 0px -50% 0px', // Trigger when page is near top
        threshold: [0, 0.25, 0.5, 0.75, 1.0]
      }
    );

    // Observe all page containers
    Object.values(pageRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [showPrintDialog, viewMode, numPages]); // Removed pageNumber and visiblePages from dependencies

  React.useEffect(() => {
    if (!showPrintDialog && viewMode === 'continuous') {
      setVisiblePages(new Set([1]));
    }
  }, [showPrintDialog, viewMode]);

  // Handle browser fullscreen changes
  React.useEffect(() => {
    const handleFullscreenChange = () => {
      // Sync internal state with browser fullscreen state
      if (!document.fullscreenElement && internalFullscreen) {
        setInternalFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [internalFullscreen]);

  // Auto-scroll active thumbnail into view
  React.useEffect(() => {
    if (showThumbnails && thumbnailRefs.current[pageNumber]) {
      thumbnailRefs.current[pageNumber].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [pageNumber, showThumbnails]);

  // Highlight search results in PDF text layer
  React.useEffect(() => {
    if (!activeSearchQuery || !containerRef.current) {
      // Clean up highlights when search is cleared
      if (containerRef.current) {
        const spans = containerRef.current.querySelectorAll('.pdf-search-highlight, .pdf-search-highlight-active');
        spans.forEach(span => {
          span.classList.remove('pdf-search-highlight', 'pdf-search-highlight-active');
        });
      }
      return;
    }

    // Add custom styles for highlighting
    const styleId = 'pdf-search-highlight-style';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      .pdf-search-highlight {
        background-color: rgba(255, 235, 59, 0.4) !important;
        border-radius: 2px;
        padding: 2px 0;
      }
      .pdf-search-highlight-active {
        background-color: rgba(255, 152, 0, 0.6) !important;
        border-radius: 2px;
        padding: 2px 0;
      }
    `;

    // Function to highlight text in text layer
    const highlightTextInLayer = () => {
      if (!containerRef.current) return;

      const textLayers = containerRef.current.querySelectorAll('.react-pdf__Page__textContent');
      const query = activeSearchQuery.toLowerCase();

      console.log(`[PDF Highlight] Found ${textLayers.length} text layers, searching for "${query}"`);

      let highlightCount = 0;
      textLayers.forEach((textLayer) => {
        const spans = textLayer.querySelectorAll('span');
        spans.forEach((span) => {
          // Remove existing highlights
          span.classList.remove('pdf-search-highlight', 'pdf-search-highlight-active');

          // Check if this span contains the search query
          const text = span.textContent.toLowerCase();
          if (text.includes(query)) {
            span.classList.add('pdf-search-highlight');
            highlightCount++;
          }
        });
      });

      console.log(`[PDF Highlight] Applied ${highlightCount} highlights`);
    };

    // Try multiple times with increasing delays to catch text layers as they render
    const timeouts = [];
    timeouts.push(setTimeout(highlightTextInLayer, 100));
    timeouts.push(setTimeout(highlightTextInLayer, 300));
    timeouts.push(setTimeout(highlightTextInLayer, 600));
    timeouts.push(setTimeout(highlightTextInLayer, 1000));

    return () => {
      timeouts.forEach(id => clearTimeout(id));
    };
  }, [activeSearchQuery, visiblePages, scale]);

  return (
    <div className={`pdf-viewer-container ${actuallyFullscreen ? 'fixed inset-0 z-[9999]' : 'w-full h-full'} flex flex-col ${
      isDark ? 'bg-gray-900' : 'bg-gray-100'
    }`}>
      {/* Header - hidden in focus mode */}
      {!focusMode && (
        <div className={`flex items-center justify-between px-4 py-3 border-b ${
          isDark
            ? 'bg-gray-800 border-gray-700 text-gray-100'
            : 'bg-white border-gray-200 text-gray-900'
        }`}>
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold truncate max-w-md" title={fileName}>
            {fileName}
          </h2>
          {numPages && (
            <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Page {pageNumber} of {numPages}
            </span>
          )}
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center gap-2">
          {/* First Page */}
          <button
            onClick={firstPage}
            disabled={pageNumber <= 1}
            className={`p-2 rounded transition-colors ${
              isDark
                ? 'hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'
                : 'hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
            title="First page (Home)"
          >
            <ChevronsLeft size={20} />
          </button>

          {/* Previous Page */}
          <button
            onClick={previousPage}
            disabled={pageNumber <= 1}
            className={`p-2 rounded transition-colors ${
              isDark
                ? 'hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'
                : 'hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
            title="Previous page (←)"
          >
            <ChevronLeft size={20} />
          </button>

          {/* Page Input */}
          <input
            type="number"
            min="1"
            max={numPages || 1}
            value={pageNumber}
            onChange={(e) => {
              const page = parseInt(e.target.value, 10);
              if (page >= 1 && page <= numPages) {
                setPageNumber(page);
              }
            }}
            className={`w-16 px-2 py-1 text-center rounded border ${
              isDark
                ? 'bg-gray-700 border-gray-600 text-gray-100'
                : 'bg-white border-gray-300 text-gray-900'
            }`}
          />

          {/* Next Page */}
          <button
            onClick={nextPage}
            disabled={pageNumber >= numPages}
            className={`p-2 rounded transition-colors ${
              isDark
                ? 'hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'
                : 'hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
            title="Next page (→)"
          >
            <ChevronRight size={20} />
          </button>

          {/* Last Page */}
          <button
            onClick={lastPage}
            disabled={pageNumber >= numPages}
            className={`p-2 rounded transition-colors ${
              isDark
                ? 'hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'
                : 'hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
            title="Last page (End)"
          >
            <ChevronsRight size={20} />
          </button>

          <div className={`h-6 w-px ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />

          {/* Zoom Out */}
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className={`p-2 rounded transition-colors ${
              isDark
                ? 'hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'
                : 'hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
            title="Zoom out (-)"
          >
            <ZoomOut size={20} />
          </button>

          {/* Zoom Level */}
          <span className={`text-sm min-w-[4rem] text-center ${
            isDark ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {Math.round(scale * 100)}%
          </span>

          {/* Zoom In */}
          <button
            onClick={zoomIn}
            disabled={scale >= 3.0}
            className={`p-2 rounded transition-colors ${
              isDark
                ? 'hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'
                : 'hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
            title="Zoom in (+)"
          >
            <ZoomIn size={20} />
          </button>

          {/* Fit to Width */}
          <button
            onClick={fitToWidth}
            className={`p-2 rounded transition-colors ${
              isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
            title="Fit to width"
          >
            <Maximize2 size={20} />
          </button>

          {/* Fit to Page */}
          <button
            onClick={fitToPage}
            className={`p-2 rounded transition-colors ${
              isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
            title="Fit to page"
          >
            <Minimize2 size={20} />
          </button>

          <div className={`h-6 w-px ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />

          {/* View Mode Toggle */}
          <button
            onClick={() => setViewMode(prev => prev === 'single' ? 'continuous' : 'single')}
            className={`p-2 rounded transition-colors ${
              viewMode === 'continuous'
                ? isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
                : isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
            title={viewMode === 'single' ? 'Switch to continuous scrolling' : 'Switch to single page'}
          >
            <List size={20} />
          </button>

          {/* Outline/TOC Toggle */}
          {outline.length > 0 && (
            <button
              onClick={() => {
                setShowOutline(prev => !prev);
                if (showThumbnails) setShowThumbnails(false);
              }}
              className={`p-2 rounded transition-colors ${
                showOutline
                  ? isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
                  : isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
              }`}
              title={showOutline ? 'Hide table of contents' : 'Show table of contents'}
            >
              <BookOpen size={20} />
            </button>
          )}

          {/* Thumbnails Toggle */}
          <button
            onClick={() => {
              setShowThumbnails(prev => !prev);
              if (showOutline) setShowOutline(false);
            }}
            className={`p-2 rounded transition-colors ${
              showThumbnails
                ? isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
                : isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
            title={showThumbnails ? 'Hide thumbnails' : 'Show thumbnails'}
          >
            <LayoutGrid size={20} />
          </button>

          <div className={`h-6 w-px ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />

          {/* Search Toggle */}
          <button
            onClick={toggleSearch}
            className={`p-2 rounded transition-colors ${
              showSearch
                ? isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
                : isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
            title={showSearch ? 'Hide search' : 'Search PDF (Ctrl+F)'}
          >
            <Search size={20} />
          </button>

          {/* Download (web only) */}
          {!isDesktop() && (
            <button
              onClick={handleDownload}
              className={`p-2 rounded transition-colors ${
                isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
              }`}
              title="Download PDF"
            >
              <Download size={20} />
            </button>
          )}

          {/* Native Print (desktop only) */}
          {isDesktop() && (
            <button
              onClick={() => {
                console.log('[PDF] Open print dialog', {
                  filePath,
                  hasPath: !!filePath,
                  hasBytes: !!printableBytes,
                  bytesLength: printableBytes?.length
                });
                setShowPrintDialog(true);
              }}
              disabled={!canPrint}
              className={`p-2 rounded transition-colors ${
                canPrint
                  ? isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
                  : 'opacity-40 cursor-not-allowed'
              }`}
              title={canPrint ? 'Print PDF' : 'No file path available to print'}
            >
              <Printer size={20} />
            </button>
          )}

          {/* Close (only show in fullscreen mode) */}
          {actuallyFullscreen && onClose && (
            <button
              onClick={onClose}
              className={`p-2 rounded transition-colors ${
                isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
              }`}
              title="Close (Esc)"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>
      )}

      {/* Search Bar */}
      {showSearch && (
        <div className={`px-4 py-2 border-b ${
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2">
              <Search size={16} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in PDF..."
                className={`flex-1 px-2 py-1 text-sm rounded border ${
                  isDark
                    ? 'bg-gray-900 border-gray-600 text-gray-100 placeholder-gray-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  isDark
                    ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500'
                    : 'bg-blue-500 hover:bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-400'
                }`}
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </span>
            )}
            <button
              type="button"
              onClick={toggleSearch}
              className={`p-1 rounded transition-colors ${
                isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
              }`}
              title="Close search"
            >
              <X size={16} />
            </button>
          </form>
        </div>
      )}

      {/* PDF Content with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Search Results / Outline / Thumbnails */}
        {(showSearch || showOutline || showThumbnails) && !loading && !error && !showPrintDialog && (
          <div className={`w-64 overflow-y-auto border-r ${
            isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-100 border-gray-300'
          }`}>
            {/* Search Results Panel */}
            {showSearch && searchResults.length > 0 && (
              <div className="p-3">
                <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                  Search Results ({searchResults.length})
                </h3>
                <div className="space-y-2">
                  {searchResults.map((result, index) => (
                    <button
                      key={index}
                      onClick={() => goToSearchResult(index)}
                      className={`w-full text-left p-2 rounded transition-colors ${
                        index === currentSearchIndex
                          ? isDark ? 'bg-blue-600 border-2 border-blue-400' : 'bg-blue-500 border-2 border-blue-300'
                          : isDark ? 'hover:bg-gray-800 border-2 border-transparent' : 'hover:bg-gray-200 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className={`text-xs font-medium ${
                          index === currentSearchIndex
                            ? 'text-white'
                            : isDark ? 'text-blue-400' : 'text-blue-600'
                        }`}>
                          Page {result.pageNum}
                        </div>
                        <div className={`text-xs ${
                          index === currentSearchIndex
                            ? 'text-white'
                            : isDark ? 'text-gray-300' : 'text-gray-700'
                        } line-clamp-3`}>
                          {/* Show context with highlighted match */}
                          {result.context.substring(0, result.matchStart)}
                          <span className={`font-semibold ${
                            index === currentSearchIndex
                              ? 'bg-yellow-400 text-gray-900'
                              : isDark ? 'bg-yellow-500 text-gray-900' : 'bg-yellow-300 text-gray-900'
                          }`}>
                            {result.context.substring(result.matchStart, result.matchStart + result.matchLength)}
                          </span>
                          {result.context.substring(result.matchStart + result.matchLength)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Show message when search is active but no results */}
            {showSearch && searchResults.length === 0 && hasSearched && !isSearching && (
              <div className="p-3">
                <div className={`text-sm text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  No results found for "{searchQuery}"
                </div>
              </div>
            )}

            {/* Table of Contents */}
            {!showSearch && showOutline && outline.length > 0 && (
              <div className="p-3">
                <h3 className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                  Table of Contents
                </h3>
                <div className="space-y-1">
                  {outline.map((item, index) => (
                    <OutlineItem
                      key={index}
                      item={item}
                      onNavigate={scrollToPage}
                      pdfDocument={pdfDocumentRef.current}
                      isDark={isDark}
                      level={0}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Thumbnails */}
            {!showSearch && showThumbnails && numPages && pdfDocumentRef.current && (
              <div className="p-2 space-y-2">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    ref={(el) => thumbnailRefs.current[page] = el}
                    onClick={() => scrollToPage(page)}
                    className={`w-full p-2 rounded transition-colors ${
                      page === pageNumber
                        ? isDark ? 'bg-blue-600 border-2 border-blue-400' : 'bg-blue-500 border-2 border-blue-300'
                        : isDark ? 'hover:bg-gray-800 border-2 border-transparent' : 'hover:bg-gray-200 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className={`${isDark ? 'bg-white' : 'bg-gray-100'} mx-auto`}
                        style={{ width: THUMBNAIL_WIDTH }}
                      >
                        <Page
                          pageNumber={page}
                          pdf={pdfDocumentRef.current}
                          width={THUMBNAIL_WIDTH}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                      </div>
                      <div className={`text-xs font-medium ${
                        page === pageNumber
                          ? 'text-white'
                          : isDark ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {page}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Main PDF Viewer */}
        <div
          ref={containerRef}
          tabIndex="-1"
          className={`pdf-pages-container flex-1 overflow-auto ${isDark ? 'bg-gray-800' : 'bg-gray-200'} outline-none`}
          onContextMenu={handleContextMenu}
        >
          {error ? (
            <div className="flex items-center justify-center h-full">
              <div className={`text-center p-8 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                <p className="text-lg font-semibold mb-2">Error Loading PDF</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          ) : (
            <div className={viewMode === 'continuous' ? 'space-y-4 py-2.5' : 'flex justify-center py-2.5'}>
              <Document
                file={pdfFile}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex items-center justify-center h-full">
                    <div className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current mx-auto mb-4" />
                      <p>Loading PDF...</p>
                    </div>
                  </div>
                }
                options={pdfOptions}
              >
                {showPrintDialog ? (
                  <div className="flex items-center justify-center h-64">
                    <div className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      <p className="text-sm">PDF rendering paused while print dialog is open.</p>
                    </div>
                  </div>
                ) : viewMode === 'continuous' ? (
                  // Continuous scrolling mode - render visible pages only
                  Array.from({ length: numPages || 0 }, (_, i) => i + 1).map((page) => (
                    <div
                      key={page}
                      ref={(el) => pageRefs.current[page] = el}
                      data-page={page}
                      className="flex flex-col items-center px-2.5"
                      style={{
                        minHeight: pageHeight ? `${pageHeight * scale + 20}px` : '800px'
                      }}
                    >
                      {visiblePages.has(page) ? (
                        <Page
                          pageNumber={page}
                          scale={scale}
                          renderTextLayer={true}
                          renderAnnotationLayer={false}
                          className={`shadow-lg border rounded-lg ${
                            isDark ? 'border-gray-600' : 'border-gray-300'
                          }`}
                          onRenderError={(error) => {
                            console.error(`[PDF] Failed to render page ${page}:`, error);
                          }}
                        />
                      ) : (
                        // Placeholder for non-visible pages
                        <div
                          className={`flex items-center justify-center shadow-lg border rounded-lg ${
                            isDark ? 'bg-white border-gray-600' : 'bg-white border-gray-300'
                          }`}
                          style={{
                            width: pageWidth ? `${pageWidth * scale}px` : '600px',
                            height: pageHeight ? `${pageHeight * scale}px` : '800px'
                          }}
                        >
                          <span className="text-gray-400">Page {page}</span>
                        </div>
                      )}
                      {page < (numPages || 0) && (
                        <div
                          className={`mt-4 h-2 rounded-full ${
                            isDark ? 'bg-gray-700' : 'bg-gray-300'
                          }`}
                          style={{
                            width: pageWidth ? `${pageWidth * scale}px` : '600px'
                          }}
                        />
                      )}
                    </div>
                  ))
                ) : (
                  // Single page mode
                  <div className="pdf-page flex justify-center">
                    <Page
                      pageNumber={pageNumber}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={false}
                      className="shadow-lg"
                      onRenderError={(error) => {
                        console.error(`[PDF] Failed to render page ${pageNumber}:`, error);
                      }}
                    />
                  </div>
                )}
              </Document>
            </div>
          )}
        </div>
      </div>

      {/* Footer - hidden in focus mode */}
      {!focusMode && (
        <div className={`px-4 py-2 border-t text-xs ${
          isDark
            ? 'bg-gray-800 border-gray-700 text-gray-400'
            : 'bg-white border-gray-200 text-gray-600'
        }`}>
          <div className="flex justify-between items-center">
            <div>
              Arrow keys: navigate • +/-: zoom • Ctrl+Scroll: zoom • Esc: close
            </div>
            <div>
              {fileContent && `${(fileContent.length / 1024 / 1024).toFixed(2)} MB`}
            </div>
          </div>
        </div>
      )}

      {showPrintDialog && (
        <NativePrintDialog
          filePath={filePath}
          fileBytes={printableBytes}
          theme={theme}
          onClose={() => setShowPrintDialog(false)}
        />
      )}

      {contextMenu && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          className="fixed z-[9999] min-w-[180px] rounded-lg border border-gray-700 bg-gray-900 shadow-2xl py-1 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              if (!canPrint) {
                return;
              }
              setShowPrintDialog(true);
              setContextMenu(null);
            }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
              canPrint ? 'text-gray-100 hover:bg-gray-800' : 'text-gray-500 cursor-not-allowed'
            }`}
            disabled={!canPrint}
            title={canPrint ? 'Print PDF' : 'No file path available to print'}
          >
            <Printer size={14} />
            Print
          </button>
        </div>,
        document.body
      )}

      {/* Floating Focus Mode Button - always visible */}
      {!showPrintDialog && (
        <button
          onClick={toggleFocusMode}
          className={`fixed top-4 right-4 p-3 rounded-full shadow-lg transition-all z-50 ${
            focusMode
              ? isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
              : isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
          }`}
          title={focusMode ? "Exit focus mode" : "Focus mode (hide panels)"}
        >
          {focusMode ? <EyeOff size={24} className="text-white" /> : <Eye size={24} className={isDark ? 'text-gray-200' : 'text-gray-700'} />}
        </button>
      )}
    </div>
  );
};

// Helper component for rendering outline items recursively
const OutlineItem = ({ item, onNavigate, pdfDocument, isDark, level = 0 }) => {
  const [expanded, setExpanded] = useState(level === 0); // Only expand top level by default

  const handleClick = async () => {
    if (item.dest && pdfDocument) {
      try {
        // dest can be a string (named destination) or array (explicit destination)
        let dest = item.dest;

        // If it's a string, resolve it to an explicit destination
        if (typeof dest === 'string') {
          dest = await pdfDocument.getDestination(dest);
        }

        // dest is now an array like [pageRef, {name: 'XYZ'}, left, top, zoom]
        // The first element is a page reference object
        if (dest && dest[0]) {
          const pageRef = dest[0];
          const pageIndex = await pdfDocument.getPageIndex(pageRef);
          const pageNumber = pageIndex + 1; // Convert 0-indexed to 1-indexed

          console.log('[PDF] TOC navigation:', {
            title: item.title,
            dest: item.dest,
            pageIndex,
            pageNumber
          });

          onNavigate(pageNumber);
        } else {
          console.warn('[PDF] Invalid destination format:', dest);
        }
      } catch (error) {
        console.error('[PDF] Failed to navigate to destination:', error);
      }
    }
  };

  const hasChildren = item.items && item.items.length > 0;

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
          isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-200 text-gray-700'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {hasChildren && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="inline-block mr-1 cursor-pointer"
          >
            {expanded ? '▼' : '▶'}
          </span>
        )}
        <span className="truncate">{item.title}</span>
      </button>
      {hasChildren && expanded && (
        <div>
          {item.items.map((child, index) => (
            <OutlineItem
              key={index}
              item={child}
              onNavigate={onNavigate}
              pdfDocument={pdfDocument}
              isDark={isDark}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PDFViewer;
