/**
 * SVG Viewer Component
 * Interactive SVG viewer with pan, zoom, and edit capabilities
 */

import React, { useState, useCallback, useMemo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import {
  X, ZoomIn, ZoomOut, Maximize2, Download, FileText, RotateCcw
} from 'lucide-react';

const SVGViewer = ({ content, fileName, theme, onClose, onEditAsText }) => {
  const [error, setError] = useState(null);
  const isDark = theme === 'dark';

  // Create object URL for SVG content
  const svgUrl = useMemo(() => {
    try {
      const blob = new Blob([content], { type: 'image/svg+xml' });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error('[SVG] Failed to create object URL:', err);
      setError('Failed to load SVG');
      return null;
    }
  }, [content]);

  // Cleanup object URL on unmount
  React.useEffect(() => {
    return () => {
      if (svgUrl) {
        URL.revokeObjectURL(svgUrl);
      }
    };
  }, [svgUrl]);

  const handleDownload = useCallback(() => {
    try {
      const blob = new Blob([content], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[SVG] Download failed:', error);
    }
  }, [content, fileName]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose?.();
    }
  }, [onClose]);

  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${
      isDark ? 'bg-gray-900' : 'bg-gray-100'
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${
        isDark
          ? 'bg-gray-800 border-gray-700 text-gray-100'
          : 'bg-white border-gray-200 text-gray-900'
      }`}>
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold truncate max-w-md" title={fileName}>
            {fileName}
          </h2>
          <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            SVG Image
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Download */}
          <button
            onClick={handleDownload}
            className={`p-2 rounded transition-colors ${
              isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
            title="Download SVG"
          >
            <Download size={20} />
          </button>

          {/* Edit as Text */}
          {onEditAsText && (
            <button
              onClick={onEditAsText}
              className={`px-3 py-2 rounded transition-colors flex items-center gap-2 ${
                isDark
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
              title="Edit SVG source code"
            >
              <FileText size={18} />
              <span className="text-sm font-medium">Edit as Text</span>
            </button>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            className={`p-2 rounded transition-colors ${
              isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* SVG Content with Pan/Zoom */}
      <div className={`flex-1 overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-gray-200'}`}>
        {error ? (
          <div className={`flex items-center justify-center h-full ${
            isDark ? 'text-red-400' : 'text-red-600'
          }`}>
            <div className="text-center p-8">
              <p className="text-lg font-semibold mb-2">Error Loading SVG</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        ) : (
          <TransformWrapper
            initialScale={1}
            minScale={0.1}
            maxScale={10}
            centerOnInit={true}
            wheel={{ step: 0.1 }}
            doubleClick={{ mode: 'reset' }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                {/* Zoom Controls */}
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                  <button
                    onClick={() => zoomIn()}
                    className={`p-3 rounded-lg shadow-lg transition-colors ${
                      isDark
                        ? 'bg-gray-800 hover:bg-gray-700 text-gray-100'
                        : 'bg-white hover:bg-gray-100 text-gray-900'
                    }`}
                    title="Zoom in (+)"
                  >
                    <ZoomIn size={20} />
                  </button>

                  <button
                    onClick={() => zoomOut()}
                    className={`p-3 rounded-lg shadow-lg transition-colors ${
                      isDark
                        ? 'bg-gray-800 hover:bg-gray-700 text-gray-100'
                        : 'bg-white hover:bg-gray-100 text-gray-900'
                    }`}
                    title="Zoom out (-)"
                  >
                    <ZoomOut size={20} />
                  </button>

                  <button
                    onClick={() => resetTransform()}
                    className={`p-3 rounded-lg shadow-lg transition-colors ${
                      isDark
                        ? 'bg-gray-800 hover:bg-gray-700 text-gray-100'
                        : 'bg-white hover:bg-gray-100 text-gray-900'
                    }`}
                    title="Reset view (0)"
                  >
                    <RotateCcw size={20} />
                  </button>

                  <button
                    onClick={() => resetTransform()}
                    className={`p-3 rounded-lg shadow-lg transition-colors ${
                      isDark
                        ? 'bg-gray-800 hover:bg-gray-700 text-gray-100'
                        : 'bg-white hover:bg-gray-100 text-gray-900'
                    }`}
                    title="Fit to screen"
                  >
                    <Maximize2 size={20} />
                  </button>
                </div>

                {/* SVG Image */}
                <TransformComponent
                  wrapperClass="w-full h-full flex items-center justify-center"
                  contentClass="flex items-center justify-center"
                >
                  <div className={`p-8 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-2xl`}>
                    <img
                      src={svgUrl}
                      alt={fileName}
                      className="max-w-full max-h-full"
                      style={{
                        filter: isDark ? 'none' : 'none',
                      }}
                      onError={(e) => {
                        console.error('[SVG] Image load error');
                        setError('Failed to render SVG image');
                      }}
                    />
                  </div>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        )}
      </div>

      {/* Footer */}
      <div className={`px-4 py-2 border-t text-xs ${
        isDark
          ? 'bg-gray-800 border-gray-700 text-gray-400'
          : 'bg-white border-gray-200 text-gray-600'
      }`}>
        <div className="flex justify-between items-center">
          <div>
            Click and drag to pan • Scroll to zoom • Double-click to reset • Esc to close
          </div>
          <div>
            {content && `${(content.length / 1024).toFixed(2)} KB`}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SVGViewer;
