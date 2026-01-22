import React, { useState, useEffect } from 'react';
import { X, Shield, BarChart3 } from 'lucide-react';

/**
 * Cookie Consent Banner Component
 *
 * Displays a non-intrusive consent banner for analytics cookies.
 * Only shown in web mode (not in Tauri desktop app).
 * Respects user choice and persists in localStorage.
 */
const CookieConsent = ({ theme = 'dark' }) => {
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Don't show in desktop app
    if (window.__TAURI_INTERNALS__) {
      return;
    }

    // Check if user has already made a choice
    const consent = localStorage.getItem('tidycode-analytics-consent');
    if (consent === null) {
      // Delay showing banner slightly for better UX
      const timer = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('tidycode-analytics-consent', 'granted');
    setShowBanner(false);

    // Grant analytics consent (GA is already loaded, just needs consent)
    if (window.grantAnalyticsConsent) {
      window.grantAnalyticsConsent();
    }
  };

  const handleDecline = () => {
    localStorage.setItem('tidycode-analytics-consent', 'denied');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  const isDark = theme === 'dark';

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 rounded-lg shadow-2xl border ${
        isDark
          ? 'bg-gray-800 border-gray-700 text-gray-200'
          : 'bg-white border-gray-200 text-gray-800'
      }`}
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            <h3 id="cookie-consent-title" className="font-semibold text-sm">
              Privacy & Analytics
            </h3>
          </div>
          <button
            onClick={handleDecline}
            className={`p-1 rounded transition-colors ${
              isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
            aria-label="Close and decline"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main content */}
        <p id="cookie-consent-description" className={`text-xs mb-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          We use privacy-friendly analytics to understand how our app is used.
          <strong className={isDark ? 'text-gray-300' : 'text-gray-700'}> No personal data is collected.</strong>
        </p>

        {/* Expandable details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`text-xs mb-3 flex items-center gap-1 ${
            isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
          }`}
        >
          <BarChart3 className="w-3 h-3" />
          {showDetails ? 'Hide details' : 'What we collect'}
        </button>

        {showDetails && (
          <div className={`text-xs mb-3 p-2 rounded ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <p className={`mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              <strong>We collect:</strong>
            </p>
            <ul className={`list-disc list-inside space-y-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              <li>Page views and general usage patterns</li>
              <li>Device type and browser (anonymized)</li>
              <li>Country-level location (no city/precise data)</li>
            </ul>
            <p className={`mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              <strong>We never collect:</strong>
            </p>
            <ul className={`list-disc list-inside space-y-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              <li>Your files, code, or document content</li>
              <li>Personal information or identifiers</li>
              <li>IP addresses (anonymized by Google)</li>
            </ul>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleDecline}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded transition-colors ${
              isDark
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            No thanks
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 px-3 py-2 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Accept analytics
          </button>
        </div>

        {/* Privacy link */}
        <p className={`text-xs mt-3 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className={isDark ? 'text-blue-400 hover:underline' : 'text-blue-600 hover:underline'}
          >
            Read our Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
};

export default CookieConsent;
