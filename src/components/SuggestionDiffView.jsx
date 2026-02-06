/**
 * SuggestionDiffView Component
 *
 * Embeddable inline diff view showing original vs. suggested code.
 * Lighter weight than DiffViewerModal - meant for embedding inside panels.
 */

import React, { useMemo } from 'react';
import { generateDiff, getDiffStats } from '../utils/DiffUtils.js';

/**
 * Get CSS classes for a diff line based on its type
 */
function getDiffLineClasses(type, isDark) {
  switch (type) {
    case 'added':
      return isDark
        ? 'bg-green-900/30 text-green-300'
        : 'bg-green-100 text-green-900';
    case 'removed':
      return isDark
        ? 'bg-red-900/30 text-red-300'
        : 'bg-red-100 text-red-900';
    case 'modified':
      return isDark
        ? 'bg-yellow-900/20 text-yellow-300'
        : 'bg-yellow-100 text-yellow-900';
    default:
      return isDark ? 'text-gray-400' : 'text-gray-600';
  }
}

/**
 * Get prefix character for diff line type
 */
function getDiffPrefix(type) {
  switch (type) {
    case 'added':
      return '+';
    case 'removed':
      return '-';
    case 'modified':
      return '~';
    default:
      return ' ';
  }
}

export default function SuggestionDiffView({
  theme = 'dark',
  original = '',
  suggested = '',
  maxHeight = '400px',
}) {
  const isDark = theme === 'dark';

  const { diffLines, stats } = useMemo(() => {
    if (!original && !suggested) {
      return { diffLines: [], stats: { added: 0, removed: 0, modified: 0, unchanged: 0 } };
    }

    const lines = generateDiff(original, suggested);
    const diffStats = getDiffStats(lines);
    return { diffLines: lines, stats: diffStats };
  }, [original, suggested]);

  if (diffLines.length === 0) {
    return (
      <div
        className={`p-4 text-xs text-center ${
          isDark ? 'text-gray-500' : 'text-gray-400'
        }`}
      >
        No differences found
      </div>
    );
  }

  const bgColor = isDark ? 'bg-gray-900' : 'bg-gray-50';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';
  const lineNumColor = isDark ? 'text-gray-600' : 'text-gray-400';
  const headerBg = isDark ? 'bg-gray-800' : 'bg-gray-100';

  return (
    <div className={`rounded border ${borderColor} overflow-hidden`}>
      {/* Stats Header */}
      <div
        className={`flex items-center gap-3 px-3 py-1.5 text-[10px] border-b ${borderColor} ${headerBg}`}
      >
        {stats.added > 0 && (
          <span className="text-green-400">+{stats.added} added</span>
        )}
        {stats.removed > 0 && (
          <span className="text-red-400">-{stats.removed} removed</span>
        )}
        {stats.modified > 0 && (
          <span className="text-yellow-400">~{stats.modified} modified</span>
        )}
        <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>
          {stats.unchanged} unchanged
        </span>
      </div>

      {/* Diff Content */}
      <div
        className={`overflow-auto ${bgColor}`}
        style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
      >
        <pre className="text-xs leading-5 font-mono">
          {diffLines.map((line, index) => {
            const lineClasses = getDiffLineClasses(line.type, isDark);
            const prefix = getDiffPrefix(line.type);

            return (
              <div key={index} className={`flex ${lineClasses}`}>
                <span
                  className={`select-none px-2 text-right w-10 flex-shrink-0 ${lineNumColor}`}
                >
                  {line.lineNum || ''}
                </span>
                <span className="select-none w-4 flex-shrink-0 text-center">
                  {prefix}
                </span>
                <span className="flex-1 px-2 whitespace-pre-wrap break-all">
                  {line.type === 'modified'
                    ? line.fixed || line.original
                    : line.type === 'added'
                    ? line.fixed || line.value
                    : line.original || line.value}
                </span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
