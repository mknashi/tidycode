/**
 * Language Server Protocol (LSP) Service
 * Manages LSP connections for various programming languages
 * Provides enhanced IDE-like features: diagnostics, hover info, go-to-definition, etc.
 */

import { LanguageServerClient } from 'codemirror-languageserver';

/**
 * LSP Server configurations for popular languages
 */
export const LSP_SERVERS = {
  javascript: {
    name: 'TypeScript',
    serverName: 'typescript-language-server',
    bundledPath: 'typescript-language-server', // resolved by backend
    rootUri: 'file:///',
    workspaceFolders: null,
    capabilities: {
      textDocument: {
        hover: true,
        completion: {
          completionItem: {
            snippetSupport: true
          }
        },
        publishDiagnostics: true,
        definition: true,
        references: true
      }
    }
  },
  typescript: {
    name: 'TypeScript',
    serverName: 'typescript-language-server',
    bundledPath: 'typescript-language-server',
    rootUri: 'file:///',
    workspaceFolders: null,
    capabilities: {
      textDocument: {
        hover: true,
        completion: {
          completionItem: {
            snippetSupport: true
          }
        },
        publishDiagnostics: true,
        definition: true,
        references: true
      }
    }
  },
  python: {
    name: 'Python',
    serverName: 'pyright-langserver',
    bundledPath: 'pyright-langserver',
    rootUri: 'file:///',
    workspaceFolders: null,
    capabilities: {
      textDocument: {
        hover: true,
        completion: {
          completionItem: {
            snippetSupport: true
          }
        },
        publishDiagnostics: true,
        definition: true,
        references: true
      }
    }
  },
  rust: {
    name: 'Rust',
    serverName: 'rust-analyzer',
    bundledPath: 'rust-analyzer',
    rootUri: 'file:///',
    workspaceFolders: null,
    capabilities: {
      textDocument: {
        hover: true,
        completion: {
          completionItem: {
            snippetSupport: true
          }
        },
        publishDiagnostics: true,
        definition: true,
        references: true
      }
    }
  },
  java: {
    name: 'Java',
    serverName: 'jdtls',
    bundledPath: 'jdtls',
    rootUri: 'file:///',
    workspaceFolders: null,
    capabilities: {
      textDocument: {
        hover: true,
        completion: {
          completionItem: {
            snippetSupport: true
          }
        },
        publishDiagnostics: true,
        definition: true,
        references: true
      }
    }
  },
  cpp: {
    name: 'C/C++',
    serverName: 'clangd',
    bundledPath: 'clangd',
    rootUri: 'file:///',
    workspaceFolders: null,
    capabilities: {
      textDocument: {
        hover: true,
        completion: {
          completionItem: {
            snippetSupport: true
          }
        },
        publishDiagnostics: true,
        definition: true,
        references: true
      }
    }
  },
  php: {
    name: 'PHP',
    serverName: 'intelephense',
    bundledPath: 'intelephense',
    rootUri: 'file:///',
    workspaceFolders: null,
    capabilities: {
      textDocument: {
        hover: true,
        completion: {
          completionItem: {
            snippetSupport: true
          }
        },
        publishDiagnostics: true,
        definition: true,
        references: true
      }
    }
  }
};

export const DEFAULT_LSP_CONFIG = Object.keys(LSP_SERVERS).reduce((acc, lang) => {
  acc[lang] = { mode: 'bundled', customCommand: '' };
  return acc;
}, {});

class LSPService {
  constructor() {
    this.clients = new Map(); // language -> LSP client
    this.enabled = false;
    this.settings = null;
    this.wsConnections = new Map(); // language -> WebSocket
  }

  /**
   * Initialize LSP service with settings
   */
  initialize(settings) {
    if (!settings) return;

    this.enabled = settings.enableLSP || false;
    this.settings = {
      ...settings,
      lspConfig: { ...DEFAULT_LSP_CONFIG, ...(settings.lspConfig || {}) }
    };

    console.log('[LSPService] Initialized with settings:', { enabled: this.enabled });
  }

  /**
   * Check if LSP is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Check if LSP is supported for a language
   */
  isLanguageSupported(language) {
    return LSP_SERVERS.hasOwnProperty(language);
  }

  /**
   * Get or create LSP client for a language
   */
  async getClient(language, documentUri) {
    if (!this.isEnabled() || !this.isLanguageSupported(language)) {
      return null;
    }

    // Return existing client if available
    if (this.clients.has(language)) {
      return this.clients.get(language);
    }

    // Create new client
    try {
      const config = LSP_SERVERS[language];
      const client = await this.createClient(language, config, documentUri);

      if (client) {
        this.clients.set(language, client);
        console.log(`[LSPService] Created LSP client for ${language}`);
      }

      return client;
    } catch (error) {
      console.error(`[LSPService] Failed to create client for ${language}:`, error);
      return null;
    }
  }

  /**
   * Create LSP client with WebSocket transport
   */
  async createClient(language, config, documentUri) {
    const lspConfig = this.settings?.lspConfig?.[language] || {};
    const mode = lspConfig.mode || 'bundled'; // bundled | system | custom
    const customCommand = (lspConfig.customCommand || '').trim();

    // Check if we're in desktop mode for potential backend LSP support
    const isDesktop = !!window.__TAURI__ || !!window.__TAURI_INTERNALS__;

    if (!isDesktop) {
      // Browser mode: LSP requires a WebSocket server
      // This would typically connect to a language server running on ws://localhost:PORT
      console.warn(`[LSPService] LSP in browser mode requires external LSP server for ${language}`);
      return null;
    }

    // Desktop mode: Check if LSP server is installed via Tauri backend
    try {
      let invoke = window.__TAURI__?.core?.invoke ||
                   window.__TAURI__?.tauri?.invoke ||
                   window.__TAURI__?.invoke ||
                   window.__TAURI_INVOKE__;

      if (!invoke) {
        try {
          const tauriCore = await import('@tauri-apps/api/core');
          invoke = tauriCore?.invoke;
        } catch (error) {
          console.warn('[LSPService] Failed to load Tauri invoke', error);
        }
      }

      if (typeof invoke === 'function') {
        const serverCheck = await invoke('check_lsp_server', {
          language,
          mode,
          custom_command: customCommand || null
        });
        console.log(`[LSPService] LSP server check for ${language}:`, serverCheck);

        if (!serverCheck.installed) {
          // Server not installed - get installation instructions
          const instructions = await invoke('get_lsp_install_instructions', { language });
          console.warn(`[LSPService] LSP server not installed for ${language}:`, instructions);
          console.info(`[LSPService] Install with: ${instructions.install}`);
          return null;
        }

        console.log(`[LSPService] Desktop mode: LSP server available for ${language} at ${serverCheck.path}`);
        // In a full implementation, we would now establish WebSocket connection to the LSP server
        // For now, we log that the server is available
        return null; // Will be implemented in future phase
      } else {
        console.warn('[LSPService] Tauri invoke not available');
        return null;
      }
    } catch (error) {
      console.error(`[LSPService] Error checking LSP server for ${language}:`, error);
      return null;
    }
  }

  /**
   * Create LSP client transport using WebSocket
   */
  createWebSocketTransport(language, wsUrl) {
    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log(`[LSPService] WebSocket connected for ${language}`);
      };

      ws.onerror = (error) => {
        console.error(`[LSPService] WebSocket error for ${language}:`, error);
      };

      ws.onclose = () => {
        console.log(`[LSPService] WebSocket closed for ${language}`);
        this.wsConnections.delete(language);
      };

      this.wsConnections.set(language, ws);
      return ws;
    } catch (error) {
      console.error(`[LSPService] Failed to create WebSocket for ${language}:`, error);
      return null;
    }
  }

  /**
   * Get LSP features for CodeMirror integration
   * Returns an array of CodeMirror extensions
   */
  getLSPExtensions(language, documentUri, view) {
    // This will be implemented when we have a working LSP client
    // For now, return empty array
    return [];
  }

  /**
   * Close LSP client for a language
   */
  async closeClient(language) {
    const client = this.clients.get(language);
    if (client) {
      try {
        // Close WebSocket if exists
        const ws = this.wsConnections.get(language);
        if (ws) {
          ws.close();
        }

        this.clients.delete(language);
        console.log(`[LSPService] Closed LSP client for ${language}`);
      } catch (error) {
        console.error(`[LSPService] Error closing client for ${language}:`, error);
      }
    }
  }

  /**
   * Close all LSP clients
   */
  async closeAllClients() {
    const languages = Array.from(this.clients.keys());
    for (const language of languages) {
      await this.closeClient(language);
    }
  }

  /**
   * Update settings
   */
  updateSettings(settings) {
    this.initialize(settings);

    // If LSP was disabled, close all clients
    if (!this.enabled) {
      this.closeAllClients();
    }
  }
}

// Export singleton instance
export const lspService = new LSPService();
