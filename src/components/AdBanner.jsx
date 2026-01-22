import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, X, Shield } from 'lucide-react';

// Placeholder ad content - replace with real ad network integration
const PLACEHOLDER_ADS = [
  {
    id: 1,
    title: 'VS Code Extensions',
    description: 'Boost your productivity with premium extensions',
    sponsor: 'CodeMarket',
    url: '#',
    bgColor: 'from-blue-600 to-indigo-700',
  },
  {
    id: 2,
    title: 'Cloud Hosting',
    description: 'Deploy your apps in seconds',
    sponsor: 'CloudDev',
    url: '#',
    bgColor: 'from-emerald-600 to-teal-700',
  },
  {
    id: 3,
    title: 'Learn TypeScript',
    description: 'Master TypeScript in 30 days',
    sponsor: 'DevCourses',
    url: '#',
    bgColor: 'from-purple-600 to-pink-700',
  },
  {
    id: 4,
    title: 'API Testing Tool',
    description: 'Test APIs faster with AI assistance',
    sponsor: 'APIHub',
    url: '#',
    bgColor: 'from-orange-500 to-red-600',
  },
];

const AD_REFRESH_INTERVAL = 90000; // 90 seconds as recommended
const VIEWABILITY_THRESHOLD = 0.51; // 51% visibility required

const AdBanner = ({ theme = 'dark', onClose }) => {
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const bannerRef = useRef(null);
  const refreshTimerRef = useRef(null);

  const MAX_REFRESHES_PER_SESSION = 3;

  const currentAd = PLACEHOLDER_ADS[currentAdIndex];

  // Viewability tracking using Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.intersectionRatio >= VIEWABILITY_THRESHOLD);
        });
      },
      { threshold: VIEWABILITY_THRESHOLD }
    );

    if (bannerRef.current) {
      observer.observe(bannerRef.current);
    }

    return () => {
      if (bannerRef.current) {
        observer.unobserve(bannerRef.current);
      }
    };
  }, []);

  // Ad refresh logic - only refresh when visible and under max limit
  const rotateAd = useCallback(() => {
    if (refreshCount >= MAX_REFRESHES_PER_SESSION) {
      return; // Stop refreshing after max limit
    }

    setCurrentAdIndex((prev) => (prev + 1) % PLACEHOLDER_ADS.length);
    setRefreshCount((prev) => prev + 1);
    console.log(`[AdBanner] Ad rotated. Refresh count: ${refreshCount + 1}/${MAX_REFRESHES_PER_SESSION}`);
  }, [refreshCount]);

  useEffect(() => {
    // Only start timer if visible and not paused
    if (isVisible && !isPaused && refreshCount < MAX_REFRESHES_PER_SESSION) {
      refreshTimerRef.current = setInterval(() => {
        rotateAd();
      }, AD_REFRESH_INTERVAL);

      console.log('[AdBanner] Refresh timer started (90s interval)');
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        console.log('[AdBanner] Refresh timer cleared');
      }
    };
  }, [isVisible, isPaused, rotateAd, refreshCount]);

  // Pause on hover to avoid accidental clicks
  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  const handleAdClick = () => {
    console.log(`[AdBanner] Ad clicked: ${currentAd.title} by ${currentAd.sponsor}`);
    // In production, this would track the click and open the ad URL
  };

  const isDark = theme === 'dark';

  return (
    <div
      ref={bannerRef}
      className={`relative flex-shrink-0 border-t ${
        isDark ? 'border-gray-700 bg-gray-850' : 'border-gray-200 bg-gray-50'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ minHeight: '80px' }}
    >
      {/* Sponsored label with privacy badge */}
      <div className={`px-2 py-1 flex items-center justify-between ${
        isDark ? 'bg-gray-800' : 'bg-gray-100'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] uppercase tracking-wider ${
            isDark ? 'text-gray-500' : 'text-gray-400'
          }`}>
            Sponsored
          </span>
          <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full ${
            isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
          }`} title="No tracking. Your data stays local.">
            <Shield className="w-2.5 h-2.5" />
            Privacy-safe
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`p-0.5 rounded transition-colors ${
              isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
            }`}
            title="Hide ads (available in premium)"
            aria-label="Close ad"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Ad content */}
      <a
        href={currentAd.url}
        onClick={handleAdClick}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={`block p-2 transition-all duration-300 hover:opacity-90 ${
          isDark ? 'hover:bg-gray-750' : 'hover:bg-gray-100'
        }`}
      >
        <div className={`rounded-md p-2 bg-gradient-to-r ${currentAd.bgColor} text-white`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold truncate">{currentAd.title}</h4>
              <p className="text-[10px] opacity-90 truncate mt-0.5">{currentAd.description}</p>
            </div>
            <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-70" />
          </div>
          <div className="mt-1 text-[9px] opacity-70">
            by {currentAd.sponsor}
          </div>
        </div>
      </a>

      {/* Debug info - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className={`px-2 py-1 text-[8px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
          Visible: {isVisible ? 'Yes' : 'No'} | Refreshes: {refreshCount}/{MAX_REFRESHES_PER_SESSION}
        </div>
      )}
    </div>
  );
};

export default AdBanner;
