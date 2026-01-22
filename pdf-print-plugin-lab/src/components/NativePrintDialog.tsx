import { useEffect, useMemo, useRef, useState } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { PDFDocument } from 'pdf-lib';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy
} from 'pdfjs-dist/legacy/build/pdf';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status: string;
}

interface PrintResult {
  jobId?: number;
  printer: string;
  message: string;
}

interface MediaOption {
  id: string;
  label: string;
  isDefault: boolean;
}

function PageCanvas({
  document,
  pageNumber,
  selected,
  onToggle
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  selected: boolean;
  onToggle: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const render = async () => {
      const page: PDFPageProxy = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.6 });
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }
      const renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
    };

    render().catch(() => undefined);

    return () => undefined;
  }, [document, pageNumber]);

  return (
    <div className={`page-card ${selected ? 'selected' : ''}`}>
      <label className="page-header">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(pageNumber)}
        />
        <span>Page {pageNumber}</span>
      </label>
      <canvas ref={canvasRef} />
    </div>
  );
}

export default function NativePrintDialog({ filePath }: { filePath: string }) {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [printerName, setPrinterName] = useState<string>('');
  const [log, setLog] = useState<string>('');
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isPrinting, setIsPrinting] = useState(false);
  const [copies, setCopies] = useState(1);
  const [duplex, setDuplex] = useState<'none' | 'long' | 'short'>('none');
  const [paperSize, setPaperSize] = useState<string>('');
  const [mediaOptions, setMediaOptions] = useState<MediaOption[]>([]);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [rangeMode, setRangeMode] = useState<'all' | 'range' | 'manual'>('all');

  const defaultPrinter = useMemo(
    () => printers.find((printer) => printer.isDefault)?.name ?? '',
    [printers]
  );

  const activePrinter = useMemo(
    () => printerName || defaultPrinter,
    [printerName, defaultPrinter]
  );

  useEffect(() => {
    const loadPrinters = async () => {
      try {
        const list = await invoke<PrinterInfo[]>('plugin:native-pdf-print|get_printers');
        setPrinters(list);
        const defaultName = list.find((printer) => printer.isDefault)?.name;
        if (defaultName) {
          setPrinterName(defaultName);
        }
      } catch (error) {
        setLog(`Failed to load printers: ${String(error)}`);
      }
    };

    loadPrinters().catch(() => undefined);
  }, []);

  useEffect(() => {
    const loadMedia = async () => {
      try {
        const list = await invoke<MediaOption[]>(
          'plugin:native-pdf-print|get_printer_media',
          { printerName: activePrinter || null }
        );
        setMediaOptions(list);
        const defaultMedia = list.find((item) => item.isDefault)?.id ?? '';
        setPaperSize(defaultMedia);
      } catch (error) {
        setMediaOptions([]);
        setPaperSize('');
        setLog(`Failed to load paper sizes: ${String(error)}`);
      }
    };

    loadMedia().catch(() => undefined);
  }, [activePrinter]);

  useEffect(() => {
    if (!filePath) {
      setPdfBytes(null);
      setPdfDocument(null);
      setSelectedPages(new Set());
      return;
    }

    const loadPdf = async () => {
      const bytes = await readFile(filePath);
      const normalized = normalizeBytes(bytes);
      setPdfBytes(normalized);
      const header = getHeader(normalized);
      setLog(`Loaded ${filePath} (${normalized.byteLength} bytes, header: ${header})`);
    };

    loadPdf().catch((error) => {
      setLog(`Failed to open PDF: ${String(error)}`);
    });
  }, [filePath]);

  useEffect(() => {
    if (!pdfBytes) {
      setPdfDocument(null);
      setSelectedPages(new Set());
      return;
    }

    let isMounted = true;

    getDocument({ data: pdfBytes })
      .promise
      .then((doc) => {
        if (!isMounted) {
          return;
        }
        setPdfDocument(doc);
        const pages = new Set<number>();
        for (let i = 1; i <= doc.numPages; i += 1) {
          pages.add(i);
        }
        setSelectedPages(pages);
        setRangeStart(1);
        setRangeEnd(doc.numPages);
        setRangeMode('all');
      })
      .catch((error) => {
        setLog(`Failed to load PDF: ${String(error)}`);
      });

    return () => {
      isMounted = false;
    };
  }, [pdfBytes]);

  const handleFetchPrinters = async () => {
    try {
      const list = await invoke<PrinterInfo[]>('plugin:native-pdf-print|get_printers');
      setPrinters(list);
      const defaultName = list.find((printer) => printer.isDefault)?.name;
      if (defaultName) {
        setPrinterName(defaultName);
      }
      setLog(`Loaded ${list.length} printers`);
    } catch (error) {
      setLog(`Failed to load printers: ${String(error)}`);
    }
  };

  const togglePage = (page: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(page)) {
        next.delete(page);
      } else {
        next.add(page);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!pdfDocument) {
      return;
    }
    const all = new Set<number>();
    for (let i = 1; i <= pdfDocument.numPages; i += 1) {
      all.add(i);
    }
    setSelectedPages(all);
  };

  const handleClearSelection = () => {
    setSelectedPages(new Set());
  };

  const handleApplyRange = () => {
    if (!pdfDocument) {
      return;
    }
    const start = Math.max(1, Math.min(rangeStart, pdfDocument.numPages));
    const end = Math.max(1, Math.min(rangeEnd, pdfDocument.numPages));
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    const range = new Set<number>();
    for (let i = from; i <= to; i += 1) {
      range.add(i);
    }
    setSelectedPages(range);
    setRangeMode('range');
  };

  const handlePrint = async () => {
    if (isPrinting) {
      return;
    }
    if (!filePath || !pdfDocument) {
      setLog('Provide a PDF path first.');
      return;
    }

    const orderedPages =
      rangeMode === 'all' && pdfDocument
        ? Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1)
        : Array.from(selectedPages).sort((a, b) => a - b);
    if (orderedPages.length === 0) {
      setLog('Select at least one page.');
      return;
    }

    try {
      setIsPrinting(true);
      const freshBytes = normalizeBytes(await readFile(filePath));
      const header = getHeader(freshBytes);
      setLog(`Preparing print (${freshBytes.byteLength} bytes, header: ${header})`);
      const source = await PDFDocument.load(freshBytes, { ignoreEncryption: true });
      const target = await PDFDocument.create();
      const pageIndices = orderedPages.map((page) => page - 1);
      const copiedPages = await target.copyPages(source, pageIndices);
      copiedPages.forEach((page) => target.addPage(page));
      const outputBytes = await target.save();

      const dataBase64 = toBase64(outputBytes);
      const result = await invoke<PrintResult>('plugin:native-pdf-print|print_pdf_bytes', {
        options: {
          dataBase64,
          printerName: printerName || defaultPrinter || null,
          copies,
          duplex,
          paperSize: paperSize || null,
          removeAfterPrint: true
        }
      });

      setLog(
        `Print queued on ${result.printer}: ${result.message} (copies: ${copies}, duplex: ${duplex})`
      );
    } catch (error) {
      setLog(`Print failed: ${String(error)}`);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <section className="dialog-shell">
      <div className="panel preview-panel">
        <div className="row">
          <h2>Preview</h2>
          <span className="muted">{selectedPages.size} selected</span>
        </div>
        <div className="preview-scroll">
          <div className="preview-grid">
            {pdfDocument ? (
              Array.from({ length: pdfDocument.numPages }, (_, index) => {
                const pageNumber = index + 1;
                return (
                  <PageCanvas
                    key={pageNumber}
                    document={pdfDocument}
                    pageNumber={pageNumber}
                    selected={selectedPages.has(pageNumber)}
                    onToggle={(page) => {
                      setRangeMode('manual');
                      togglePage(page);
                    }}
                  />
                );
              })
            ) : (
              <p className="muted">Waiting for a PDF path.</p>
            )}
          </div>
        </div>
      </div>

      <div className="panel controls-panel">
        <div className="row">
          <p className="path">{filePath || 'No file selected'}</p>
        </div>

        <div className="controls-scroll">
          <div className="controls-grid">
          <div className="range-panel">
            <p className="section-title">Pages</p>
            <div className="segmented">
              <button
                className={rangeMode === 'all' ? 'active' : ''}
                onClick={() => {
                  setRangeMode('all');
                  handleSelectAll();
                }}
              >
                All
              </button>
              <button
                className={rangeMode === 'range' ? 'active' : ''}
                onClick={() => setRangeMode('range')}
              >
                Range
              </button>
              <button
                className={rangeMode === 'manual' ? 'active' : ''}
                onClick={() => setRangeMode('manual')}
              >
                Manual
              </button>
            </div>
            <div className="range-inputs">
              <div className="range-field">
                <label>
                  From
                  <input
                    type="number"
                    min={1}
                    value={rangeStart}
                    onChange={(event) => setRangeStart(Number(event.target.value) || 1)}
                    disabled={rangeMode === 'manual'}
                  />
                </label>
              </div>
              <div className="range-field">
                <label>
                  To
                  <input
                    type="number"
                    min={1}
                    value={rangeEnd}
                    onChange={(event) => setRangeEnd(Number(event.target.value) || 1)}
                    disabled={rangeMode === 'manual'}
                  />
                </label>
              </div>
              <div className="range-actions">
                <button onClick={handleApplyRange} disabled={rangeMode === 'manual'}>
                  Apply
                </button>
                <button className="ghost" onClick={handleClearSelection}>
                  Clear
                </button>
              </div>
            </div>
          </div>
          <label>
            Printer
            <select
              value={printerName}
              onChange={(event) => setPrinterName(event.target.value)}
            >
              <option value="">Default printer ({defaultPrinter || 'unknown'})</option>
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.name} ({printer.status})
                </option>
              ))}
            </select>
          </label>
          <div className="refresh-row">
            <button className="ghost" onClick={handleFetchPrinters}>
              Refresh printers
            </button>
          </div>
          <label>
            Copies
            <input
              type="number"
              min={1}
              value={copies}
              onChange={(event) => setCopies(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <label>
            Duplex
            <select value={duplex} onChange={(event) => setDuplex(event.target.value as typeof duplex)}>
              <option value="none">Off</option>
              <option value="long">Long edge</option>
              <option value="short">Short edge</option>
            </select>
          </label>
          <label>
            Paper size
            <select value={paperSize} onChange={(event) => setPaperSize(event.target.value)}>
              <option value="">Auto</option>
              {mediaOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          </div>
        </div>

        <div className="print-footer">
          <button className="primary" onClick={handlePrint}>
            {isPrinting ? 'Printing…' : 'Print Selected Pages'}
          </button>
        </div>

        <div className="panel status-panel">
          <h2>Status</h2>
          <pre>{log}</pre>
        </div>
      </div>
    </section>
  );
}

function toBase64(data: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function normalizeBytes(bytes: Uint8Array | ArrayBuffer | number[]): Uint8Array {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (Array.isArray(bytes)) {
    return Uint8Array.from(bytes);
  }
  return new Uint8Array(bytes);
}

function getHeader(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 4))
    .map((value) => String.fromCharCode(value))
    .join('');
}
