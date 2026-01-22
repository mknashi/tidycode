import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import { PDF_OPTIONS } from '../utils/pdfConfig.js';

const DEFAULT_ASPECT_RATIO = 1.294;

const PdfVirtualPreview = ({
  pdfFile,
  numPages,
  isDark,
  selectedPages,
  onTogglePage,
  onLoadSuccess,
  onLoadError,
  maxPageWidth = null,
  pageAspectRatio = DEFAULT_ASPECT_RATIO,
  pageBuffer = 2,
  renderTextLayer = false,
  renderAnnotationLayer = false,
  containerWidth = 0,
  disableVirtualization = false,
  maxWidthRatio = null,
  pageScaleX = 1
}) => {
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [stableWidth, setStableWidth] = useState(0);
  const [visiblePages, setVisiblePages] = useState(new Set([1]));
  const [renderedPages, setRenderedPages] = useState(new Set([1]));
  const lastVisibleRef = useRef(new Set([1]));
  const lastTopPageRef = useRef(1);
  const updateTimerRef = useRef(null);
  const hasExternalWidth = containerWidth > 0;

  useEffect(() => {
    if (hasExternalWidth) {
      return;
    }
    const node = containerRef.current;
    if (!node) {
      return;
    }
    const updateSize = () => {
      const width = node.clientWidth || node.parentElement?.clientWidth || 0;
      setMeasuredWidth(width);
    };
    updateSize();
    const raf = requestAnimationFrame(updateSize);
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [hasExternalWidth]);

  useEffect(() => {
    if (!numPages) {
      return;
    }
    setVisiblePages(new Set([1]));
    if (disableVirtualization) {
      setRenderedPages(new Set(Array.from({ length: numPages }, (_, idx) => idx + 1)));
    } else {
      setRenderedPages(new Set([1]));
    }
  }, [disableVirtualization, numPages]);

  useEffect(() => {
    if (disableVirtualization) {
      return;
    }
    if (!containerRef.current || !numPages) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const intersectingPages = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => parseInt(entry.target.dataset.page, 10))
          .filter((pageNum) => Number.isFinite(pageNum))
          .sort((a, b) => a - b);

        if (!intersectingPages.length) {
          return;
        }

        const topPage = intersectingPages[0];
        const baseSet = new Set();
        intersectingPages.forEach((pageNum) => {
          for (
            let i = Math.max(1, pageNum - pageBuffer);
            i <= Math.min(numPages, pageNum + pageBuffer);
            i += 1
          ) {
            baseSet.add(i);
          }
        });

        const nextVisible = new Set([...lastVisibleRef.current, ...baseSet]);

        const sameTop = topPage === lastTopPageRef.current;
        const sameSet =
          nextVisible.size === lastVisibleRef.current.size &&
          Array.from(nextVisible).every((value) => lastVisibleRef.current.has(value));
        if (sameTop && sameSet) {
          return;
        }

        if (updateTimerRef.current) {
          clearTimeout(updateTimerRef.current);
        }
        updateTimerRef.current = setTimeout(() => {
          lastTopPageRef.current = topPage;
          lastVisibleRef.current = nextVisible;
          setVisiblePages(nextVisible);
          setRenderedPages((prev) => new Set([...prev, ...nextVisible]));
        }, 80);
      },
      {
        root: containerRef.current,
        rootMargin: '20% 0px 20% 0px',
        threshold: [0.2, 0.6]
      }
    );

    Object.values(pageRefs.current).forEach((ref) => {
      if (ref) {
        observer.observe(ref);
      }
    });

    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
      observer.disconnect();
    };
  }, [disableVirtualization, numPages, pageBuffer]);

  useEffect(() => {
    if (disableVirtualization && stableWidth) {
      return;
    }
    const effectiveWidth = containerWidth || measuredWidth;
    if (!effectiveWidth) {
      return;
    }
    const available = Math.max(1, effectiveWidth - 24);
    let maxWidth = maxPageWidth;
    if (typeof maxWidthRatio === 'number') {
      maxWidth = Math.floor(available * maxWidthRatio);
    }
    const nextWidth = Math.floor(maxWidth ? Math.min(maxWidth, available) : available);
    setStableWidth((prev) => {
      if (!prev) {
        return nextWidth;
      }
      if (Math.abs(prev - nextWidth) < 2) {
        return prev;
      }
      return nextWidth;
    });
  }, [containerWidth, measuredWidth, maxPageWidth]);

  const pageWidth = useMemo(() => (stableWidth ? stableWidth : 1), [stableWidth]);

  useEffect(() => {
    if (!numPages) {
      return;
    }
    const visibleList = Array.from(visiblePages.values()).slice(0, 8);
    console.log('[PrintPreview] Preview layout', {
      containerWidth: containerWidth || measuredWidth,
      pageWidth,
      numPages,
      visiblePages: visibleList
    });
  }, [containerWidth, measuredWidth, numPages, pageWidth, visiblePages]);

  const placeholderHeight = Math.round(pageWidth * pageAspectRatio);

  return (
    <div className="h-full min-h-0 w-full">
      <Document
        file={pdfFile}
        onLoadSuccess={onLoadSuccess}
        onLoadError={onLoadError}
        options={PDF_OPTIONS}
        className="h-full w-full"
      >
        <div
          ref={containerRef}
          className="h-full w-full overflow-y-auto overflow-x-hidden pr-1 space-y-2"
        >
          {Array.from({ length: numPages }, (_, index) => {
            const pageNumber = index + 1;
            const isSelected = selectedPages?.has(pageNumber);
            const itemClass = `w-full p-1 rounded transition-colors ${
              onTogglePage
                ? isSelected
                  ? isDark
                    ? 'bg-blue-600 border-2 border-blue-400'
                    : 'bg-blue-500 border-2 border-blue-300'
                  : isDark
                    ? 'hover:bg-gray-800 border-2 border-transparent'
                    : 'hover:bg-gray-200 border-2 border-transparent'
                : ''
            }`;
            const content = (
              <div className="flex flex-col items-center gap-2">
                <div className={`${isDark ? 'bg-white' : 'bg-gray-100'} w-full`}>
                  <div
                    className="mx-auto w-full"
                    style={{ transform: `scaleX(${pageScaleX})`, transformOrigin: 'top center' }}
                  >
                    {renderedPages.has(pageNumber) ? (
                      <Page
                        className="mx-auto"
                        pageNumber={pageNumber}
                        width={pageWidth}
                        renderTextLayer={renderTextLayer}
                        renderAnnotationLayer={renderAnnotationLayer}
                        loading={
                          <div
                            className={`rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}
                            style={{ height: placeholderHeight }}
                          />
                        }
                      />
                    ) : (
                      <div
                        className={`rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}
                        style={{ height: placeholderHeight }}
                      />
                    )}
                  </div>
                </div>
                <div
                  className={`text-xs font-medium ${
                    onTogglePage && isSelected
                      ? 'text-white'
                      : isDark
                        ? 'text-gray-400'
                        : 'text-gray-600'
                  }`}
                >
                  Page {pageNumber}
                </div>
              </div>
            );

            return onTogglePage ? (
              <button
                type="button"
                key={pageNumber}
                ref={(el) => {
                  pageRefs.current[pageNumber] = el;
                }}
                data-page={pageNumber}
                className={itemClass}
                onClick={() => onTogglePage(pageNumber)}
              >
                {content}
              </button>
            ) : (
              <div
                key={pageNumber}
                ref={(el) => {
                  pageRefs.current[pageNumber] = el;
                }}
                data-page={pageNumber}
                className="w-full p-2"
              >
                {content}
              </div>
            );
          })}
        </div>
      </Document>
    </div>
  );
};

export default PdfVirtualPreview;
