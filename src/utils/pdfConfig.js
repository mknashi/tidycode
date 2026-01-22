/**
 * PDF.js Configuration
 * Global configuration for PDF.js worker and rendering
 */

import { pdfjs } from 'react-pdf';

// Configure PDF.js worker
// Use local worker file that matches react-pdf's pdfjs-dist version (5.4.296)
// The worker file is copied to /pdf.worker.min.mjs by vite-plugin-static-copy
const workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

console.log('[PDF Config] Worker configured with version:', pdfjs.version);
console.log('[PDF Config] Worker URL:', workerSrc);
console.log('[PDF Config] Is Tauri:', !!window.__TAURI__);

// Determine the base path for cmaps
const getBasePath = () => {
  if (window.__TAURI__) {
    return window.location.origin;
  }
  return window.location.origin;
};

const basePath = getBasePath();
const cMapUrl = `${basePath}/cmaps/`;

// Default PDF.js options - use local cmaps
export const PDF_OPTIONS = {
  cMapUrl: cMapUrl,
  cMapPacked: true,
};

console.log('[PDF Config] CMap URL:', cMapUrl);

// Export pdfjs for use in components
export { pdfjs };
