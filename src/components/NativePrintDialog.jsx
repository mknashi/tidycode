import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PDFDocument } from 'pdf-lib';
import PdfVirtualPreview from './PdfVirtualPreview.jsx';
import { readFile } from '../utils/fileReader.js';
import { isDesktop } from '../utils/platform.js';

const LARGE_PDF_BYTES = 5 * 1024 * 1024;
const WINDOWS_PREVIEW_LIMIT = 20;
const WINDOWS_LARGE_PREVIEW_LIMIT = 10;
const PREVIEW_PAGE_STEP = 20;

const NativePrintDialog = ({ filePath, fileBytes, theme, onClose }) => {
  const [pdfBuffer, setPdfBuffer] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [rangeMode, setRangeMode] = useState('all');
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [printers, setPrinters] = useState([]);
  const [printerName, setPrinterName] = useState('');
  const [mediaOptions, setMediaOptions] = useState([]);
  const [paperSize, setPaperSize] = useState('');
  const [copies, setCopies] = useState(1);
  const [duplex, setDuplex] = useState('none');
  const [isPrinting, setIsPrinting] = useState(false);
  const [log, setLog] = useState('');
  const [pdfSizeBytes, setPdfSizeBytes] = useState(0);
  const previewContainerRef = useRef(null);
  const [previewContainerWidth, setPreviewContainerWidth] = useState(0);
  const printersLoadRef = useRef({ inFlight: false, loaded: false });
  const mediaLoadRef = useRef({ inFlight: null, cache: new Map() });
  const lastLoadRef = useRef({ key: null });
  const lastPageCountRef = useRef({ key: null });
  const cachedBytesRef = useRef(null);
  const isWindows = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return false;
    }
    return /Windows/i.test(navigator.userAgent);
  }, []);
  const [previewEnabled, setPreviewEnabled] = useState(!isWindows);
  const [previewPageLimit, setPreviewPageLimit] = useState(
    isWindows ? WINDOWS_PREVIEW_LIMIT : 0
  );
  const previewStep = isWindows ? 10 : PREVIEW_PAGE_STEP;
  const previewAspectRatio = 1.294;
  const previewPageCount = useMemo(
    () => Math.min(numPages, previewPageLimit || numPages),
    [numPages, previewPageLimit]
  );

  const isDark = theme === 'dark';

  const defaultPrinter = useMemo(
    () => printers.find((printer) => printer.isDefault)?.name ?? '',
    [printers]
  );

  const activePrinter = useMemo(
    () => printerName || defaultPrinter,
    [printerName, defaultPrinter]
  );

  const fallbackPrinter = useMemo(
    () => printers[0]?.name || '',
    [printers]
  );

  const previewMaxWidth = useMemo(() => (isWindows ? 180 : 200), [isWindows]);
  const previewWidthRatio = useMemo(() => 1, []);
  const previewPageScaleX = useMemo(() => 1, []);

  const hasBytes = useMemo(
    () => !!fileBytes && (fileBytes.length ?? 0) > 0,
    [fileBytes]
  );

  const pdfFile = useMemo(() => {
    if (!pdfBuffer) {
      return null;
    }
    return { data: pdfBuffer };
  }, [pdfBuffer]);

  useEffect(() => {
    console.log('[PrintPreview] Dialog mounted', {
      filePath,
      hasBytes,
      previewEnabled,
      isWindows
    });
    return () => {
      console.log('[PrintPreview] Dialog unmounted');
    };
  }, []);

  useEffect(() => {
    console.log('[PrintPreview] Preview toggle', {
      previewEnabled,
      hasPdfBuffer: !!pdfBuffer
    });
  }, [previewEnabled, pdfBuffer]);

  useEffect(() => {
    console.log('[PrintPreview] Buffer state', {
      hasBuffer: !!pdfBuffer,
      bufferLength: pdfBuffer?.length,
      previewEnabled
    });
  }, [pdfBuffer, previewEnabled]);

  useEffect(() => {
    const node = previewContainerRef.current;
    if (!node) {
      return;
    }
    const update = () => {
      setPreviewContainerWidth(node.clientWidth || 0);
    };
    update();
    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fileLabel = useMemo(() => {
    if (!filePath) {
      return 'No file selected';
    }
    const parts = filePath.split(/[/\\\\]/);
    return parts[parts.length - 1] || filePath;
  }, [filePath]);

  useEffect(() => {
    if (!isWindows) {
      setPreviewPageLimit(numPages);
      return;
    }
    const baseLimit =
      pdfSizeBytes > LARGE_PDF_BYTES ? WINDOWS_LARGE_PREVIEW_LIMIT : WINDOWS_PREVIEW_LIMIT;
    setPreviewPageLimit((prev) => {
      if (numPages > 0) {
        return Math.min(Math.max(prev, baseLimit), numPages);
      }
      return Math.max(prev, baseLimit);
    });
  }, [isWindows, numPages, pdfSizeBytes]);


  useEffect(() => {
    if (!filePath && !hasBytes) {
      setPdfBuffer(null);
      setPdfError(null);
      setNumPages(0);
      setSelectedPages(new Set());
      setLog('No file selected.');
      lastLoadRef.current.key = null;
      lastPageCountRef.current.key = null;
      return;
    }
    const loadPdf = async () => {
      const loadStart = performance.now();
      setPdfError(null);
      if (isDesktop() && filePath && !isWindows) {
        try {
          await invoke('store_security_bookmark', { filePath });
        } catch (error) {
          console.warn('[print] Failed to store security bookmark:', error);
        }
      }
      if (filePath) {
        setLog('Loading PDF…');
        const key = `path:${filePath}`;
        if (lastLoadRef.current.key === key) {
          return;
        }
        lastLoadRef.current.key = key;
        if (isWindows && !previewEnabled) {
          cachedBytesRef.current = null;
          setPdfSizeBytes(0);
          setPdfBuffer(null);
          setLog(`Loaded ${filePath}`);
          console.log('[PrintPreview] Loaded PDF from path (deferred preview)', { filePath });
          setNumPages(0);
          setSelectedPages(new Set());
          setRangeMode('all');
          console.log('[PrintPreview] Load PDF from path done', {
            ms: Math.round(performance.now() - loadStart),
            bytes: 0
          });
          return;
        }
        const bytes = await readFile(filePath);
        const normalized = normalizeBytes(bytes);
        const header = getHeader(normalized);
        cachedBytesRef.current = normalized;
        setPdfSizeBytes(normalized.byteLength);
        setPdfBuffer(previewEnabled ? normalized : null);
        setLog(`Loaded ${filePath} (${normalized.byteLength} bytes, header: ${header})`);
        console.log('[PrintPreview] Loaded PDF from path', {
          filePath,
          bytes: normalized.byteLength,
          header
        });
        console.log('[PrintPreview] Load PDF from path done', {
          ms: Math.round(performance.now() - loadStart),
          bytes: normalized.byteLength
        });
        if (!previewEnabled) {
          if (!isWindows) {
            await setPageCountFromBytes(normalized, key);
          } else {
            setNumPages(0);
            setSelectedPages(new Set());
            setRangeMode('all');
          }
        }
        return;
      }
      if (hasBytes) {
        setLog('Loading in-memory PDF…');
        const normalized = normalizeBytes(fileBytes);
        const header = getHeader(normalized);
        const key = `mem:${normalized.byteLength}:${header}`;
        if (lastLoadRef.current.key === key) {
          return;
        }
        lastLoadRef.current.key = key;
        cachedBytesRef.current = normalized;
        setPdfSizeBytes(normalized.byteLength);
        setPdfBuffer(previewEnabled ? normalized : null);
        setLog(`Loaded in-memory PDF (${normalized.byteLength} bytes, header: ${header})`);
        console.log('[PrintPreview] Loaded in-memory PDF', {
          bytes: normalized.byteLength,
          header
        });
        if (!previewEnabled) {
          if (!isWindows) {
            await setPageCountFromBytes(normalized, key);
          } else {
            setNumPages(0);
            setSelectedPages(new Set());
            setRangeMode('all');
          }
        }
        console.log('[PrintPreview] Load in-memory PDF done', {
          ms: Math.round(performance.now() - loadStart),
          bytes: normalized.byteLength
        });
        return;
      }
      setLog('No file selected.');
    };

    loadPdf().catch((error) => {
      setLog(`Failed to load PDF: ${String(error)}`);
      console.error('[PrintPreview] Load PDF failed', error);
    });
  }, [filePath, fileBytes, hasBytes, previewEnabled]);

  useEffect(() => {
    const loadPrinters = async () => {
      if (!isDesktop()) {
        return;
      }
      if (printersLoadRef.current.inFlight || printersLoadRef.current.loaded) {
        return;
      }
      printersLoadRef.current.inFlight = true;
      try {
        const list = await invoke('plugin:native-pdf-print|get_printers');
        setPrinters(list);
        const defaultName = list.find((printer) => printer.isDefault)?.name;
        if (defaultName && !printerName) {
          setPrinterName(defaultName);
        } else if (list.length > 0 && !printerName) {
          setPrinterName(list[0].name);
        }
        printersLoadRef.current.loaded = true;
        console.log('[PrintPreview] Loaded printers', {
          count: list.length,
          defaultName
        });
      } catch (error) {
        setLog(`Failed to load printers: ${String(error)}`);
        console.error('[PrintPreview] Failed to load printers', error);
        printersLoadRef.current.loaded = false;
      } finally {
        printersLoadRef.current.inFlight = false;
      }
    };

    loadPrinters().catch(() => undefined);
  }, [printerName]);

  useEffect(() => {
    const targetPrinter = activePrinter || fallbackPrinter || null;
    if (!targetPrinter) {
      return;
    }
    const cached = mediaLoadRef.current.cache.get(targetPrinter);
    if (cached) {
      setMediaOptions(cached);
      const defaultMedia = cached.find((item) => item.isDefault)?.id ?? '';
      const fallbackMedia = cached[0]?.id ?? '';
      const nextMedia = defaultMedia || fallbackMedia;
      if (nextMedia && (!paperSize || !cached.some((item) => item.id === paperSize))) {
        setPaperSize(nextMedia);
      }
      return;
    }
    setMediaOptions([]);
    setPaperSize('');
    ensureMediaLoaded(targetPrinter).catch(() => undefined);
  }, [activePrinter, fallbackPrinter, paperSize]);

  const ensureMediaLoaded = async (targetPrinter) => {
    if (!isDesktop()) {
      return;
    }
    if (!targetPrinter) {
      return;
    }
    const cacheKey = targetPrinter;
    if (mediaLoadRef.current.cache.has(cacheKey)) {
      return;
    }
    if (mediaLoadRef.current.inFlight === cacheKey) {
      return;
    }
    mediaLoadRef.current.inFlight = cacheKey;
    try {
      const list = await invoke('plugin:native-pdf-print|get_printer_media', {
        printerName: targetPrinter
      });
      mediaLoadRef.current.cache.set(cacheKey, list);
      setMediaOptions(list);
      const defaultMedia = list.find((item) => item.isDefault)?.id ?? '';
      const fallbackMedia = list[0]?.id ?? '';
      const nextMedia = defaultMedia || fallbackMedia;
      if (nextMedia && (!paperSize || !list.some((item) => item.id === paperSize))) {
        setPaperSize(nextMedia);
      }
      console.log('[PrintPreview] Loaded paper sizes', {
        printerName: targetPrinter,
        count: list.length,
        defaultMedia
      });
    } catch (error) {
      setMediaOptions([]);
      setPaperSize('');
      setLog(`Failed to load paper sizes: ${String(error)}`);
      console.error('[PrintPreview] Failed to load paper sizes', error);
    } finally {
      if (mediaLoadRef.current.inFlight === cacheKey) {
        mediaLoadRef.current.inFlight = null;
      }
    }
  };

  function applyPageCount(count) {
    setNumPages(count);
    const pages = new Set();
    for (let i = 1; i <= count; i += 1) {
      pages.add(i);
    }
    setSelectedPages(pages);
    setRangeStart(1);
    setRangeEnd(count);
    setRangeMode('all');
  }

  const setPageCountFromBytes = async (bytes, key) => {
    if (lastPageCountRef.current.key === key) {
      return;
    }
    lastPageCountRef.current.key = key;
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      applyPageCount(doc.getPageCount());
    } catch (error) {
      console.warn('[PrintPreview] Failed to read page count:', error);
    }
  };

  function togglePage(page) {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(page)) {
        next.delete(page);
      } else {
        next.add(page);
      }
      return next;
    });
  }

  const handleSelectAll = () => {
    if (!numPages) {
      return;
    }
    const pages = new Set();
    for (let i = 1; i <= numPages; i += 1) {
      pages.add(i);
    }
    setSelectedPages(pages);
  };

  const handleClearSelection = () => {
    setSelectedPages(new Set());
  };

  const handleApplyRange = () => {
    if (!numPages) {
      return;
    }
    const start = Math.max(1, Math.min(rangeStart, numPages));
    const end = Math.max(1, Math.min(rangeEnd, numPages));
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    const range = new Set();
    for (let i = from; i <= to; i += 1) {
      range.add(i);
    }
    setSelectedPages(range);
    setRangeMode('range');
  };

  const handleRefreshPrinters = async () => {
    try {
      const list = await invoke('plugin:native-pdf-print|get_printers');
      setPrinters(list);
      const defaultName = list.find((printer) => printer.isDefault)?.name;
      if (defaultName) {
        setPrinterName(defaultName);
      }
      mediaLoadRef.current.cache.clear();
      setLog(`Loaded ${list.length} printers`);
    } catch (error) {
      setLog(`Failed to load printers: ${String(error)}`);
    }
  };

  const handlePrint = async () => {
    if (!isDesktop()) {
      setLog('Native printing is only available in the desktop app.');
      return;
    }
    if (isPrinting) {
      return;
    }
    if (!numPages && rangeMode !== 'all') {
      setLog('Provide a PDF path first.');
      return;
    }

    const orderedPages =
      rangeMode === 'all' && numPages
        ? Array.from({ length: numPages }, (_, index) => index + 1)
        : Array.from(selectedPages).sort((a, b) => a - b);
    if (rangeMode !== 'all' && orderedPages.length === 0) {
      setLog('Select at least one page.');
      return;
    }
    if (rangeMode !== 'all' && !numPages) {
      setLog('Load preview to enable manual page selection.');
      return;
    }

    const printStart = performance.now();
    try {
      setIsPrinting(true);
      setLog('Preparing print…');
      const canUsePath = rangeMode === 'all' && !!filePath;
      const prepStart = performance.now();
      let freshBytes = canUsePath
        ? null
        : hasBytes
          ? safeCopyBytes(fileBytes)
          : safeCopyBytes(await readFile(filePath));
      if (!freshBytes && !canUsePath && filePath) {
        freshBytes = safeCopyBytes(await readFile(filePath));
      }
      if (freshBytes) {
        const header = getHeader(freshBytes);
        if (header !== '%PDF' && filePath) {
          console.warn('[PrintPreview] Bytes missing PDF header, reloading from path', {
            header,
            length: freshBytes.length
          });
          freshBytes = safeCopyBytes(await readFile(filePath));
        }
        const finalHeader = getHeader(freshBytes);
        if (finalHeader !== '%PDF') {
          throw new Error(`Failed to read PDF bytes (header: ${finalHeader || 'none'})`);
        }
      }
      console.log('[PrintPreview] Print request', {
        printerName: activePrinter || null,
        copies,
        duplex,
        paperSize: paperSize || null,
        bytes: freshBytes ? freshBytes.length : 0,
        selectedPages: orderedPages,
        canUsePath
      });
      let outputBytes = freshBytes;
      if (rangeMode !== 'all' && outputBytes) {
        const source = await PDFDocument.load(freshBytes, { ignoreEncryption: true });
        const target = await PDFDocument.create();
        const pageIndices = orderedPages.map((page) => page - 1);
        const copiedPages = await target.copyPages(source, pageIndices);
        copiedPages.forEach((page) => target.addPage(page));
        outputBytes = await target.save();
      }
      console.log('[PrintPreview] Print prep done', {
        prepMs: Math.round(performance.now() - prepStart),
        bytes: outputBytes ? outputBytes.length : 0
      });

      const invokeStart = performance.now();
      const printPromise = canUsePath
        ? invoke('plugin:native-pdf-print|print_pdf', {
            options: {
              path: filePath,
              printerName: activePrinter || null,
              copies,
              duplex,
              paperSize: paperSize || null,
              removeAfterPrint: false
            }
          })
        : invoke('plugin:native-pdf-print|print_pdf_bytes', {
            options: {
              dataBase64: toBase64(outputBytes),
              printerName: activePrinter || null,
              copies,
              duplex,
              paperSize: paperSize || null,
              removeAfterPrint: true
            }
          });
      setLog('Print job submitted. Printing continues in the background.');
      setIsPrinting(false);
      printPromise
        .then((result) => {
          setLog(
            `Print queued on ${result.printer}: ${result.message} (copies: ${copies}, duplex: ${duplex})`
          );
          console.log('[PrintPreview] Print queued', result);
          console.log('[PrintPreview] Print timings', {
            totalMs: Math.round(performance.now() - printStart),
            invokeMs: Math.round(performance.now() - invokeStart)
          });
        })
        .catch((error) => {
          const detail = formatError(error);
          setLog(`Print failed: ${detail}`);
          console.error('[PrintPreview] Print failed', detail, error);
          console.log('[PrintPreview] Print timings', {
            totalMs: Math.round(performance.now() - printStart),
            invokeMs: Math.round(performance.now() - invokeStart)
          });
        });
    } catch (error) {
      const detail = formatError(error);
      setLog(`Print failed: ${detail}`);
      console.error('[PrintPreview] Print failed', detail, error);
      console.log('[PrintPreview] Print timings', {
        totalMs: Math.round(performance.now() - printStart)
      });
      setIsPrinting(false);
    }
  };

  const surfaceClasses = isDark
    ? 'bg-gray-900 text-gray-100 border-gray-700'
    : 'bg-white text-gray-900 border-gray-200';

  const panelClasses = isDark ? 'bg-gray-900/90 border-gray-700' : 'bg-white/90 border-gray-200';
  const handlePreviewLoadSuccess = useCallback(
    (pdf) => {
      console.log('[PrintPreview] Preview loaded', { pages: pdf.numPages });
      applyPageCount(pdf.numPages);
      setPdfError(null);
    },
    [applyPageCount]
  );
  const handlePreviewLoadError = useCallback((error) => {
    console.error('[PrintPreview] Preview load error', error);
    setPdfError(String(error));
  }, []);

  const handleLoadPreview = useCallback(async () => {
    const loadStart = performance.now();
    setPreviewEnabled(true);
    if (cachedBytesRef.current) {
      setPdfBuffer(cachedBytesRef.current);
      console.log('[PrintPreview] Load preview used cached bytes', {
        ms: Math.round(performance.now() - loadStart)
      });
      return;
    }
    if (!filePath) {
      setLog('No file selected.');
      return;
    }
    try {
      const bytes = safeCopyBytes(await readFile(filePath));
      if (!bytes) {
        throw new Error('Failed to load preview bytes.');
      }
      cachedBytesRef.current = bytes;
      setPdfSizeBytes(bytes.byteLength);
      setPdfBuffer(bytes);
      console.log('[PrintPreview] Load preview read path', {
        ms: Math.round(performance.now() - loadStart),
        bytes: bytes.byteLength
      });
    } catch (error) {
      const detail = String(error);
      setPdfError(detail);
      setLog(`Failed to load preview: ${detail}`);
    }
  }, [filePath]);

  useEffect(() => {
    console.log('[PrintPreview] Preview state', {
      previewEnabled,
      hasPdfFile: !!pdfFile,
      numPages,
      previewPageCount
    });
  }, [previewEnabled, pdfFile, numPages, previewPageCount]);
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className={`w-[72%] max-w-4xl rounded-2xl border ${surfaceClasses} shadow-2xl flex flex-col`}
        style={{ height: '85vh' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/50">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-400">Print</p>
            <h2 className="text-lg font-semibold">Native PDF Print</h2>
          </div>
          <button
            onClick={onClose}
            className={`px-3 py-1 rounded text-sm ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-[0.6fr_1.4fr] gap-4 p-4 flex-1 min-h-0">
          <div className={`rounded-xl border ${panelClasses} p-2 flex flex-col min-h-0`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Preview</h3>
              <span className="text-xs text-gray-400">{selectedPages.size} selected</span>
            </div>
            <div ref={previewContainerRef} className="flex-1 min-h-0 overflow-hidden w-full">
              {previewEnabled && pdfFile ? (
                <PdfVirtualPreview
                  pdfFile={pdfFile}
                  numPages={previewPageCount}
                  isDark={isDark}
                  selectedPages={selectedPages}
                  onTogglePage={(pageNumber) => {
                    setRangeMode('manual');
                    togglePage(pageNumber);
                  }}
                  onLoadSuccess={handlePreviewLoadSuccess}
                  onLoadError={handlePreviewLoadError}
                  maxPageWidth={previewMaxWidth}
                  maxWidthRatio={previewWidthRatio}
                  pageScaleX={previewPageScaleX}
                  pageAspectRatio={previewAspectRatio}
                  pageBuffer={2}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  containerWidth={previewContainerWidth}
                  disableVirtualization={true}
                />
              ) : null}
              {previewEnabled && numPages > previewPageCount ? (
                <div className="text-xs text-gray-400 pt-2">
                  Showing {previewPageCount} of {numPages} pages.
                  <button
                    onClick={() =>
                      setPreviewPageLimit((prev) => Math.min(numPages, prev + previewStep))
                    }
                    className={`ml-2 px-2 py-1 rounded text-[11px] font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-200'}`}
                  >
                    Load more
                  </button>
                </div>
              ) : pdfError ? (
                <p className="text-sm text-red-400">{pdfError}</p>
              ) : !previewEnabled ? (
                <div className="text-sm text-gray-400 space-y-3">
                  <p>Preview rendering is paused on Windows.</p>
                  <button
                    onClick={handleLoadPreview}
                    className={`px-3 py-1 rounded text-xs font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-200'}`}
                  >
                    Load preview
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Waiting for a PDF path.</p>
              )}
            </div>
          </div>

          <div className={`rounded-xl border ${panelClasses} p-4 flex flex-col min-h-0`}>
            <div className="text-xs text-gray-400 mb-2 truncate" title={filePath || ''}>
              {fileLabel}
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 min-h-0">
              <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-800/60' : 'bg-gray-100'}`}>
                <p className="text-sm font-semibold mb-3">Pages</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {['all', 'range', 'manual'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setRangeMode(mode);
                        if (mode === 'all') {
                          handleSelectAll();
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        rangeMode === mode
                          ? 'bg-amber-400 text-gray-900'
                          : isDark
                            ? 'bg-gray-700 text-gray-200'
                            : 'bg-white text-gray-600'
                      }`}
                    >
                      {mode === 'all' ? 'All' : mode === 'range' ? 'Range' : 'Manual'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-gray-400">
                    From
                    <input
                      type="number"
                      min={1}
                      value={rangeStart}
                      onChange={(event) => setRangeStart(Number(event.target.value) || 1)}
                      disabled={rangeMode === 'manual'}
                      className={`mt-1 w-full rounded px-2 py-1 text-sm ${inputClass(isDark)}`}
                    />
                  </label>
                  <label className="text-xs text-gray-400">
                    To
                    <input
                      type="number"
                      min={1}
                      value={rangeEnd}
                      onChange={(event) => setRangeEnd(Number(event.target.value) || 1)}
                      disabled={rangeMode === 'manual'}
                      className={`mt-1 w-full rounded px-2 py-1 text-sm ${inputClass(isDark)}`}
                    />
                  </label>
                  <div className="col-span-2 flex gap-2">
                    <button
                      onClick={handleApplyRange}
                      disabled={rangeMode === 'manual'}
                      className={`px-3 py-1 rounded text-xs font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-200'}`}
                    >
                      Apply
                    </button>
                    <button
                      onClick={handleClearSelection}
                      className={`px-3 py-1 rounded text-xs font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-200'}`}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-start">
                <label className="col-span-2 text-xs text-gray-400">
                  Printer
                  <select
                    value={printerName}
                    onChange={(event) => setPrinterName(event.target.value)}
                    className={`mt-1 w-full rounded px-2 py-1 text-sm ${inputClass(isDark)}`}
                  >
                    <option value="">Default printer ({defaultPrinter || 'unknown'})</option>
                    {printers.map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.name} ({printer.status})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="col-span-2">
                  <button
                    onClick={handleRefreshPrinters}
                    className={`px-3 py-1 rounded text-xs font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-200'}`}
                  >
                    Refresh printers
                  </button>
                </div>
                <label className="text-xs text-gray-400">
                  Copies
                  <input
                    type="number"
                    min={1}
                    value={copies}
                    onChange={(event) => setCopies(Math.max(1, Number(event.target.value) || 1))}
                    className={`mt-1 w-full rounded px-2 py-1 text-sm ${inputClass(isDark)}`}
                  />
                </label>
                <label className="text-xs text-gray-400">
                  Duplex
                  <select
                    value={duplex}
                    onChange={(event) => setDuplex(event.target.value)}
                    className={`mt-1 w-full rounded px-2 py-1 text-sm ${inputClass(isDark)}`}
                  >
                    <option value="none">Off</option>
                    <option value="long">Long edge</option>
                    <option value="short">Short edge</option>
                  </select>
                </label>
                <label className="col-span-2 text-xs text-gray-400">
                  Paper size
                  <select
                    value={paperSize}
                    onChange={(event) => setPaperSize(event.target.value)}
                    onFocus={() => ensureMediaLoaded(activePrinter || fallbackPrinter || null)}
                    onClick={() => ensureMediaLoaded(activePrinter || fallbackPrinter || null)}
                    className={`mt-1 w-full rounded px-2 py-1 text-sm ${inputClass(isDark)}`}
                  >
                    <option value="">Auto</option>
                    {mediaOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {log && (
                <div className={`rounded-lg px-3 py-2 text-xs ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                  {log}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-700/50">
              <button
                onClick={handlePrint}
                className="w-full rounded-lg bg-amber-400 py-2 text-sm font-semibold text-gray-900 hover:bg-amber-300"
              >
                {isPrinting ? 'Printing…' : 'Print Selected Pages'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function inputClass(isDark) {
  return isDark
    ? 'bg-gray-800 border border-gray-700 text-gray-100'
    : 'bg-white border border-gray-300 text-gray-900';
}

function toBase64(data) {
  const bytes = safeCopyBytes(data);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function normalizeBytes(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (Array.isArray(bytes)) {
    return Uint8Array.from(bytes);
  }
  return new Uint8Array(bytes);
}

function safeCopyBytes(bytes) {
  if (!bytes) {
    return null;
  }
  try {
    const normalized = normalizeBytes(bytes);
    return new Uint8Array(normalized);
  } catch (error) {
    console.warn('[PrintPreview] Failed to copy bytes (detached buffer?)', error);
    return null;
  }
}

function formatError(error) {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message || String(error);
  }
  try {
    return JSON.stringify(error);
  } catch (serializeError) {
    return String(error);
  }
}

function getHeader(bytes) {
  const safeBytes = safeCopyBytes(bytes);
  if (!safeBytes) {
    return '';
  }
  return Array.from(safeBytes.slice(0, 4))
    .map((value) => String.fromCharCode(value))
    .join('');
}

export default NativePrintDialog;
