import React, { useState, useRef, useEffect } from 'react';

/**
 * Custom tooltip component with instant appearance, high contrast, and rounded borders
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - The element to show tooltip on hover
 * @param {string} props.content - Tooltip text content
 * @param {string} props.placement - Tooltip placement: 'top' | 'bottom' | 'left' | 'right'
 * @param {number} props.delay - Delay in ms before showing (default: 0 for instant)
 */
const Tooltip = ({
  children,
  content,
  placement = 'right',
  delay = 0
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef(null);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  const updatePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const offset = 8; // Distance from trigger element

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - offset;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + offset;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.left - tooltipRect.width - offset;
        break;
      case 'right':
      default:
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.right + offset;
        break;
    }

    // Keep tooltip within viewport
    const padding = 8;
    if (left < padding) left = padding;
    if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding;
    }
    if (top < padding) top = padding;
    if (top + tooltipRect.height > window.innerHeight - padding) {
      top = window.innerHeight - tooltipRect.height - padding;
    }

    setPosition({ top, left });
  };

  const handleMouseEnter = () => {
    if (delay > 0) {
      timeoutRef.current = setTimeout(() => {
        setIsVisible(true);
      }, delay);
    } else {
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
    }
  }, [isVisible]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!content) return children;

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'inline-block' }}
      >
        {children}
      </div>

      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          <div className="bg-gray-900 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-2xl border-2 border-indigo-400/80 whitespace-nowrap">
            {content}
            {/* Arrow indicator based on placement */}
            {placement === 'right' && (
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-indigo-400/80">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[2px] border-[6px] border-transparent border-r-gray-900" />
              </div>
            )}
            {placement === 'left' && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 border-8 border-transparent border-l-indigo-400/80">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[2px] border-[6px] border-transparent border-l-gray-900" />
              </div>
            )}
            {placement === 'top' && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-indigo-400/80">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[2px] border-[6px] border-transparent border-t-gray-900" />
              </div>
            )}
            {placement === 'bottom' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-indigo-400/80">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[2px] border-[6px] border-transparent border-b-gray-900" />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Tooltip;
