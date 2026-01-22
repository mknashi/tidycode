import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { X, Trash2, Plus } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '../utils/platform';

/**
 * TerminalPanel Component
 * Provides an integrated terminal emulator using xterm.js
 * Supports multiple terminal instances and shell command execution
 */
const TerminalPanel = forwardRef(({ theme, onClose }, ref) => {
  const terminalRefs = useRef([]);
  const xtermInstances = useRef([]);
  const fitAddons = useRef([]);
  const [terminals, setTerminals] = useState([{ id: 1, title: 'Terminal 1' }]);
  const [activeTerminal, setActiveTerminal] = useState(1);
  const nextIdRef = useRef(2);
  const shellProcesses = useRef(new Map()); // Map<terminalId, processId>
  const lastDimensionsRef = useRef(new Map()); // Track last rows/cols seen by each terminal and sync status
  const resizeObservers = useRef([]); // ResizeObserver instances per terminal
  const initializingTerminals = useRef(new Set()); // Track which terminals are currently initializing (by index)
  const [terminalHeight, setTerminalHeight] = useState(300);
  const isResizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);
  const resizeTimeoutRef = useRef(null);
  const pendingFocusIdRef = useRef(null); // Focus request for newly created terminals

  const getPixelSize = useCallback((terminalId) => {
    const index = terminals.findIndex(t => t.id === terminalId);
    const el = terminalRefs.current[index];
    if (!el) return { pixelWidth: 0, pixelHeight: 0 };
    const rect = el.getBoundingClientRect();
    return {
      pixelWidth: Math.max(0, Math.round(rect.width)),
      pixelHeight: Math.max(0, Math.round(rect.height))
    };
  }, [terminals]);

  // Keep PTY size in sync with the xterm instance (including late font measurements)
  const syncShellSize = useCallback(async (terminalId, rows, cols, opts = {}) => {
    if (!isDesktop()) return;

    const hasShell = shellProcesses.current.has(terminalId);
    const last = lastDimensionsRef.current.get(terminalId);
    const force = opts.force || false;
    const pixelWidth = opts.pixelWidth ?? 0;
    const pixelHeight = opts.pixelHeight ?? 0;

    // Skip redundant resizes unless explicitly forced
    if (!force && last && last.rows === rows && last.cols === cols) {
      return;
    }

    // Store dimensions; mark whether the PTY has been updated
    lastDimensionsRef.current.set(terminalId, { rows, cols, synced: hasShell });

    if (!hasShell && !force) {
      return; // Shell not started yet; keep latest size for when it is
    }

    try {
      await invoke('resize_shell', {
        terminalId,
        rows,
        cols,
        pixelWidth,
        pixelHeight
      });
      lastDimensionsRef.current.set(terminalId, { rows, cols, synced: true });
      console.log(`[TerminalPanel] Synced PTY for terminal ${terminalId} to ${cols}x${rows}`);
    } catch (error) {
      console.error('[TerminalPanel] Failed to sync PTY size:', error);
    }
  }, []);

  // Fit xterm to its container, align rows/cols with proposed dimensions, and sync PTY
  const fitAndSync = useCallback(async (index, opts = {}) => {
    const fitAddon = fitAddons.current[index];
    const xterm = xtermInstances.current[index];
    const terminal = terminals[index];
    if (!fitAddon || !xterm || !terminal) return null;

    try {
      const proposed = fitAddon.proposeDimensions();
      if (proposed && proposed.cols && proposed.rows) {
        xterm.resize(proposed.cols, proposed.rows);
      }
      fitAddon.fit();
      const rows = xterm.rows;
      const cols = xterm.cols;
      const { pixelWidth, pixelHeight } = getPixelSize(terminal.id);
      await syncShellSize(terminal.id, rows, cols, { pixelWidth, pixelHeight, force: opts.force });
      return { rows, cols };
    } catch (error) {
      console.error('[TerminalPanel] fitAndSync failed:', error);
      return null;
    }
  }, [terminals, getPixelSize, syncShellSize]);

  // Handle terminal panel resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizing.current) {
        // Calculate the delta from the starting point
        const delta = startY.current - e.clientY;
        const newHeight = startHeight.current + delta;
        setTerminalHeight(Math.max(100, Math.min(newHeight, window.innerHeight - 100)));
      }
    };

    const handleMouseUp = async () => {
      isResizing.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';

      // Fit all terminals after resize is complete
      for (let i = 0; i < fitAddons.current.length; i++) {
        await fitAndSync(i, { force: true });
      }

      // Don't auto-focus terminal after resize to prevent stealing focus from editor
      // const activeIndex = terminals.findIndex(t => t.id === activeTerminal);
      // const activeXterm = xtermInstances.current[activeIndex];
      // if (activeXterm) {
      //   setTimeout(() => {
      //     activeXterm.focus();
      //     console.log('[TerminalPanel] Refocused terminal after resize');
      //   }, 50);
      // }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [terminals, fitAndSync]);

  // Extract terminal initialization logic into a reusable function
  const initializeTerminal = async (index, terminal, terminalElement) => {
    if (initializingTerminals.current.has(index)) {
      console.log('[TerminalPanel] Terminal', index, 'already initializing, skipping...');
      return;
    }

    if (!terminalElement) {
      console.warn('[TerminalPanel] Terminal element not found for terminal', index);
      return;
    }

    if (xtermInstances.current[index]) {
      console.log('[TerminalPanel] Terminal', index, 'already initialized');
      return;
    }

    initializingTerminals.current.add(index);
    console.log('[TerminalPanel] Starting initialization for terminal', index);

    try {
      console.log('[TerminalPanel] About to instantiate Terminal with theme:', theme);
      const xterm = new Terminal({
        cursorBlink: true,
        fontSize: 12,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        scrollback: 10000,
        // Disable scrollbar - terminals should use scrollback buffer only
        scrollOnUserInput: true,
        theme: theme === 'dark' ? {
          background: '#1f2937',
          foreground: '#f3f4f6',
          cursor: '#60a5fa',
          cursorAccent: '#1f2937',
          selection: 'rgba(96, 165, 250, 0.3)',
          black: '#1f2937',
          red: '#ef4444',
          green: '#10b981',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#f3f4f6',
          brightBlack: '#4b5563',
          brightRed: '#f87171',
          brightGreen: '#34d399',
          brightYellow: '#fbbf24',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#ffffff'
        } : {
          background: '#ffffff',
          foreground: '#1f2937',
          cursor: '#3b82f6',
          cursorAccent: '#ffffff',
          selection: 'rgba(59, 130, 246, 0.3)',
          black: '#1f2937',
          red: '#dc2626',
          green: '#059669',
          yellow: '#d97706',
          blue: '#2563eb',
          magenta: '#9333ea',
          cyan: '#0891b2',
          white: '#f3f4f6',
          brightBlack: '#6b7280',
          brightRed: '#ef4444',
          brightGreen: '#10b981',
          brightYellow: '#f59e0b',
          brightBlue: '#3b82f6',
          brightMagenta: '#a855f7',
          brightCyan: '#06b6d4',
          brightWhite: '#ffffff'
        },
        rows: 24,
        cols: 80,
        allowProposedApi: true
      });
      console.log('[TerminalPanel] Terminal instance created successfully');

      // Add addons
      console.log('[TerminalPanel] Creating and loading addons...');
      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);
      xterm.loadAddon(new WebLinksAddon());
      console.log('[TerminalPanel] Addons loaded successfully');

      // Open terminal in DOM
      console.log('[TerminalPanel] Opening terminal in DOM element...');
      xterm.open(terminalElement);
      console.log('[TerminalPanel] Terminal opened in DOM');

      // Sync backend PTY whenever xterm recalculates its geometry (e.g., after fonts load)
      xterm.onResize(({ cols, rows }) => {
        const { pixelWidth, pixelHeight } = getPixelSize(terminal.id);
        syncShellSize(terminal.id, rows, cols, { pixelWidth, pixelHeight });
      });

      // Wait for terminal to be ready before fitting
      // Use multiple fit attempts to ensure proper sizing and track when dimensions stabilize
      let lastCols = 0;
      let lastRows = 0;
      let stableCount = 0;

      const fitTerminal = async () => {
        try {
          console.log('[TerminalPanel] Attempting to fit terminal...');
          await fitAndSync(index, { force: true });
          const rows = xterm.rows;
          const cols = xterm.cols;
          console.log('[TerminalPanel] Terminal fitted to', cols, 'x', rows);

          // Check if dimensions have stabilized
          if (cols === lastCols && rows === lastRows) {
            stableCount++;
            console.log('[TerminalPanel] Dimensions stable for', stableCount, 'attempts');
          } else {
            stableCount = 0;
            lastCols = cols;
            lastRows = rows;
          }
        } catch (error) {
          console.warn('[TerminalPanel] Failed to fit terminal on initial load:', error);
        }
      };

      // First fit after 100ms
      setTimeout(() => fitTerminal(), 100);
      // Second fit after 200ms to catch any layout changes
      setTimeout(() => fitTerminal(), 200);
      // Third fit after 300ms
      setTimeout(() => fitTerminal(), 300);

      // Store instances
      xtermInstances.current[index] = xterm;
      fitAddons.current[index] = fitAddon;
      console.log('[TerminalPanel] Stored terminal instances');

      // Auto-focus newly created terminals (menu/toolbar/+) once initialized
      if (pendingFocusIdRef.current === terminal.id || activeTerminal === terminal.id) {
        focusTerminalById(terminal.id, 'init');
      }

      // Start shell process - wait for fit to complete first
      try {
        // Wait for fit to complete before spawning shell
        await new Promise(resolve => setTimeout(resolve, 350));

        // Get terminal dimensions after fit
        const rows = xterm.rows;
        const cols = xterm.cols;
        console.log(`[TerminalPanel] Spawning shell for terminal ${terminal.id} with size ${cols}x${rows}`);

        // Spawn shell with correct PTY dimensions from the start
        const { pixelWidth, pixelHeight } = getPixelSize(terminal.id);

        // Get working directory from localStorage (last opened folder) or default to null
        let workingDir = null;
        try {
          workingDir = localStorage.getItem('tidycode-last-folder');
          if (workingDir) {
            console.log(`[TerminalPanel] Using working directory from last folder: ${workingDir}`);
          } else {
            console.log(`[TerminalPanel] No last folder found, will use HOME directory`);
          }
        } catch (e) {
          console.warn('[TerminalPanel] Failed to read last folder from localStorage:', e);
        }

        console.log(`[TerminalPanel] Attempting to spawn shell for terminal ${terminal.id} with size ${cols}x${rows}, pixels ${pixelWidth}x${pixelHeight}, workingDir: ${workingDir || 'HOME'}`);

        const processId = await invoke('spawn_shell', {
          terminalId: terminal.id,
          rows,
          cols,
          pixelWidth,
          pixelHeight,
          workingDir
        });

        shellProcesses.current.set(terminal.id, processId);
        console.log(`[TerminalPanel] Shell process ${processId} started for terminal ${terminal.id} with PTY size ${cols}x${rows}`);

        // Wait a bit for shell to initialize, then send another resize to ensure the shell knows the dimensions
        await new Promise(resolve => setTimeout(resolve, 200));
        await syncShellSize(terminal.id, rows, cols, { pixelWidth, pixelHeight, force: true });

        // Handle terminal input
        xterm.onData(async (data) => {
          try {
            await invoke('write_to_shell', {
              terminalId: terminal.id,
              data: data
            });
          } catch (error) {
            console.error('[TerminalPanel] Failed to write to shell:', error);
            xterm.write('\r\n\x1b[31mError: Failed to write to shell\x1b[0m\r\n');
          }
        });

        // Poll for output
        const pollOutput = async () => {
          try {
            const output = await invoke('read_from_shell', {
              terminalId: terminal.id
            });
            if (output && output.length > 0) {
              xterm.write(output);
            }
          } catch (error) {
            console.error('[TerminalPanel] Failed to read from shell:', error);
          }
        };

        // Poll every 50ms
        const pollInterval = setInterval(pollOutput, 50);

        // Store interval for cleanup
        xterm._pollInterval = pollInterval;

        // Welcome message
        xterm.writeln('\x1b[1;36mTidy Code Terminal\x1b[0m');
        xterm.writeln('\x1b[90mType commands and press Enter\x1b[0m');
        xterm.writeln('');

      } catch (shellError) {
        console.error('[TerminalPanel] Failed to start shell:', shellError);
        console.error('[TerminalPanel] Shell error details:', {
          terminalId: terminal.id,
          error: shellError,
          message: shellError?.message || String(shellError)
        });
        xterm.writeln('\r\n\x1b[31mError: Failed to start shell process\x1b[0m');
        xterm.writeln(`\x1b[90m${shellError?.message || String(shellError)}\x1b[0m`);
        xterm.writeln('\x1b[90mTerminal functionality requires desktop mode\x1b[0m\r\n');
      }
    } catch (error) {
      console.error('[TerminalPanel] Failed to initialize terminal:', error);
      console.error('[TerminalPanel] Error stack:', error.stack);
    } finally {
      initializingTerminals.current.delete(index);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      xtermInstances.current.forEach((xterm, i) => {
        if (xterm) {
          if (xterm._pollInterval) {
            clearInterval(xterm._pollInterval);
          }
          xterm.dispose();
        }
      });

      // Kill shell processes
      shellProcesses.current.forEach(async (processId, terminalId) => {
        try {
          await invoke('kill_shell', { terminalId });
          console.log(`[TerminalPanel] Shell process ${processId} killed for terminal ${terminalId}`);
        } catch (error) {
          console.error('[TerminalPanel] Failed to kill shell:', error);
        }
      });

      xtermInstances.current = [];
      fitAddons.current = [];
      terminalRefs.current = [];
      shellProcesses.current.clear();
    };
  }, []);

  // Handle window resize with debounce
  useEffect(() => {
    const handleResize = () => {
      // Clear existing timeout
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      // Debounce resize to avoid too many calls
      resizeTimeoutRef.current = setTimeout(async () => {
        for (let i = 0; i < fitAddons.current.length; i++) {
          const fitAddon = fitAddons.current[i];
          const xterm = xtermInstances.current[i];
          if (fitAddon && xterm) {
            try {
              // Wait a bit for fit to complete
              await new Promise(resolve => setTimeout(resolve, 10));
              await fitAndSync(i, { force: true });
            } catch (error) {
              console.error('[TerminalPanel] Failed to fit terminal:', error);
            }
          }
        }
      }, 150); // Debounce for 150ms
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [terminals]);

  // Keep PTY size in sync when the active terminal or panel height changes (e.g., after reopening)
  useEffect(() => {
    const index = terminals.findIndex(t => t.id === activeTerminal);
    if (index === -1) return;

    if (index !== -1) {
      fitAndSync(index, { force: true }).catch((error) => {
        console.error('[TerminalPanel] Failed to sync size on active change/height change:', error);
      });
    }
  }, [activeTerminal, terminalHeight, terminals, fitAndSync]);

  const focusTerminalById = useCallback((terminalId, reason = 'manual') => {
    const index = terminals.findIndex(t => t.id === terminalId);
    if (index === -1) return false;
    const xterm = xtermInstances.current[index];
    if (!xterm) return false;
    setTimeout(() => {
      xterm.focus();
      console.log('[TerminalPanel] Focused terminal', terminalId, 'reason:', reason);
    }, 20);
    pendingFocusIdRef.current = null;
    return true;
  }, [terminals]);

  // Observe DOM size changes (including those not captured by window resize) and keep PTY in sync
  useEffect(() => {
    // Disconnect any existing observers
    resizeObservers.current.forEach(observer => observer?.disconnect());
    resizeObservers.current = [];

    terminals.forEach((terminal, index) => {
      const el = terminalRefs.current[index];
      if (!el) return;

      const observer = new ResizeObserver(() => {
        fitAndSync(index).catch((error) => {
          console.error('[TerminalPanel] ResizeObserver fit/sync failed:', error);
        });
      });

      observer.observe(el);
      resizeObservers.current[index] = observer;
    });

    return () => {
      resizeObservers.current.forEach(observer => observer?.disconnect());
      resizeObservers.current = [];
    };
  }, [terminals, fitAndSync]);

  const addTerminal = () => {
    const newId = nextIdRef.current;
    nextIdRef.current += 1;
    pendingFocusIdRef.current = newId;
    setTerminals(prev => [...prev, { id: newId, title: `Terminal ${newId}` }]);
    setActiveTerminal(newId);
  };

  // Expose addTerminal function via ref
  useImperativeHandle(ref, () => ({
    addTerminal
  }));

  // Focus terminal when switching tabs (only if the user explicitly switched tabs)
  // This effect should only run when activeTerminal changes, not when terminals array changes
  const prevActiveTerminal = useRef(activeTerminal);
  useEffect(() => {
    // Only focus if activeTerminal actually changed (user clicked a different tab)
    if (prevActiveTerminal.current !== activeTerminal) {
      const focused = focusTerminalById(activeTerminal, 'tab-switch');
      if (!focused) {
        pendingFocusIdRef.current = activeTerminal;
      }
      prevActiveTerminal.current = activeTerminal;
    }
  }, [activeTerminal, terminals, focusTerminalById]);

  const closeTerminal = async (terminalId) => {
    if (terminals.length === 1) {
      // Don't close the last terminal
      return;
    }

    const index = terminals.findIndex(t => t.id === terminalId);
    if (index === -1) return;

    // Kill shell process
    try {
      await invoke('kill_shell', { terminalId });
      shellProcesses.current.delete(terminalId);
    } catch (error) {
      console.error('[TerminalPanel] Failed to kill shell:', error);
    }

    // Dispose xterm instance
    const xterm = xtermInstances.current[index];
    if (xterm) {
      if (xterm._pollInterval) {
        clearInterval(xterm._pollInterval);
      }
      xterm.dispose();
    }

    // Remove from arrays
    xtermInstances.current.splice(index, 1);
    fitAddons.current.splice(index, 1);
    terminalRefs.current.splice(index, 1);

    // Update state
    setTerminals(prev => prev.filter(t => t.id !== terminalId));

    // Switch to another terminal
    if (activeTerminal === terminalId) {
      const nextTerminal = terminals[index === 0 ? 1 : index - 1];
      setActiveTerminal(nextTerminal.id);
    }
  };

  const clearTerminal = () => {
    const index = terminals.findIndex(t => t.id === activeTerminal);
    const xterm = xtermInstances.current[index];
    if (xterm) {
      xterm.clear();
    }
  };

  return (
    <div
      className={`flex flex-col border-t ${
        theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
      }`}
      style={{ height: `${terminalHeight}px` }}
    >
      {/* Resize handle */}
      <div
        className={`h-1 cursor-ns-resize hover:bg-blue-500 transition-colors ${
          theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
        }`}
        onMouseDown={(e) => {
          isResizing.current = true;
          startY.current = e.clientY;
          startHeight.current = terminalHeight;
          document.body.style.cursor = 'ns-resize';
          document.body.style.userSelect = 'none';
        }}
        title="Drag to resize terminal"
      />

      {/* Header with tabs */}
      <div className={`flex items-center justify-between border-b ${
        theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
      }`}>
        <div className="flex items-center flex-1 overflow-x-auto">
          {terminals.map((terminal) => (
            <div
              key={terminal.id}
              className={`flex items-center gap-2 px-2 py-1 border-r cursor-pointer transition-colors ${
                activeTerminal === terminal.id
                  ? theme === 'dark'
                    ? 'bg-gray-900 text-white border-blue-500 border-b-2'
                    : 'bg-white text-gray-900 border-blue-500 border-b-2'
                  : theme === 'dark'
                  ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 border-gray-700'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-200'
              }`}
              onClick={() => setActiveTerminal(terminal.id)}
            >
              <span className="text-xs font-medium">{terminal.title}</span>
              {terminals.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTerminal(terminal.id);
                  }}
                  className={`p-0.5 rounded transition-colors ${
                    theme === 'dark'
                      ? 'hover:bg-gray-600 text-gray-400 hover:text-gray-200'
                      : 'hover:bg-gray-300 text-gray-600 hover:text-gray-900'
                  }`}
                  title="Close terminal"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {/* Add terminal button - right after tabs */}
          <button
            onClick={addTerminal}
            className={`p-1 mx-1 rounded transition-colors ${
              theme === 'dark'
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'
            }`}
            title="New terminal"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 px-2 py-1">
          <button
            onClick={clearTerminal}
            className={`p-1 rounded transition-colors ${
              theme === 'dark'
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'
            }`}
            title="Clear terminal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className={`p-1 rounded transition-colors ${
              theme === 'dark'
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'
            }`}
            title="Close terminal panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal containers */}
      <div className="flex-1 relative overflow-hidden">
        {terminals.map((terminal, index) => (
          <div
            key={terminal.id}
            ref={(el) => {
              if (el) {
                const needsInit = !xtermInstances.current[index];
                if (!terminalRefs.current[index]) {
                  console.log('[TerminalPanel] Ref callback called for terminal', index, 'element:', el);
                  terminalRefs.current[index] = el;
                }
                // Trigger initialization when ref is set and terminal not initialized
                if (isDesktop() && needsInit && !initializingTerminals.current.has(index)) {
                  console.log('[TerminalPanel] Triggering initialization from ref callback for terminal', index);
                  // Let initializeTerminal manage the flag - don't set it here!
                  setTimeout(() => {
                    const initializeTerminals = async () => {
                      await initializeTerminal(index, terminal, el);
                    };
                    initializeTerminals();
                  }, 0);
                }
              }
            }}
            onClick={() => {
              // Focus terminal when clicked
              const xterm = xtermInstances.current[index];
              if (xterm && activeTerminal === terminal.id) {
                xterm.focus();
                console.log('[TerminalPanel] Terminal focused on click');
              }
            }}
            tabIndex={-1}
            className={`absolute inset-0 ${
              activeTerminal === terminal.id ? 'block' : 'hidden'
            }`}
            style={{ padding: '8px 8px 20px 8px', outline: 'none' }}
          />
        ))}
      </div>

      {/* Status bar */}
      <div className={`px-2 py-0.5 text-xs border-t ${
        theme === 'dark'
          ? 'bg-gray-800 border-gray-700 text-gray-500'
          : 'bg-gray-50 border-gray-200 text-gray-400'
      }`}>
        {terminals.length} {terminals.length === 1 ? 'terminal' : 'terminals'} open
        {!isDesktop() && (
          <span className="ml-2 text-orange-500">⚠ Terminal only available in desktop mode</span>
        )}
      </div>
    </div>
  );
});

TerminalPanel.displayName = 'TerminalPanel';

export default TerminalPanel;
