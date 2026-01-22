import React from 'react';
import { Book, FileText, Zap, Gift, Home, ExternalLink } from 'lucide-react';

export const HelpContent = {
  welcome: {
    title: "Welcome to Tidy Code",
    icon: Home,
    content: (theme) => (
      <div className="space-y-6">
        <div className={`text-center pb-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <h2 className="text-2xl font-bold mb-2">Welcome to Tidy Code</h2>
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            A powerful, feature-rich text editor for developers
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Getting Started</h3>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              Tidy Code is designed to make your editing experience smooth and productive.
              Whether you're working with JSON, XML, CSV, Markdown, PDFs, or plain text, we've got you covered.
            </p>
          </div>

          <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-800/30' : 'bg-blue-50 border border-blue-200'}`}>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Zap size={18} />
              Quick Features
            </h4>
            <ul className={`space-y-1 ml-6 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>• Multi-tab editing with drag-and-drop</li>
              <li>• JSON/XML formatting and validation</li>
              <li>• PDF viewing with search, zoom, and thumbnails</li>
              <li>• Markdown preview with live rendering</li>
              <li>• Notes & Todo lists for quick notes</li>
              <li>• Diff Viewer to compare files side-by-side</li>
              <li>• Large file support (100MB+) with WASM</li>
              <li>• AI-powered assistance</li>
              <li>• Dark/Light themes</li>
            </ul>
          </div>

          <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-green-900/20 border border-green-800/30' : 'bg-green-50 border border-green-200'}`}>
            <h4 className="font-semibold mb-2">What's New in v0.2.4</h4>
            <ul className={`space-y-1 ml-6 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>• <strong>YAML Support:</strong> Full validation, formatting, and structure view for YAML files</li>
              <li>• <strong>TOML Support:</strong> Validation, formatting, and structure view for TOML files</li>
              <li>• <strong>Format Conversion:</strong> Convert between JSON, XML, YAML, and TOML formats</li>
              <li>• <strong>Smart Conversions:</strong> Auto-fix XML tag names and handle format-specific limitations</li>
              <li>• <strong>Conversion Feedback:</strong> Resizable info panel showing all adjustments with line navigation</li>
            </ul>
          </div>

          <div className={`mt-6 p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Need help? Visit our documentation or check out tips and tricks to get the most out of Tidy Code.
            </p>
          </div>
        </div>
      </div>
    )
  },

  tips: {
    title: "Tips & Tricks",
    icon: Zap,
    content: (theme) => (
      <div className="space-y-6">
        <div className={`text-center pb-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <h2 className="text-2xl font-bold mb-2">Tips & Tricks</h2>
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            Master Tidy Code with these helpful tips
          </p>
        </div>

        <div className="space-y-6">
          {/* JSON/XML/YAML/TOML Formatting */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <FileText size={18} />
              Data Format Support
            </h3>
            <div className="space-y-3">
              <div className={`p-3 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-1">Auto-Format</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  Click the "Format" button to automatically format JSON, XML, YAML, or TOML.
                  The formatter auto-detects the content type and applies proper indentation.
                </p>
              </div>
              <div className={`p-3 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-1">Format Conversion</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  Use the "Convert" dropdown to convert between JSON, XML, YAML, and TOML.
                  Converted content opens in a new tab, preserving your original file.
                </p>
              </div>
              <div className={`p-3 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-1">Validation</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  Syntax errors are highlighted in real-time. Look for red underlines and
                  error messages in the Structure panel.
                </p>
              </div>
              <div className={`p-3 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-1">Structure View</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  Toggle the Structure panel to see a tree view of your data. Click nodes
                  to navigate quickly through large files. Works with JSON, XML, YAML, and TOML.
                </p>
              </div>
            </div>
          </div>

          {/* Editing Features */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Editing Features</h3>
            <div className="space-y-3">
              <div className={`p-3 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-1">Auto-Pairing</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  Brackets, quotes, and XML tags are automatically paired as you type.
                  Press Tab to skip past the closing character.
                </p>
              </div>
              <div className={`p-3 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-1">Multi-Cursor</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  Hold Cmd/Ctrl and click to place multiple cursors. Edit multiple locations
                  simultaneously for faster editing.
                </p>
              </div>
              <div className={`p-3 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-1">Find & Replace</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  Use Cmd/Ctrl+F to search and Cmd/Ctrl+H to replace. Supports regex patterns
                  and case-sensitive matching.
                </p>
              </div>
            </div>
          </div>

          {/* Code Completion */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Code Completion</h3>
            <div className="space-y-3">
              <div className={`p-3 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-1">LSP Support</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  Language Server Protocol provides intelligent code completion, hover info,
                  and diagnostics for supported languages.
                </p>
              </div>
              <div className={`p-3 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-1">Snippets</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  Type common patterns and press Tab to expand. Available for JSON, XML,
                  JavaScript, and more.
                </p>
              </div>
            </div>
          </div>

          {/* Productivity Tips */}
          <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-800/30' : 'bg-blue-50 border border-blue-200'}`}>
            <h3 className="text-lg font-semibold mb-3">Productivity Tips</h3>
            <ul className={`space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>• Use the File Explorer to manage multiple open files</li>
              <li>• Drag tabs to reorder or organize your workspace</li>
              <li>• Enable VIM mode for modal editing (automatically focuses editor)</li>
              <li>• Use the Diff Viewer to compare versions of your files</li>
              <li>• Save layouts and preferences for different projects</li>
              <li>• Enable AI assistance for code suggestions and help</li>
            </ul>
          </div>
        </div>
      </div>
    )
  },

  documentation: {
    title: "Help Documentation",
    icon: Book,
    content: (theme) => (
      <div className="space-y-6">
        <div className={`text-center pb-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <h2 className="text-2xl font-bold mb-2">Help Documentation</h2>
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            Complete guide to Tidy Code features
          </p>
        </div>

        <div className="space-y-6">
          {/* Getting Started */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Getting Started</h3>
            <div className="space-y-2">
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">Installation & Setup</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Download and install Tidy Code on your system
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">First Steps</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Create your first file and explore the interface
                </p>
              </div>
            </div>
          </div>

          {/* Core Features */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Core Features</h3>
            <div className="space-y-2">
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">File Management</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Open, save, and manage files and tabs
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">Text Editing</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Advanced editing features and shortcuts
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">Search & Replace</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Find text, use regex, and replace content
                </p>
              </div>
            </div>
          </div>

          {/* Specialized Tools */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Specialized Tools</h3>
            <div className="space-y-2">
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">JSON Editor</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Format, validate, and navigate JSON files
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">XML Editor</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Format, validate, and edit XML documents
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">YAML Editor</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Format, validate, and navigate YAML files with structure view
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">TOML Editor</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Format, validate, and navigate TOML configuration files
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">Format Converter</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Convert between JSON, XML, YAML, and TOML formats
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">CSV Editor</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Edit CSV files with preview and column management
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">Diff Viewer</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Compare files and view differences
                </p>
              </div>
            </div>
          </div>

          {/* Advanced Features */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Advanced Features</h3>
            <div className="space-y-2">
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">AI Integration</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Use OpenAI, Claude, or Ollama for assistance
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">VIM Mode</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Modal editing with VIM keybindings
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">LSP Support</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Language server protocol for code intelligence
                </p>
              </div>
              <div className={`p-3 rounded cursor-pointer hover:bg-opacity-80 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <h4 className="font-medium">Terminal Integration</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Built-in terminal panel for command execution
                </p>
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-800/30' : 'bg-blue-50 border border-blue-200'}`}>
            <h3 className="text-lg font-semibold mb-3">Common Keyboard Shortcuts</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={`text-sm font-mono ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Cmd/Ctrl + N</p>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>New File</p>
              </div>
              <div>
                <p className={`text-sm font-mono ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Cmd/Ctrl + O</p>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Open File</p>
              </div>
              <div>
                <p className={`text-sm font-mono ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Cmd/Ctrl + S</p>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Save</p>
              </div>
              <div>
                <p className={`text-sm font-mono ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Cmd/Ctrl + F</p>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Find</p>
              </div>
              <div>
                <p className={`text-sm font-mono ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Cmd/Ctrl + H</p>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Replace</p>
              </div>
              <div>
                <p className={`text-sm font-mono ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Cmd/Ctrl + W</p>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Close Tab</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  },

  releases: {
    title: "Release Notes",
    icon: Gift,
    content: (theme) => (
      <div className="space-y-6">
        <div className={`text-center pb-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <h2 className="text-2xl font-bold mb-2">Release Notes</h2>
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            What's new in Tidy Code
          </p>
        </div>

        <div className="space-y-6">
          {/* Latest Release */}
          <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-blue-900/20 border-blue-800/30' : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Version 0.2.4</h3>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-blue-800 text-blue-100' : 'bg-blue-200 text-blue-900'}`}>
                Current
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <h4 className="font-medium mb-2">YAML & TOML Support</h4>
                <ul className={`space-y-1 ml-5 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  <li>• Full YAML support with validation, formatting, and structure view</li>
                  <li>• Full TOML support with validation, formatting, and structure view</li>
                  <li>• Auto-detection of content format from file extension or patterns</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Format Conversion</h4>
                <ul className={`space-y-1 ml-5 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  <li>• Convert between JSON, XML, YAML, and TOML formats</li>
                  <li>• Converted files open in new tab (preserves original)</li>
                  <li>• Smart adjustments for XML tag names and TOML limitations</li>
                  <li>• Resizable info panel with clickable adjustment navigation</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Version 0.2.2 */}
          <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <h4 className="font-medium mb-2">Version 0.2.2 - Native PDF Printing</h4>
            <ul className={`space-y-1 ml-5 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>• Native PDF printing pipeline via Tauri plugin</li>
              <li>• Cross-platform support for macOS and Windows</li>
              <li>• Print options: page ranges, copies, and duplex</li>
              <li>• Two-panel print dialog with preview thumbnails</li>
            </ul>
          </div>

          {/* Version 0.2.0 */}
          <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <h4 className="font-medium mb-2">Version 0.2.0 - PDF Viewing</h4>
            <ul className={`space-y-1 ml-5 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>• Full PDF viewing with search, zoom, and page navigation</li>
              <li>• Thumbnail sidebar and document outline support</li>
              <li>• Focus mode for distraction-free reading</li>
              <li>• Native clipboard integration (desktop)</li>
            </ul>
          </div>

          {/* Previous Releases */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Previous Releases</h3>
            <div className="space-y-4">
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-2">Desktop App & Multi-Platform Support</h4>
                <ul className={`space-y-1 ml-5 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  <li>• Tauri-based desktop application for macOS, Windows, Linux</li>
                  <li>• Native file dialogs and system integration</li>
                  <li>• Optimized tab and file handling across platforms</li>
                  <li>• Platform-specific menu bars and shortcuts</li>
                </ul>
              </div>

              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-2">Core Editor Features</h4>
                <ul className={`space-y-1 ml-5 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  <li>• Multi-tab editing with drag-and-drop reordering</li>
                  <li>• JSON/XML formatting with syntax validation</li>
                  <li>• CSV editing with preview and column management</li>
                  <li>• Search with highlighting and adjustable results</li>
                  <li>• Auto-pairing for brackets, quotes, and tags</li>
                  <li>• Find & Replace with undo support</li>
                </ul>
              </div>

              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className="font-medium mb-2">Advanced Features</h4>
                <ul className={`space-y-1 ml-5 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  <li>• AI integration (OpenAI, Claude, Ollama)</li>
                  <li>• LSP support for code intelligence</li>
                  <li>• VIM mode for modal editing</li>
                  <li>• Structure view for JSON and XML</li>
                  <li>• Dark/Light theme support</li>
                  <li>• Notes & Todo lists panels</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Roadmap */}
          <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
            <h3 className="text-lg font-semibold mb-3">Coming Soon</h3>
            <ul className={`space-y-1 ml-5 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>• Git integration</li>
              <li>• Plugin system</li>
              <li>• Collaborative editing</li>
              <li>• More language support</li>
              <li>• Custom themes and layouts</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }
};

export const HELP_URLS = {
  welcome: 'https://tidycode.ai/docs/index.html',
  tips: 'https://tidycode.ai/docs/tips-and-tricks.html',
  documentation: 'https://tidycode.ai/docs/features.html',
  releases: 'https://tidycode.ai/docs/release-notes.html'
};
