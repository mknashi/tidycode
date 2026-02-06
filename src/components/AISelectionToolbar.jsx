/**
 * AISelectionToolbar Component
 *
 * A draggable, persistent floating toolbar providing quick access to
 * content-aware AI actions. Styled consistently with AIActionsMenu.
 * Shown on file open at right-middle of editor; draggable and closable.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  GripVertical,
  MessageSquare,
  RefreshCw,
  FileJson,
  Database,
  FileText,
  TestTube,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { ACTION_IDS } from '../services/ai/actions/ActionManager.js';

/**
 * Quick actions per file category
 */
const QUICK_ACTIONS = {
  code: [
    { id: ACTION_IDS.EXPLAIN, icon: MessageSquare, label: 'Explain This', requiresSelection: true },
    { id: ACTION_IDS.REFACTOR, icon: RefreshCw, label: 'Refactor Selection', requiresSelection: true },
    { id: ACTION_IDS.GENERATE_TESTS, icon: TestTube, label: 'Generate Tests', requiresSelection: true },
  ],
  data: [
    { id: ACTION_IDS.EXPLAIN, icon: MessageSquare, label: 'Explain This', requiresSelection: true },
    { id: ACTION_IDS.CONVERT, icon: FileJson, label: 'Convert to...', requiresSelection: false },
    { id: ACTION_IDS.INFER_SCHEMA, icon: Database, label: 'Infer Schema', requiresSelection: false },
  ],
  log: [
    { id: ACTION_IDS.EXPLAIN, icon: MessageSquare, label: 'Explain This', requiresSelection: true },
    { id: ACTION_IDS.SUMMARIZE_LOGS, icon: FileText, label: 'Summarize Logs', requiresSelection: false },
  ],
  text: [
    { id: ACTION_IDS.EXPLAIN, icon: MessageSquare, label: 'Explain This', requiresSelection: true },
    { id: ACTION_IDS.SUMMARIZE_LOGS, icon: FileText, label: 'Summarize Logs', requiresSelection: false },
  ],
};

export default function AISelectionToolbar({
  theme = 'dark',
  selectedText = '',
  fileCategory = 'text',
  onAction,
  onOpenFullMenu,
  onClose,
}) {
  const isDark = theme === 'dark';
  const toolbarRef = useRef(null);

  // Position state
  const [pos, setPos] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Calculate default position: right-middle of viewport
  useEffect(() => {
    if (pos) return;
    setPos({
      left: window.innerWidth - 220 - 32,
      top: Math.round(window.innerHeight / 2 - 100),
    });
  }, [pos]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Drag handlers
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    const rect = toolbarRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      const newLeft = e.clientX - dragOffsetRef.current.x;
      const newTop = e.clientY - dragOffsetRef.current.y;
      const maxLeft = window.innerWidth - (toolbarRef.current?.offsetWidth || 220);
      const maxTop = window.innerHeight - (toolbarRef.current?.offsetHeight || 200);
      setPos({
        left: Math.max(0, Math.min(maxLeft, newLeft)),
        top: Math.max(0, Math.min(maxTop, newTop)),
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!pos) return null;

  const actions = QUICK_ACTIONS[fileCategory] || QUICK_ACTIONS.text;
  const hasSelection = selectedText && selectedText.length > 0;

  const menuBg = isDark
    ? 'bg-gray-800 border-gray-700'
    : 'bg-white border-gray-200';
  const textColor = isDark ? 'text-gray-200' : 'text-gray-800';
  const mutedColor = isDark ? 'text-gray-500' : 'text-gray-400';
  const hoverBg = isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100';
  const separatorColor = isDark ? 'border-gray-700' : 'border-gray-200';

  return (
    <div
      ref={toolbarRef}
      className={`fixed rounded-lg border shadow-xl z-50 min-w-[200px] select-none ${menuBg}`}
      style={{
        left: `${pos.left}px`,
        top: `${pos.top}px`,
        animation: isDragging ? 'none' : 'fadeIn 0.15s ease-out',
      }}
    >
      {/* Header — draggable */}
      <div
        onMouseDown={handleDragStart}
        className={`flex items-center justify-between px-3 py-1.5 border-b ${separatorColor}`}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="flex items-center gap-2">
          <GripVertical className={`w-3 h-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span className={`text-xs font-medium ${textColor}`}>AI Actions</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose?.(); }}
          className={`p-0.5 rounded ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'} transition-colors`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Action Items */}
      <div className="py-1">
        {actions.map(({ id, icon: Icon, label, requiresSelection }) => {
          const isDisabled = requiresSelection && !hasSelection;

          return (
            <button
              key={id}
              onClick={() => !isDisabled && onAction?.(id)}
              disabled={isDisabled}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
                isDisabled
                  ? `${mutedColor} cursor-not-allowed`
                  : `${textColor} ${hoverBg} cursor-pointer`
              }`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className={`border-t ${separatorColor}`} />

      {/* More actions */}
      <div className="py-1">
        <button
          onClick={() => onOpenFullMenu?.()}
          className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${textColor} ${hoverBg} cursor-pointer`}
        >
          <MoreHorizontal className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">More Actions...</span>
        </button>
      </div>
    </div>
  );
}
