import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Folder, FolderOpen, File, ChevronRight, ChevronDown,
  Plus, Trash2, Edit2, RefreshCw, FolderPlus, FilePlus,
  Home, Search, X
} from 'lucide-react';

// Helper to check if running in Tauri desktop environment
const isDesktop = () => {
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__;
};

// Lazy-load the drag plugin only in desktop mode
let startDragFn = null;
let dragIconPath = null;

const getStartDrag = async () => {
  if (!isDesktop()) return null;
  if (!startDragFn) {
    try {
      const dragModule = await import('@crabnebula/tauri-plugin-drag');
      startDragFn = dragModule.startDrag;
    } catch (e) {
      console.warn('Drag plugin not available:', e);
      return null;
    }
  }
  return startDragFn;
};

// Get the drag icon path (cached)
const getDragIconPath = async () => {
  if (dragIconPath) return dragIconPath;
  if (!isDesktop()) return null;
  try {
    const { resolveResource } = await import('@tauri-apps/api/path');
    dragIconPath = await resolveResource('icons/32x32.png');
    return dragIconPath;
  } catch (e) {
    console.warn('Could not resolve drag icon:', e);
    return null;
  }
};

const FileSystemBrowser = ({ theme, onFileOpen, onClose, onRootPathChange, selectedFilePath, suppressScrollRef }) => {
  const [rootPath, setRootPath] = useState(() => {
    // Restore last folder from localStorage
    try {
      return localStorage.getItem('tidycode-last-folder') || '';
    } catch {
      return '';
    }
  });
  const [fileTree, setFileTree] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [isRenaming, setIsRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(null); // { type: 'file' | 'folder', parentPath: string }
  const [createDialogValue, setCreateDialogValue] = useState('');
  // Track whether selection came from clicking within this component (should NOT scroll)
  // or from external source like tab bar click (SHOULD scroll)
  const shouldScrollOnSelectRef = useRef(false);
  const normalizeFsPath = (p = '') => p.replace(/\\/g, '/').replace(/\/+$/, '');

  // Update selected item and expand folders when selectedFilePath prop changes
  useEffect(() => {
    if (selectedFilePath && rootPath) {
      const normalizedRoot = normalizeFsPath(rootPath);
      const normalizedSelected = normalizeFsPath(selectedFilePath);

      if (!normalizedRoot || !normalizedSelected) return;

      // Check if scroll should be suppressed (e.g., when selection came from TabsExplorer)
      const shouldSuppressScroll = suppressScrollRef?.current;
      if (shouldSuppressScroll) {
        // Reset the flag after checking
        suppressScrollRef.current = false;
      } else {
        // Enable scroll since this is a legitimate external selection (like tab click)
        shouldScrollOnSelectRef.current = true;
      }

      setSelectedItem(selectedFilePath);

      // Only expand if selected file sits under the current root
      const matchesRoot = normalizedSelected.toLowerCase().startsWith(normalizedRoot.toLowerCase());
      if (!matchesRoot) return;

      // Auto-expand parent folders to show the selected file
      const relativePath = normalizedSelected.slice(normalizedRoot.length).replace(/^\/+/, '');
      if (!relativePath) return;

      setExpandedFolders(prev => {
        const next = new Set(prev);
        let currentPath = normalizedRoot;
        const pathParts = relativePath.split('/');

        // Expand all parent folders except the file itself
        pathParts.slice(0, -1).forEach(part => {
          currentPath = `${currentPath}/${part}`;
          next.add(currentPath);
        });

        return next;
      });
    }
  }, [selectedFilePath, rootPath]);

  // Load last folder on mount
  useEffect(() => {
    if (rootPath) {
      loadDirectory(rootPath).then(entries => {
        if (entries && entries.length > 0) {
          setFileTree(entries);
        } else {
          // If folder doesn't exist anymore, clear it
          setRootPath('');
          localStorage.removeItem('tidycode-last-folder');
        }
      });
    }
  }, []); // Only run once on mount

  // Notify parent when rootPath changes
  useEffect(() => {
    if (onRootPathChange) {
      onRootPathChange(rootPath);
    }
  }, [rootPath, onRootPathChange]);

  // Load directory contents
  const loadDirectory = async (path) => {
    try {
      const entries = await invoke('read_directory', { path });
      return entries;
    } catch (error) {
      console.error('Failed to load directory:', error);
      return [];
    }
  };

  // Open folder dialog
  const selectRootFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Folder to Open'
      });

      if (selected) {
        setRootPath(selected);
        const entries = await loadDirectory(selected);
        setFileTree(entries);
        // Save to localStorage
        try {
          localStorage.setItem('tidycode-last-folder', selected);
        } catch (error) {
          console.error('Failed to save last folder:', error);
        }
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  // Toggle folder expansion
  const toggleFolder = async (path, isExpanded) => {
    const newExpanded = new Set(expandedFolders);

    if (isExpanded) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }

    setExpandedFolders(newExpanded);
  };

  // Get child entries for a folder
  const getChildEntries = async (path) => {
    return await loadDirectory(path);
  };

  // Handle file/folder click
  const handleItemClick = async (item) => {
    if (item.is_dir) {
      await toggleFolder(item.path, expandedFolders.has(item.path));
    } else {
      // Enable scroll since user clicked within this component
      shouldScrollOnSelectRef.current = true;
      setSelectedItem(item.path);
      if (onFileOpen) {
        try {
          console.log('[FileSystemBrowser] Reading file:', item.path);

          // Use smart file reader for better performance on large files
          const { readFile } = await import('../utils/fileReader');
          const content = await readFile(item.path);

          console.log('[FileSystemBrowser] File read successfully, content length:', content?.length || 0);
          onFileOpen({
            name: item.name,
            path: item.path,
            content
          });
        } catch (error) {
          console.error('[FileSystemBrowser] Failed to read file:', item.path, error);
          alert(`Failed to open file: ${error}`);
        }
      }
    }
  };

  // Context menu actions
  const handleContextMenu = (e, item) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const createNewFile = (parentPath) => {
    closeContextMenu();
    setShowCreateDialog({ type: 'file', parentPath });
    setCreateDialogValue('');
  };

  const createNewFolder = (parentPath) => {
    closeContextMenu();
    setShowCreateDialog({ type: 'folder', parentPath });
    setCreateDialogValue('');
  };

  const handleCreateConfirm = async () => {
    if (!showCreateDialog || !createDialogValue.trim()) return;

    const { type, parentPath } = showCreateDialog;
    const name = createDialogValue.trim();

    try {
      if (type === 'file') {
        const filePath = `${parentPath}/${name}`;
        await invoke('create_file', { path: filePath, content: '' });
      } else {
        const folderPath = `${parentPath}/${name}`;
        await invoke('create_directory', { path: folderPath });
      }
      await refreshDirectory();
      setShowCreateDialog(null);
      setCreateDialogValue('');
    } catch (error) {
      console.error(`Failed to create ${type}:`, error);
      alert(`Failed to create ${type}: ${error}`);
    }
  };

  const handleCreateCancel = () => {
    setShowCreateDialog(null);
    setCreateDialogValue('');
  };

  const deleteItem = async (path, name) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      try {
        await invoke('delete_path', { path });
        await refreshDirectory();
      } catch (error) {
        console.error('Failed to delete:', error);
        alert(`Failed to delete: ${error}`);
      }
    }
    closeContextMenu();
  };

  const startRename = (item) => {
    setIsRenaming(item.path);
    setRenameValue(item.name);
    closeContextMenu();
  };

  const completeRename = async (oldPath) => {
    if (renameValue && renameValue !== oldPath.split('/').pop()) {
      try {
        const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
        const newPath = `${parentPath}/${renameValue}`;
        await invoke('rename_path', { oldPath, newPath });
        await refreshDirectory();
      } catch (error) {
        console.error('Failed to rename:', error);
        alert(`Failed to rename: ${error}`);
      }
    }
    setIsRenaming(null);
    setRenameValue('');
  };

  const refreshDirectory = async () => {
    if (rootPath) {
      const entries = await loadDirectory(rootPath);
      setFileTree(entries);
    }
  };

  // Search functionality
  const handleSearch = async () => {
    if (!searchQuery || !rootPath) return;

    setIsSearching(true);
    try {
      const results = await invoke('search_files', {
        rootPath,
        pattern: searchQuery,
        maxDepth: null
      });
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    }
    setIsSearching(false);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  // Recursive file tree renderer
  const FileTreeItem = ({ item, depth = 0 }) => {
    const [children, setChildren] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const isExpanded = expandedFolders.has(item.path);
    const isSelected = selectedItem === item.path;
    const isBeingRenamed = isRenaming === item.path;
    const itemRef = useRef(null);

    useEffect(() => {
      if (item.is_dir && isExpanded && children.length === 0) {
        setIsLoading(true);
        getChildEntries(item.path).then((entries) => {
          setChildren(entries);
          setIsLoading(false);
        });
      }
    }, [isExpanded]);

    // Scroll into view when selected (only if triggered from within this component)
    useEffect(() => {
      if (isSelected && itemRef.current && shouldScrollOnSelectRef.current) {
        itemRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        // Reset the flag after scrolling
        shouldScrollOnSelectRef.current = false;
      }
    }, [isSelected]);

    // Handle mouse down for files (native drag to desktop)
    // Note: startDrag must be called on mousedown, not dragstart
    const handleMouseDown = async (e) => {
      // Only allow dragging files, not folders
      if (item.is_dir) return;

      // Only trigger on left mouse button
      if (e.button !== 0) return;

      // In desktop mode, use Tauri's native drag
      if (isDesktop()) {
        const startDrag = await getStartDrag();
        const iconPath = await getDragIconPath();
        if (startDrag && iconPath) {
          try {
            // Use app icon as the drag preview
            await startDrag({ item: [item.path], icon: iconPath });
          } catch (err) {
            console.error('Failed to start drag:', err);
          }
        }
      }
    };

    return (
      <div>
        <div
          ref={itemRef}
          onMouseDown={!item.is_dir && isDesktop() ? handleMouseDown : undefined}
          className={`flex items-center gap-1 px-2 py-1 transition-colors ${
            item.is_dir ? 'cursor-pointer' : (isDesktop() ? 'cursor-grab' : 'cursor-pointer')
          } ${
            isSelected
              ? theme === 'dark' ? 'bg-blue-900 bg-opacity-30' : 'bg-blue-100'
              : theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => handleItemClick(item)}
          onContextMenu={(e) => handleContextMenu(e, item)}
          title={item.is_dir ? `Open folder: ${item.name}` : (isDesktop() ? `Drag to desktop or click to open: ${item.name}` : `Click to open: ${item.name}`)}
        >
          {item.is_dir && (
            <span className="flex-shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
          )}
          {!item.is_dir && <span className="w-4" />}

          <span className="flex-shrink-0">
            {item.is_dir ? (
              isExpanded ? (
                <FolderOpen className="w-4 h-4 text-yellow-500" />
              ) : (
                <Folder className="w-4 h-4 text-yellow-500" />
              )
            ) : (
              <File className={`w-4 h-4 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
            )}
          </span>

          {isBeingRenamed ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => completeRename(item.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') completeRename(item.path);
                if (e.key === 'Escape') {
                  setIsRenaming(null);
                  setRenameValue('');
                }
              }}
              autoFocus
              className={`flex-1 px-1 text-sm ${
                theme === 'dark'
                  ? 'bg-gray-700 text-gray-200'
                  : 'bg-white text-gray-800'
              } border rounded`}
            />
          ) : (
            <span className={`flex-1 text-sm truncate ${
              item.is_dir
                ? ''
                : theme === 'dark'
                  ? 'text-blue-300 hover:text-blue-200'
                  : 'text-blue-700 hover:text-blue-800'
            }`}>
              {item.name}
            </span>
          )}
        </div>

        {item.is_dir && isExpanded && (
          <div>
            {isLoading ? (
              <div
                className="text-sm italic px-2 py-1"
                style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
              >
                Loading...
              </div>
            ) : (
              children.map((child) => (
                <FileTreeItem key={child.path} item={child} depth={depth + 1} />
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  // Click outside to close context menu
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu();
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  return (
    <div
      className={`h-full flex flex-col ${
        theme === 'dark' ? 'bg-gray-900 text-gray-200' : 'bg-white text-gray-800'
      }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between p-2 border-b ${
        theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <FolderOpen className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
          <span>File Browser</span>
        </h3>
        <button
          onClick={onClose}
          className={`p-1 rounded hover:bg-opacity-50 ${
            theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Toolbar */}
      <div className={`flex items-center gap-2 p-2 border-b ${
        theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <button
          onClick={selectRootFolder}
          className={`p-1.5 rounded ${
            theme === 'dark'
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
          title="Open Folder"
        >
          <Folder className="w-4 h-4" />
        </button>

        {rootPath && (
          <>
            <button
              onClick={refreshDirectory}
              className={`p-1.5 rounded ${
                theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
              }`}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => createNewFile(rootPath)}
              className={`p-1.5 rounded ${
                theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
              }`}
              title="New File"
            >
              <FilePlus className="w-4 h-4" />
            </button>

            <button
              onClick={() => createNewFolder(rootPath)}
              className={`p-1.5 rounded ${
                theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
              }`}
              title="New Folder"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Search */}
      {rootPath && (
        <div className={`p-2 border-b ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search files..."
              className={`flex-1 px-2 py-1 text-sm rounded border ${
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-600 text-gray-200'
                  : 'bg-white border-gray-300 text-gray-800'
              }`}
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className={`p-1.5 rounded ${
                  theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery}
              className={`p-1.5 rounded ${
                theme === 'dark'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-700'
                  : 'bg-blue-500 hover:bg-blue-600 text-white disabled:bg-gray-300'
              }`}
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* File Tree / Search Results */}
      <div className="flex-1 overflow-auto">
        {!rootPath ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <FolderOpen className={`w-16 h-16 mb-4 ${
              theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
            }`} />
            <p className={`text-sm mb-4 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>
              No folder opened
            </p>
            <button
              onClick={selectRootFolder}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${
                theme === 'dark'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              <FolderPlus className="w-5 h-5" />
              <span className="font-medium">Open Folder</span>
            </button>
          </div>
        ) : searchResults.length > 0 ? (
          <div>
            <div className={`px-2 py-1 text-xs font-semibold ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Search Results ({searchResults.length})
            </div>
            {searchResults.map((path) => (
              <div
                key={path}
                onMouseDown={isDesktop() ? async (e) => {
                  if (e.button !== 0) return; // Only left click
                  const startDrag = await getStartDrag();
                  const iconPath = await getDragIconPath();
                  if (startDrag && iconPath) {
                    try {
                      // Use app icon as the drag preview
                      await startDrag({ item: [path], icon: iconPath });
                    } catch (err) {
                      console.error('Failed to start drag:', err);
                    }
                  }
                } : undefined}
                className={`px-2 py-1 text-sm ${
                  isDesktop() ? 'cursor-grab' : 'cursor-pointer'
                } ${
                  theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                }`}
                onClick={async () => {
                  try {
                    // Use smart file reader for better performance on large files
                    const { readFile } = await import('../utils/fileReader');
                    const content = await readFile(path);

                    onFileOpen({
                      name: path.split('/').pop(),
                      path,
                      content
                    });
                  } catch (error) {
                    console.error('Failed to read file:', error);
                  }
                }}
                title={isDesktop() ? `Drag to desktop or click to open: ${path.split('/').pop()}` : `Open: ${path.split('/').pop()}`}
              >
                <div className="flex items-center gap-2">
                  <File className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{path}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {/* Root folder element */}
            <div
              className={`flex items-center gap-2 px-2 py-2 mb-1 font-medium border-b ${
                theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-700'
              }`}
            >
              <FolderOpen className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <span className="truncate text-sm">
                {rootPath.split('/').pop() || rootPath}
              </span>
            </div>
            {/* File tree items */}
            {fileTree.map((item) => <FileTreeItem key={item.path} item={item} />)}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className={`fixed z-50 shadow-lg rounded border ${
            theme === 'dark'
              ? 'bg-gray-800 border-gray-700'
              : 'bg-white border-gray-200'
          }`}
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`
          }}
        >
          <div className="py-1">
            {contextMenu.item.is_dir && (
              <>
                <button
                  onClick={() => createNewFile(contextMenu.item.path)}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                    theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                  }`}
                >
                  <FilePlus className="w-4 h-4" />
                  New File
                </button>
                <button
                  onClick={() => createNewFolder(contextMenu.item.path)}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                    theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                  }`}
                >
                  <FolderPlus className="w-4 h-4" />
                  New Folder
                </button>
                <div className={`border-t my-1 ${
                  theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                }`} />
              </>
            )}
            <button
              onClick={() => startRename(contextMenu.item)}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
              }`}
            >
              <Edit2 className="w-4 h-4" />
              Rename
            </button>
            <button
              onClick={() => deleteItem(contextMenu.item.path, contextMenu.item.name)}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 text-red-600 ${
                theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Current Path */}
      {rootPath && (
        <div className={`px-2 py-1 text-xs border-t truncate ${
          theme === 'dark'
            ? 'border-gray-700 text-gray-500'
            : 'border-gray-200 text-gray-500'
        }`}>
          {rootPath}
        </div>
      )}

      {/* Create File/Folder Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`p-6 rounded-lg shadow-xl max-w-md w-full ${
            theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-800'
          }`}>
            <h3 className="text-lg font-semibold mb-4">
              Create New {showCreateDialog.type === 'file' ? 'File' : 'Folder'}
            </h3>
            <input
              type="text"
              value={createDialogValue}
              onChange={(e) => setCreateDialogValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateConfirm();
                if (e.key === 'Escape') handleCreateCancel();
              }}
              placeholder={`Enter ${showCreateDialog.type} name`}
              autoFocus
              className={`w-full px-3 py-2 border rounded mb-4 ${
                theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-gray-200'
                  : 'bg-white border-gray-300 text-gray-800'
              }`}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCreateCancel}
                className={`px-4 py-2 rounded ${
                  theme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConfirm}
                disabled={!createDialogValue.trim()}
                className={`px-4 py-2 rounded ${
                  theme === 'dark'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-700 disabled:text-gray-500'
                    : 'bg-blue-500 hover:bg-blue-600 text-white disabled:bg-gray-300 disabled:text-gray-500'
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileSystemBrowser;
