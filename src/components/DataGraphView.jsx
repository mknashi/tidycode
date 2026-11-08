import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { X, Plus, Minus, Maximize, Expand, Shrink, UnfoldVertical, FoldVertical, Map as MapIcon, Image as ImageIcon, FileCode, Loader2 } from 'lucide-react';
import { buildDataGraph, GraphTooLargeError, MAX_GRAPH_CARDS } from '../utils/dataGraph';

/**
 * Node-and-link view of JSON or XML data. Objects, arrays and elements are
 * cards laid out left to right; clicking a card or row moves the editor to it.
 */

const FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const FONT_SIZE = 12;
const ROW_H = 22;
const HEADER_H = 28;
const PAD_X = 10;
const TOGGLE_W = 18;
const ACCENT_W = 3;
const COL_GAP = 72;
const ROW_GAP = 16;
const MARGIN = 40;
const MIN_CARD_W = 140;
const MAX_CARD_W = 420;
const MAX_KEY_CHARS = 28;
const MAX_VALUE_CHARS = 48;
// Past this many cards, only the first two levels start expanded
const EXPAND_ALL_LIMIT = 150;
// The first view never zooms out further than this
const MIN_READABLE_SCALE = 0.8;

const PALETTES = {
  dark: {
    background: '#111827',
    grid: '#1f2937',
    card: '#1f2937',
    cardBorder: '#374151',
    header: '#273244',
    rowAlt: '#263142',
    // Header tint and accent stripe per card kind
    kinds: {
      object: { header: '#1d3352', accent: '#60a5fa' },
      array: { header: '#2e2a55', accent: '#a78bfa' },
      element: { header: '#143b3d', accent: '#2dd4bf' },
      value: { header: '#273244', accent: '#9ca3af' }
    },
    selected: '#818cf8',
    title: '#e5e7eb',
    key: '#93c5fd',
    punctuation: '#6b7280',
    edge: '#4b5563',
    toggle: '#9ca3af',
    values: {
      string: '#86efac',
      number: '#fca5a5',
      boolean: '#fcd34d',
      null: '#9ca3af',
      object: '#c4b5fd',
      array: '#c4b5fd',
      element: '#c4b5fd',
      attribute: '#fdba74',
      more: '#9ca3af'
    }
  },
  light: {
    background: '#f9fafb',
    grid: '#e5e7eb',
    card: '#ffffff',
    cardBorder: '#d1d5db',
    header: '#f3f4f6',
    rowAlt: '#f5f7fa',
    kinds: {
      object: { header: '#dbeafe', accent: '#3b82f6' },
      array: { header: '#ede9fe', accent: '#8b5cf6' },
      element: { header: '#ccfbf1', accent: '#14b8a6' },
      value: { header: '#f3f4f6', accent: '#9ca3af' }
    },
    selected: '#6366f1',
    title: '#111827',
    key: '#1d4ed8',
    punctuation: '#9ca3af',
    edge: '#9ca3af',
    toggle: '#6b7280',
    values: {
      string: '#15803d',
      number: '#b91c1c',
      boolean: '#a16207',
      null: '#6b7280',
      object: '#6d28d9',
      array: '#6d28d9',
      element: '#6d28d9',
      attribute: '#c2410c',
      more: '#6b7280'
    }
  }
};

let measuredCharWidth = null;
const getCharWidth = () => {
  if (measuredCharWidth) return measuredCharWidth;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    measuredCharWidth = ctx.measureText('M'.repeat(20)).width / 20 || 7.2;
  } catch {
    measuredCharWidth = 7.2;
  }
  return measuredCharWidth;
};

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const cardDepths = (graph) => {
  const depths = new Map();
  const visit = (id, depth) => {
    depths.set(id, depth);
    graph.cards.get(id).children.forEach(childId => visit(childId, depth + 1));
  };
  visit(graph.rootId, 0);
  return depths;
};

// The collapsed set holds hidden cards; a hidden card hides its whole subtree
const collapseFromDepth = (graph, minDepth) => {
  const collapsed = new Set();
  cardDepths(graph).forEach((depth, id) => {
    if (depth >= minDepth) collapsed.add(id);
  });
  return collapsed;
};

const defaultCollapsed = (graph) => (
  graph.cards.size <= EXPAND_ALL_LIMIT ? new Set() : collapseFromDepth(graph, 2)
);

// Left-to-right tree layout: one column per depth, each parent centred on its children
const layoutGraph = (graph, collapsed) => {
  const charWidth = getCharWidth();
  const sized = new Map();

  const measure = (id, depth) => {
    const card = graph.cards.get(id);
    const rows = card.rows.map(row => ({
      ...row,
      keyText: row.key === null ? '' : truncate(row.key, MAX_KEY_CHARS),
      valueText: truncate(row.value, MAX_VALUE_CHARS)
    }));
    const widest = Math.max(
      card.title.length,
      ...rows.map(row => (row.keyText ? row.keyText.length + 2 : 0) + row.valueText.length)
    );
    const width = Math.min(MAX_CARD_W, Math.max(MIN_CARD_W, Math.ceil(widest * charWidth + PAD_X * 2 + ACCENT_W + TOGGLE_W)));
    const height = HEADER_H + Math.max(rows.length, 1) * ROW_H;
    const visibleChildren = card.children.filter(childId => !collapsed.has(childId));
    sized.set(id, { ...card, rows, width, height, depth, visibleChildren });
    visibleChildren.forEach(childId => measure(childId, depth + 1));
  };
  measure(graph.rootId, 0);

  const columnWidths = [];
  sized.forEach(card => {
    columnWidths[card.depth] = Math.max(columnWidths[card.depth] || 0, card.width);
  });
  const columnX = [MARGIN];
  for (let d = 1; d < columnWidths.length; d++) columnX[d] = columnX[d - 1] + columnWidths[d - 1] + COL_GAP;

  const place = (id, top) => {
    const card = sized.get(id);
    card.x = columnX[card.depth];
    const childHeights = [];
    let span = 0;
    // Measure children first so the parent can be centred on them
    card.visibleChildren.forEach((childId, index) => {
      const h = subtreeHeight(childId);
      childHeights.push(h);
      span += h + (index > 0 ? ROW_GAP : 0);
    });
    const total = Math.max(card.height, span);
    card.y = top + (total - card.height) / 2;
    let childTop = top + (total - span) / 2;
    card.visibleChildren.forEach((childId, index) => {
      place(childId, childTop);
      childTop += childHeights[index] + ROW_GAP;
    });
    return total;
  };

  const heights = new Map();
  const subtreeHeight = (id) => {
    if (heights.has(id)) return heights.get(id);
    const card = sized.get(id);
    let span = 0;
    card.visibleChildren.forEach((childId, index) => {
      span += subtreeHeight(childId) + (index > 0 ? ROW_GAP : 0);
    });
    const h = Math.max(card.height, span);
    heights.set(id, h);
    return h;
  };

  const totalHeight = place(graph.rootId, MARGIN);
  const width = columnX[columnX.length - 1] + columnWidths[columnWidths.length - 1] + MARGIN;

  const edges = [];
  sized.forEach(card => {
    card.rows.forEach((row, rowIndex) => {
      if (!row.childId || !sized.has(row.childId)) return;
      const child = sized.get(row.childId);
      edges.push({
        id: `${card.id}-${row.childId}`,
        kind: child.kind,
        x1: card.x + card.width,
        y1: card.y + HEADER_H + rowIndex * ROW_H + ROW_H / 2,
        x2: child.x,
        y2: child.y + HEADER_H / 2
      });
    });
  });

  return { cards: [...sized.values()], edges, width, height: totalHeight + MARGIN * 2 };
};

const edgePath = ({ x1, y1, x2, y2 }) => {
  const mid = (x2 - x1) / 2;
  return `M${x1},${y1} C${x1 + mid},${y1} ${x2 - mid},${y2} ${x2},${y2}`;
};

const GraphCard = ({ card, colors, selected, collapsed, onSelect, onToggle }) => {
  const textX = card.x + PAD_X + ACCENT_W;
  const kind = colors.kinds[card.kind] || colors.kinds.value;
  const clipId = `graph-card-${card.id}`;
  return (
    <g>
      <clipPath id={clipId}>
        <rect x={card.x} y={card.y} width={card.width} height={card.height} rx={6} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x={card.x} y={card.y} width={card.width} height={card.height} fill={colors.card} />
        <rect x={card.x} y={card.y} width={card.width} height={HEADER_H} fill={kind.header} />
        {card.rows.map((row, index) => (index % 2 === 1 ? (
          <rect key={index} x={card.x} y={card.y + HEADER_H + index * ROW_H} width={card.width} height={ROW_H} fill={colors.rowAlt} />
        ) : null))}
        <rect x={card.x} y={card.y} width={ACCENT_W} height={card.height} fill={kind.accent} />
      </g>
      <rect
        x={card.x}
        y={card.y}
        width={card.width}
        height={card.height}
        rx={6}
        fill="none"
        stroke={selected ? colors.selected : colors.cardBorder}
        strokeWidth={selected ? 2 : 1}
      />
      <text
        x={textX}
        y={card.y + HEADER_H / 2}
        dominantBaseline="central"
        fill={colors.title}
        fontWeight="600"
        style={{ cursor: 'pointer' }}
        onClick={() => onSelect(card.id, card.offset)}
      >
        <title>Show in editor</title>
        {truncate(card.title, Math.floor((card.width - PAD_X * 2 - ACCENT_W) / getCharWidth()))}
      </text>
      {card.rows.map((row, index) => {
        const rowY = card.y + HEADER_H + index * ROW_H;
        const isCollapsed = row.childId && collapsed.has(row.childId);
        return (
          <g key={index}>
            <rect
              x={card.x + 1}
              y={rowY}
              width={card.width - 2}
              height={ROW_H}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(card.id, row.offset)}
            />
            <text x={textX} y={rowY + ROW_H / 2} dominantBaseline="central" pointerEvents="none">
              {row.keyText && (
                <>
                  <tspan fill={colors.key}>{row.keyText}</tspan>
                  <tspan fill={colors.punctuation}>: </tspan>
                </>
              )}
              <tspan fill={colors.values[row.valueType] || colors.title}>{row.valueText}</tspan>
            </text>
            {row.childId && (
              <g
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); onToggle(row.childId); }}
              >
                <title>{isCollapsed ? 'Expand' : 'Collapse'}</title>
                <rect x={card.x + card.width - TOGGLE_W - 4} y={rowY + 3} width={TOGGLE_W} height={ROW_H - 6} rx={3} fill="transparent" />
                <text
                  x={card.x + card.width - TOGGLE_W / 2 - 4}
                  y={rowY + ROW_H / 2}
                  dominantBaseline="central"
                  textAnchor="middle"
                  fill={colors.toggle}
                  fontWeight="700"
                >
                  {isCollapsed ? '+' : '−'}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};

GraphCard.propTypes = {
  card: PropTypes.object.isRequired,
  colors: PropTypes.object.isRequired,
  selected: PropTypes.bool,
  collapsed: PropTypes.instanceOf(Set).isRequired,
  onSelect: PropTypes.func.isRequired,
  onToggle: PropTypes.func.isRequired
};

const MINIMAP_W = 200;
const MINIMAP_H = 140;

/**
 * Overview of the whole graph with the visible area outlined. Clicking or
 * dragging on it pans the main view. It keeps its own state, fed by
 * `listenerRef`, so panning doesn't re-render the main graph.
 */
const GraphMinimap = ({ layout, colors, isDark, transformRef, containerRef, listenerRef }) => {
  const [view, setView] = useState(() => transformRef.current?.instance?.transformState || null);
  const [viewport, setViewport] = useState(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    listenerRef.current = setView;
    setView(transformRef.current?.instance?.transformState || null);
    return () => { listenerRef.current = null; };
  }, [listenerRef, transformRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const update = () => setViewport({ width: container.clientWidth, height: container.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  const panTo = (event) => {
    const transform = transformRef.current;
    if (!transform || !viewport) return;
    // The drawing is letterboxed inside the box; map through the SVG's own transform
    const svg = event.currentTarget;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const mapped = point.matrixTransform(svg.getScreenCTM().inverse());
    const graphX = Math.max(0, Math.min(layout.width, mapped.x));
    const graphY = Math.max(0, Math.min(layout.height, mapped.y));
    const { scale } = transform.instance.transformState;
    transform.setTransform(viewport.width / 2 - graphX * scale, viewport.height / 2 - graphY * scale, scale, 0);
  };

  const visible = view && viewport ? {
    x: -view.positionX / view.scale,
    y: -view.positionY / view.scale,
    width: viewport.width / view.scale,
    height: viewport.height / view.scale
  } : null;

  return (
    <div
      className={`absolute bottom-3 right-3 z-10 rounded-md border shadow-lg overflow-hidden ${isDark ? 'border-gray-700 bg-gray-900/90' : 'border-gray-300 bg-white/90'}`}
      title="Overview: click or drag to move the view"
    >
      <svg
        width={MINIMAP_W}
        height={MINIMAP_H}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          panTo(e);
        }}
        onPointerMove={(e) => { if (draggingRef.current) panTo(e); }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
      >
        {layout.edges.map(edge => (
          <path key={edge.id} d={edgePath(edge)} fill="none" stroke={colors.edge} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" />
        ))}
        {layout.cards.map(card => {
          const kind = colors.kinds[card.kind] || colors.kinds.value;
          return (
            <rect key={card.id} x={card.x} y={card.y} width={card.width} height={card.height} rx={6} fill={kind.header} stroke={kind.accent} vectorEffect="non-scaling-stroke" />
          );
        })}
        {visible && (
          <rect
            x={visible.x}
            y={visible.y}
            width={visible.width}
            height={visible.height}
            fill={colors.selected}
            fillOpacity={0.15}
            stroke={colors.selected}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
};

GraphMinimap.propTypes = {
  layout: PropTypes.object.isRequired,
  colors: PropTypes.object.isRequired,
  isDark: PropTypes.bool,
  transformRef: PropTypes.object.isRequired,
  containerRef: PropTypes.object.isRequired,
  listenerRef: PropTypes.object.isRequired
};

const readStoredFlag = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
};

const DataGraphView = ({ content, format, theme, title, onSelectOffset, onExport, onClose }) => {
  const colors = PALETTES[theme === 'dark' ? 'dark' : 'light'];
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const transformRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [maximized, setMaximized] = useState(false);
  const [showMinimap, setShowMinimap] = useState(() => readStoredFlag('tidycode-graph-minimap', true));
  const viewListenerRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('tidycode-graph-minimap', String(showMinimap));
    } catch {
      // Not remembered; the overview shows by default
    }
  }, [showMinimap]);

  // Rebuild after typing pauses so large documents don't re-parse on every keystroke
  const [debouncedContent, setDebouncedContent] = useState(content);
  useEffect(() => {
    if (content === debouncedContent) return undefined;
    const timer = setTimeout(() => setDebouncedContent(content), 300);
    return () => clearTimeout(timer);
  }, [content, debouncedContent]);

  const { graph, error } = useMemo(() => {
    try {
      return { graph: buildDataGraph(debouncedContent, format), error: null };
    } catch (err) {
      if (err instanceof GraphTooLargeError) {
        return { graph: null, error: `This ${format.toUpperCase()} has more than ${MAX_GRAPH_CARDS.toLocaleString()} objects, too many to draw. Use the Structure panel instead.` };
      }
      return { graph: null, error: err.message };
    }
  }, [debouncedContent, format]);

  // Keep the last good graph on screen while the content is invalid mid-edit
  const lastGraphRef = useRef(null);
  if (graph) lastGraphRef.current = graph;
  const shownGraph = graph || lastGraphRef.current;

  const [collapsed, setCollapsed] = useState(() => (shownGraph ? defaultCollapsed(shownGraph) : new Set()));
  const collapseKeyRef = useRef(null);
  // Reset folds when a different document (title/format) is shown
  const collapseKey = `${title}|${format}`;
  useEffect(() => {
    if (collapseKeyRef.current === collapseKey || !shownGraph) return;
    collapseKeyRef.current = collapseKey;
    setCollapsed(defaultCollapsed(shownGraph));
    setSelectedId(null);
  }, [collapseKey, shownGraph]);

  const layout = useMemo(
    () => (shownGraph ? layoutGraph(shownGraph, collapsed) : null),
    [shownGraph, collapsed]
  );

  const fitToView = () => {
    const container = containerRef.current;
    if (!container || !layout || !transformRef.current) return;
    const { width, height } = container.getBoundingClientRect();
    const scale = Math.max(0.05, Math.min(1, width / layout.width, height / layout.height));
    transformRef.current.setTransform(
      (width - layout.width * scale) / 2,
      Math.max(0, (height - layout.height * scale) / 2),
      scale,
      0
    );
  };

  // Show the whole graph when it fits at a readable size; otherwise start
  // at that size with the root card at the left, centred vertically
  const showInitialView = () => {
    const container = containerRef.current;
    if (!container || !layout || !transformRef.current) return;
    const { width, height } = container.getBoundingClientRect();
    const fitScale = Math.min(1, width / layout.width, height / layout.height);
    if (fitScale >= MIN_READABLE_SCALE) {
      fitToView();
      return;
    }
    const root = layout.cards[0];
    const scale = MIN_READABLE_SCALE;
    transformRef.current.setTransform(
      MARGIN / 2 - (root.x - MARGIN / 2) * scale,
      height / 2 - (root.y + root.height / 2) * scale,
      scale,
      0
    );
  };

  // Fit once per document; later edits keep the current pan and zoom
  const fittedKeyRef = useRef(null);
  useEffect(() => {
    if (!layout || fittedKeyRef.current === collapseKey) return;
    fittedKeyRef.current = collapseKey;
    requestAnimationFrame(showInitialView);
  });

  // Maximizing shows the whole graph; restoring goes back to the readable start view
  const maximizedRef = useRef(maximized);
  useEffect(() => {
    if (maximizedRef.current === maximized) return undefined;
    maximizedRef.current = maximized;
    const frame = requestAnimationFrame(maximized ? fitToView : showInitialView);
    return () => cancelAnimationFrame(frame);
  });

  useEffect(() => {
    if (!maximized) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMaximized(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [maximized]);

  const toggle = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    if (shownGraph) setCollapsed(collapseFromDepth(shownGraph, 1));
  };

  const select = (id, offset) => {
    setSelectedId(id);
    onSelectOffset?.(offset);
  };

  const serializeSvg = () => {
    const svg = svgRef.current.cloneNode(true);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.querySelectorAll('title').forEach(node => node.remove());
    return new XMLSerializer().serializeToString(svg);
  };

  const exportImage = async (kind) => {
    if (!svgRef.current || !layout || !onExport) return;
    setExporting(kind);
    try {
      const svgText = serializeSvg();
      if (kind === 'svg') {
        await onExport({ data: new TextEncoder().encode(svgText), extension: 'svg', mime: 'image/svg+xml', description: 'SVG Image' });
        return;
      }
      // Browsers cap canvas size; shrink the scale for very large graphs
      const scale = Math.min(2, 16000 / layout.width, 16000 / layout.height);
      const image = new Image();
      const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
      try {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('Could not render the graph as an image'));
          image.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(layout.width * scale);
        canvas.height = Math.ceil(layout.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(image, 0, 0, layout.width, layout.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('The graph is too large to export as PNG; try SVG');
        await onExport({ data: new Uint8Array(await blob.arrayBuffer()), extension: 'png', mime: 'image/png', description: 'PNG Image' });
      } finally {
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(null);
    }
  };

  const isDark = theme === 'dark';
  const buttonClass = `p-1.5 rounded transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700 hover:text-white' : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'}`;
  const visibleCount = layout?.cards.length || 0;
  const totalCount = shownGraph?.cards.size || 0;

  return (
    <div className={`flex flex-col min-w-0 ${maximized ? 'fixed inset-0 z-[100] shadow-2xl' : 'h-full w-full'} ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className={`flex items-center justify-between gap-2 px-3 py-1.5 border-b text-xs flex-shrink-0 ${isDark ? 'border-gray-800 text-gray-300' : 'border-gray-200 text-gray-700'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="uppercase tracking-wide font-medium flex-shrink-0">Graph</span>
          <span className={`truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {format.toUpperCase()}
            {totalCount > 0 && ` · ${visibleCount === totalCount ? totalCount : `${visibleCount} of ${totalCount}`} nodes`}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button className={buttonClass} onClick={() => transformRef.current?.zoomIn(0.2)} title="Zoom in"><Plus className="w-4 h-4" /></button>
          <button className={buttonClass} onClick={() => transformRef.current?.zoomOut(0.2)} title="Zoom out"><Minus className="w-4 h-4" /></button>
          <button className={buttonClass} onClick={fitToView} title="Fit to view"><Maximize className="w-4 h-4" /></button>
          <button className={buttonClass} onClick={expandAll} title="Expand all"><UnfoldVertical className="w-4 h-4" /></button>
          <button className={buttonClass} onClick={collapseAll} title="Collapse all"><FoldVertical className="w-4 h-4" /></button>
          <button
            className={`${buttonClass} ${showMinimap ? (isDark ? 'text-indigo-300' : 'text-indigo-600') : ''}`}
            onClick={() => setShowMinimap(prev => !prev)}
            title={showMinimap ? 'Hide overview' : 'Show overview'}
            aria-pressed={showMinimap}
          >
            <MapIcon className="w-4 h-4" />
          </button>
          {onExport && (
            <>
              <button className={buttonClass} onClick={() => exportImage('png')} disabled={!!exporting || !layout} title="Export as PNG">
                {exporting === 'png' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              </button>
              <button className={buttonClass} onClick={() => exportImage('svg')} disabled={!!exporting || !layout} title="Export as SVG">
                {exporting === 'svg' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
              </button>
            </>
          )}
          <button
            className={buttonClass}
            onClick={() => setMaximized(prev => !prev)}
            title={maximized ? 'Restore (Esc)' : 'Maximize'}
            aria-pressed={maximized}
          >
            {maximized ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
          </button>
          <button className={buttonClass} onClick={onClose} title="Close graph"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {error && (
        <div className={`px-3 py-1.5 text-xs border-b flex-shrink-0 ${isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          {shownGraph ? `Showing the last valid version. ${error}` : error}
        </div>
      )}

      <div ref={containerRef} className="flex-1 min-h-0 relative overflow-hidden">
        {layout && (
          <TransformWrapper
            ref={transformRef}
            initialScale={1}
            minScale={0.05}
            maxScale={4}
            limitToBounds={false}
            wheel={{ step: 0.08 }}
            doubleClick={{ disabled: true }}
            panning={{ velocityDisabled: true }}
            onTransformed={(_, state) => viewListenerRef.current?.(state)}
          >
            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
              <svg
                ref={svgRef}
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                fontFamily={FONT_FAMILY}
                fontSize={FONT_SIZE}
                style={{ display: 'block' }}
              >
                <defs>
                  <pattern id="graph-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="1" fill={colors.grid} />
                  </pattern>
                </defs>
                <rect width={layout.width} height={layout.height} fill={colors.background} />
                <rect width={layout.width} height={layout.height} fill="url(#graph-grid)" />
                {layout.edges.map(edge => (
                  <path
                    key={edge.id}
                    d={edgePath(edge)}
                    fill="none"
                    stroke={(colors.kinds[edge.kind] || colors.kinds.value).accent}
                    strokeOpacity={0.55}
                    strokeWidth={1.5}
                  />
                ))}
                {layout.cards.map(card => (
                  <GraphCard
                    key={card.id}
                    card={card}
                    colors={colors}
                    selected={card.id === selectedId}
                    collapsed={collapsed}
                    onSelect={select}
                    onToggle={toggle}
                  />
                ))}
              </svg>
            </TransformComponent>
          </TransformWrapper>
        )}
        {layout && showMinimap && (
          <GraphMinimap
            layout={layout}
            colors={colors}
            isDark={isDark}
            transformRef={transformRef}
            containerRef={containerRef}
            listenerRef={viewListenerRef}
          />
        )}
      </div>
    </div>
  );
};

DataGraphView.propTypes = {
  content: PropTypes.string.isRequired,
  format: PropTypes.oneOf(['json', 'xml']).isRequired,
  theme: PropTypes.string,
  title: PropTypes.string,
  onSelectOffset: PropTypes.func,
  onExport: PropTypes.func,
  onClose: PropTypes.func.isRequired
};

export default DataGraphView;
