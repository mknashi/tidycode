import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import pkg from './package.json' with { type: 'json' }

// Generate version.json for static pages
function generateVersionFile() {
  return {
    name: 'generate-version-file',
    buildStart() {
      const versionData = JSON.stringify({ version: pkg.version }, null, 2)
      writeFileSync(resolve(__dirname, 'public/version.json'), versionData)
    }
  }
}

export default defineConfig({
  plugins: [
    generateVersionFile(),
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
          dest: ''
        },
        {
          src: 'node_modules/pdfjs-dist/cmaps/*',
          dest: 'cmaps'
        }
      ]
    })
  ],
  server: {
    fs: {
      // Allow serving files from src-wasm/pkg
      allow: ['..']
    }
  },
  optimizeDeps: {
    exclude: ['src-wasm/pkg/file_ops_wasm.js']
  },
  // Explicitly include WASM files as assets
  assetsInclude: ['**/*.wasm'],
  build: {
    // Ensure WASM files are never inlined (they need to be loaded as separate files)
    assetsInlineLimit: (filePath) => {
      // Never inline WASM files
      return filePath.endsWith('.wasm') ? false : 4096;
    },
    // Copy WASM files to output directory
    copyPublicDir: true,
    // Ensure WASM files are treated as assets and copied
    assetsDir: 'assets',
    rollupOptions: {
      // Externalize Tauri-specific modules for web builds
      external: ['@tauri-apps/plugin-shell'],
      output: {
        manualChunks: {
          // React core
          'react-vendor': ['react', 'react-dom'],

          // CodeMirror core
          'codemirror-core': [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/language',
            '@codemirror/search',
            '@lezer/highlight'
          ],

          // CodeMirror languages - split into groups for better chunking
          'codemirror-langs-web': [
            '@codemirror/lang-javascript',
            '@codemirror/lang-html',
            '@codemirror/lang-css',
            '@codemirror/lang-markdown'
          ],

          'codemirror-langs-data': [
            '@codemirror/lang-json',
            '@codemirror/lang-xml',
            '@codemirror/lang-sql'
          ],

          'codemirror-langs-compiled': [
            '@codemirror/lang-python',
            '@codemirror/lang-java',
            '@codemirror/lang-cpp',
            '@codemirror/lang-php',
            '@codemirror/lang-rust'
          ],

          // CodeMirror UI wrapper
          'codemirror-ui': [
            '@uiw/react-codemirror'
          ],

          // CodeMirror theme and extensions
          'codemirror-theme-vim': [
            '@codemirror/theme-one-dark',
            '@replit/codemirror-vim'
          ],

          // CodeMirror LSP
          'codemirror-lsp': [
            'codemirror-languageserver'
          ],

          // AI/LLM libraries (loaded dynamically, keeping for future use)
          'ai-libs': [
            '@mlc-ai/web-llm'
          ],

          // Tauri
          'tauri': [
            '@tauri-apps/api',
            '@tauri-apps/plugin-dialog'
          ],

          // UI libraries
          'ui-libs': [
            'lucide-react',
            'marked',
            'prismjs'
          ],

          // PDF viewer (lazy loaded)
          'pdf-viewer': [
            'react-pdf'
          ],

          // SVG viewer (lazy loaded)
          'svg-viewer': [
            'react-zoom-pan-pinch'
          ]
        }
      }
    },
    // Increase chunk size warning limit to 1000 kB (still warn but for larger chunks)
    chunkSizeWarningLimit: 1000
  }
})
