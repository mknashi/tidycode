import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, X, Layers } from 'lucide-react';

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

/**
 * TabsExplorer Component
 * Displays currently open tabs in a tree structure
 * Supports expand/collapse and file highlighting
 *
 * SCROLL BEHAVIOR:
 * - When clicking a tab IN TabsExplorer: NO scrolling in TabsExplorer (user is already looking at it)
 * - When a tab is selected OUTSIDE TabsExplorer (e.g., tab bar): scroll to center that tab
 * - When a file is selected in FileSystemBrowser: scroll to corresponding tab if exists
 */
const TabsExplorer = forwardRef(({ theme, tabs, activeTabId, onTabSelect, onClose, onCloseTab }, ref) => {
  const [expandedFolders, setExpandedFolders] = useState(new Set(['root']));
  const fileRefs = useRef(new Map());
  const containerRef = useRef(null);

  // Handle file selection from within the explorer
  const handleFileClick = useCallback((fileId) => {
    onTabSelect(fileId);
  }, [onTabSelect]);

  // Function to scroll a file into view
  const scrollToFile = useCallback((fileId) => {
    const element = fileRefs.current.get(fileId);
    const container = containerRef.current;

    if (element && container) {
      const elementRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Check if element is outside visible area
      const isAbove = elementRect.top < containerRect.top;
      const isBelow = elementRect.bottom > containerRect.bottom;

      if (isAbove || isBelow) {
        const elementTopRelativeToContainer = elementRect.top - containerRect.top + container.scrollTop;
        const containerHeight = container.clientHeight;
        const elementHeight = elementRect.height;
        const scrollTo = elementTopRelativeToContainer - (containerHeight / 2) + (elementHeight / 2);

        container.scrollTo({
          top: Math.max(0, scrollTo),
          behavior: 'smooth'
        });
      }
    }
  }, []);

  // Expose scrollToFile method via ref
  useImperativeHandle(ref, () => ({
    scrollToFile
  }), [scrollToFile]);

  // NOTE: Auto-scroll is disabled for internal clicks.
  // scrollToFile can be called externally via the ref if needed.

  // Group tabs by directory - maintain original tab order
  const groupTabsByDirectory = () => {
    const tree = { name: 'Open Files', children: [] };
    const fileMap = new Map();
    const directoryOrder = []; // Track order of directories as they appear

    tabs.forEach((tab, index) => {
      // Use tab.name or tab.title as fallback, default to 'Untitled'
      const tabName = tab.name || tab.title || 'Untitled';
      const parts = tabName.split('/');
      const fileName = parts[parts.length - 1];
      const directory = parts.length > 1 ? parts.slice(0, -1).join('/') : 'root';

      if (!fileMap.has(directory)) {
        fileMap.set(directory, []);
        directoryOrder.push(directory);
      }

      fileMap.get(directory).push({
        id: tab.id,
        name: fileName,
        fullPath: tabName,
        absolutePath: tab.absolutePath, // Include absolutePath for drag support
        isModified: tab.isModified,
        originalIndex: index // Preserve original order
      });
    });

    // Convert map to tree structure - use directoryOrder to maintain order
    directoryOrder.forEach(dir => {
      const files = fileMap.get(dir); // Don't sort - keep original order

      if (dir === 'root') {
        tree.children.push(...files);
      } else {
        tree.children.push({
          name: dir,
          isDirectory: true,
          children: files
        });
      }
    });

    return tree;
  };

  const toggleFolder = (folderName) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderName)) {
        next.delete(folderName);
      } else {
        next.add(folderName);
      }
      return next;
    });
  };

  const renderFile = (file) => {
    const isActive = file.id === activeTabId;
    const canDrag = isDesktop() && file.absolutePath;

    // Handle mouse down for files (native drag to desktop)
    // Note: startDrag must be called on mousedown, not dragstart
    const handleMouseDown = async (e) => {
      if (!canDrag) return;
      if (e.button !== 0) return; // Only left click

      const startDrag = await getStartDrag();
      const iconPath = await getDragIconPath();
      if (startDrag && iconPath) {
        try {
          // Use app icon as the drag preview
          await startDrag({ item: [file.absolutePath], icon: iconPath });
        } catch (err) {
          console.error('Failed to start drag:', err);
        }
      }
    };

    return (
      <div
        key={file.id}
        ref={(el) => {
          if (el) {
            fileRefs.current.set(file.id, el);
          } else {
            fileRefs.current.delete(file.id);
          }
        }}
        onMouseDown={canDrag ? handleMouseDown : undefined}
        className={`flex items-center gap-2 px-3 py-1.5 group transition-colors ${
          canDrag ? 'cursor-grab' : 'cursor-pointer'
        } ${
          isActive
            ? theme === 'dark'
              ? 'bg-gray-900 text-white border-l-2 border-l-blue-500'
              : 'bg-gray-200 text-gray-900 border-l-2 border-l-blue-500'
            : theme === 'dark'
            ? 'hover:bg-gray-700 text-gray-300 border-l-2 border-l-transparent'
            : 'hover:bg-gray-100 text-gray-700 border-l-2 border-l-transparent'
        }`}
        onClick={() => handleFileClick(file.id)}
        title={canDrag ? `Drag to desktop or click to view: ${file.fullPath}` : file.fullPath}
      >
        <FileText className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 truncate text-sm">
          {file.name}
          {file.isModified && <span className="ml-1 text-orange-400">●</span>}
        </span>
        {onCloseTab && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(file.id);
            }}
            className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all ${
              theme === 'dark'
                ? 'hover:bg-gray-600 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-300 text-gray-600 hover:text-gray-900'
            }`}
            title="Close file"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  const renderFolder = (folder, level = 0) => {
    const isExpanded = expandedFolders.has(folder.name);

    return (
      <div key={folder.name}>
        <div
          onClick={() => toggleFolder(folder.name)}
          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
            theme === 'dark'
              ? 'hover:bg-gray-700 text-gray-300'
              : 'hover:bg-gray-100 text-gray-700'
          }`}
          style={{ paddingLeft: `${level * 12 + 12}px` }}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Folder className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="flex-1 truncate text-sm font-medium">{folder.name}</span>
        </div>

        {isExpanded && folder.children && (
          <div>
            {folder.children.map(child =>
              child.isDirectory
                ? renderFolder(child, level + 1)
                : <div key={child.id} style={{ paddingLeft: `${(level + 1) * 12 + 12}px` }}>
                    {renderFile(child)}
                  </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const tree = groupTabsByDirectory();

  return (
    <div className={`flex flex-col h-full border-r ${
      theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-3 border-b ${
        theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <h3 className="font-semibold text-sm uppercase tracking-wide flex items-center gap-2">
          {theme === 'dark' ? (
            <>
              <Layers className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400">Open Tabs</span>
            </>
          ) : (
            <>
              <Layers className="w-4 h-4 text-gray-600" />
              <span className="text-gray-600">Open Tabs</span>
            </>
          )}
        </h3>
        <button
          onClick={onClose}
          className={`p-1 rounded transition-colors ${
            theme === 'dark'
              ? 'hover:bg-gray-700 text-gray-400'
              : 'hover:bg-gray-200 text-gray-600'
          }`}
          title="Close Explorer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* File Tree */}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {tabs.length === 0 ? (
          <div className={`p-4 text-center text-sm ${
            theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
          }`}>
            No files open
          </div>
        ) : (
          <div className="py-2">
            {tree.children.map(child =>
              child.isDirectory ? renderFolder(child) : renderFile(child)
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`p-2 border-t text-xs ${
        theme === 'dark' ? 'border-gray-700 text-gray-500' : 'border-gray-200 text-gray-400'
      }`}>
        {tabs.length} {tabs.length === 1 ? 'file' : 'files'} open
      </div>
    </div>
  );
});

TabsExplorer.displayName = 'TabsExplorer';

export default TabsExplorer;
