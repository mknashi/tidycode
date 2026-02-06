/**
 * AIActionsMenu Component
 *
 * Context menu providing access to all AI actions.
 * Triggered via Cmd+Shift+A or programmatically.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  MessageSquare,
  RefreshCw,
  FileJson,
  Database,
  FileText,
  TestTube,
  ChevronRight,
} from 'lucide-react';
import { ACTION_IDS } from '../services/ai/actions/ActionManager.js';

/**
 * Determine file category from syntax language and file name.
 * @param {string} language - e.g., 'javascript', 'json', 'yaml'
 * @param {string} fileName - e.g., 'app.log', 'data.json'
 * @returns {'code'|'data'|'log'|'text'}
 */
export function getFileCategory(language, fileName) {
  const name = (fileName || '').toLowerCase();

  // Log detection by extension
  if (name.endsWith('.log')) return 'log';

  // Data formats
  if (['json', 'yaml', 'xml', 'toml', 'csv'].includes(language)) return 'data';

  // Code languages
  const codeLangs = [
    'javascript', 'typescript', 'jsx', 'tsx', 'python', 'go', 'rust', 'java',
    'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin', 'scala',
    'shell', 'bash', 'sql', 'css', 'scss', 'html', 'markup', 'dart',
    'lua', 'r', 'perl', 'objectivec',
  ];
  if (codeLangs.includes(language)) return 'code';

  // If there's a recognized language, treat as code
  if (language) return 'code';

  return 'text';
}

/**
 * Icon mapping for actions
 */
const ACTION_ICONS = {
  [ACTION_IDS.EXPLAIN]: MessageSquare,
  [ACTION_IDS.REFACTOR]: RefreshCw,
  [ACTION_IDS.CONVERT]: FileJson,
  [ACTION_IDS.INFER_SCHEMA]: Database,
  [ACTION_IDS.SUMMARIZE_LOGS]: FileText,
  [ACTION_IDS.GENERATE_TESTS]: TestTube,
};

/**
 * Menu items configuration
 */
const MENU_ITEMS = [
  {
    id: ACTION_IDS.EXPLAIN,
    label: 'Explain This',
    shortcut: '⇧⌘E',
    requiresSelection: true,
    fileCategories: ['code', 'data', 'log', 'text'],
  },
  {
    id: ACTION_IDS.REFACTOR,
    label: 'Refactor Selection',
    shortcut: '⇧⌘R',
    requiresSelection: true,
    fileCategories: ['code'],
    submenu: [
      { id: 'general', label: 'General' },
      { id: 'performance', label: 'Optimize Performance' },
      { id: 'readability', label: 'Improve Readability' },
      { id: 'modern', label: 'Modernize' },
      { id: 'security', label: 'Security' },
      { id: 'dry', label: 'DRY (Remove Duplication)' },
    ],
  },
  { type: 'separator' },
  {
    id: ACTION_IDS.CONVERT,
    label: 'Convert to...',
    requiresSelection: false,
    fileCategories: ['data'],
    submenu: [
      { id: 'json', label: 'JSON' },
      { id: 'yaml', label: 'YAML' },
      { id: 'xml', label: 'XML' },
      { id: 'toml', label: 'TOML' },
    ],
  },
  {
    id: ACTION_IDS.INFER_SCHEMA,
    label: 'Infer Schema',
    requiresSelection: false,
    fileCategories: ['data'],
    submenu: [
      { id: 'json-schema', label: 'JSON Schema' },
      { id: 'typescript', label: 'TypeScript Types' },
      { id: 'zod', label: 'Zod Schema' },
      { id: 'yup', label: 'Yup Schema' },
      { id: 'io-ts', label: 'io-ts Codec' },
    ],
  },
  {
    id: ACTION_IDS.SUMMARIZE_LOGS,
    label: 'Summarize Logs',
    requiresSelection: false,
    fileCategories: ['log', 'text'],
    submenu: [
      { id: 'general', label: 'General Summary' },
      { id: 'errors', label: 'Error Analysis' },
      { id: 'performance', label: 'Performance Analysis' },
      { id: 'security', label: 'Security Analysis' },
      { id: 'timeline', label: 'Timeline' },
    ],
  },
  { type: 'separator' },
  {
    id: ACTION_IDS.GENERATE_TESTS,
    label: 'Generate Tests',
    shortcut: '⇧⌘T',
    requiresSelection: true,
    fileCategories: ['code'],
  },
];

/**
 * Map action IDs to their option key names
 */
const ACTION_OPTION_KEYS = {
  [ACTION_IDS.REFACTOR]: 'type',
  [ACTION_IDS.CONVERT]: 'targetFormat',
  [ACTION_IDS.INFER_SCHEMA]: 'format',
  [ACTION_IDS.SUMMARIZE_LOGS]: 'type',
};

export default function AIActionsMenu({
  theme = 'dark',
  position = null,
  selectedText = '',
  language = '',
  fileCategory = 'text',
  onActionExecute,
  onClose,
}) {
  const isDark = theme === 'dark';
  const menuRef = useRef(null);
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const [adjustedPos, setAdjustedPos] = useState(position);

  // Adjust position to fit in viewport
  useEffect(() => {
    if (!position || !menuRef.current) {
      setAdjustedPos(position);
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let x = position.x;
    let y = position.y;

    if (x + rect.width > viewportW - 10) {
      x = viewportW - rect.width - 10;
    }
    if (y + rect.height > viewportH - 10) {
      y = viewportH - rect.height - 10;
    }
    if (x < 10) x = 10;
    if (y < 10) y = 10;

    setAdjustedPos({ x, y });
  }, [position]);

  // Close on Escape
  useEffect(() => {
    if (!position) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [position, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose?.();
      }
    };

    // Delay to avoid closing immediately on the triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [position, onClose]);

  const handleItemClick = useCallback(
    (actionId, submenuOptionId) => {
      const options = {};

      if (submenuOptionId) {
        const optionKey = ACTION_OPTION_KEYS[actionId];
        if (optionKey) {
          options[optionKey] = submenuOptionId;
        }
      }

      onActionExecute?.(actionId, options);
      onClose?.();
    },
    [onActionExecute, onClose]
  );

  if (!position) return null;

  const pos = adjustedPos || position;
  const hasSelection = selectedText && selectedText.length > 0;

  // Filter menu items by file category, then clean up orphaned separators
  const filteredItems = MENU_ITEMS.filter(item => {
    if (item.type === 'separator') return true;
    if (!item.fileCategories) return true;
    return item.fileCategories.includes(fileCategory);
  }).filter((item, i, arr) => {
    if (item.type !== 'separator') return true;
    if (i === 0 || i === arr.length - 1) return false;
    if (arr[i - 1]?.type === 'separator') return false;
    return true;
  });

  const menuBg = isDark
    ? 'bg-gray-800 border-gray-700'
    : 'bg-white border-gray-200';
  const textColor = isDark ? 'text-gray-200' : 'text-gray-800';
  const mutedColor = isDark ? 'text-gray-500' : 'text-gray-400';
  const hoverBg = isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100';
  const separatorColor = isDark ? 'border-gray-700' : 'border-gray-200';
  const submenuBg = isDark
    ? 'bg-gray-800 border-gray-700'
    : 'bg-white border-gray-200';

  return (
    <div
      ref={menuRef}
      className={`fixed rounded-lg border shadow-xl z-50 py-1 min-w-[220px] ${menuBg}`}
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 border-b ${separatorColor}`}
      >
        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
        <span className={`text-xs font-medium ${textColor}`}>AI Actions</span>
      </div>

      {/* Menu Items */}
      <div className="py-1">
        {filteredItems.map((item, index) => {
          if (item.type === 'separator') {
            return (
              <div
                key={`sep-${index}`}
                className={`my-1 border-t ${separatorColor}`}
              />
            );
          }

          const Icon = ACTION_ICONS[item.id];
          const isDisabled = item.requiresSelection && !hasSelection;

          return (
            <div
              key={item.id}
              className="relative"
              onMouseEnter={() =>
                item.submenu ? setActiveSubmenu(item.id) : setActiveSubmenu(null)
              }
              onMouseLeave={() => {
                // Don't close if hovering submenu - handled by submenu container
              }}
            >
              <button
                onClick={() => !item.submenu && !isDisabled && handleItemClick(item.id)}
                disabled={isDisabled}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
                  isDisabled
                    ? `${mutedColor} cursor-not-allowed`
                    : `${textColor} ${hoverBg} cursor-pointer`
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className={`text-[10px] ${mutedColor}`}>
                    {item.shortcut}
                  </span>
                )}
                {item.submenu && (
                  <ChevronRight className="w-3 h-3 flex-shrink-0" />
                )}
              </button>

              {/* Submenu */}
              {item.submenu && activeSubmenu === item.id && (
                <div
                  className={`absolute left-full top-0 ml-1 rounded-lg border shadow-xl z-50 py-1 min-w-[170px] ${submenuBg}`}
                  onMouseEnter={() => setActiveSubmenu(item.id)}
                  onMouseLeave={() => setActiveSubmenu(null)}
                >
                  {item.submenu.map((subItem) => (
                    <button
                      key={subItem.id}
                      onClick={() =>
                        !isDisabled && handleItemClick(item.id, subItem.id)
                      }
                      disabled={isDisabled}
                      className={`w-full text-left px-3 py-1.5 text-xs ${
                        isDisabled
                          ? `${mutedColor} cursor-not-allowed`
                          : `${textColor} ${hoverBg} cursor-pointer`
                      }`}
                    >
                      {subItem.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
