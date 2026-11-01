import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, MessageCircle, Send, Loader2, CheckCircle } from 'lucide-react';
import { createFeedbackSession, feedbackContext } from '../services/feedback';

const MAX_MESSAGE = 5000;

const FeedbackModal = ({ onClose, theme }) => {
  const dark = theme === 'dark';
  const session = useMemo(() => createFeedbackSession(), []);
  const context = useMemo(() => feedbackContext(), []);
  const messageRef = useRef(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot, hidden from people
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  // Solve the proof of work in the background while the user writes
  useEffect(() => {
    session.prepare().catch(() => {});
    messageRef.current?.focus();
  }, [session]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, sending]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (message.trim().length < 2) {
      setError('Please write a message.');
      messageRef.current?.focus();
      return;
    }
    setSending(true);
    setError('');
    try {
      await session.submit({ name, email, message, website });
      setSent(true);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSending(false);
    }
  };

  const inputClass = `w-full px-3 py-2 rounded border text-sm ${
    dark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
  }`;
  const labelClass = `block text-sm font-semibold mb-1 ${dark ? 'text-gray-200' : 'text-gray-800'}`;
  const hintClass = `text-xs ${dark ? 'text-gray-500' : 'text-gray-500'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className={`w-full max-w-lg rounded-lg shadow-2xl ${dark ? 'bg-gray-800' : 'bg-white'}`}
      >
        <div className={`flex items-center justify-between p-5 border-b ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <MessageCircle className={`w-5 h-5 ${dark ? 'text-purple-400' : 'text-purple-600'}`} />
            <h2 id="feedback-title" className={`text-lg font-bold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
              Send feedback
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`p-2 rounded transition-colors ${
              dark ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle className="w-10 h-10 mx-auto text-green-500" />
            <p className={`font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>Thanks — your message was sent.</p>
            <p className={hintClass}>
              {email ? "We'll reply to the email address you gave." : 'You didn’t leave an email address, so we won’t be able to reply.'}
            </p>
            <button
              onClick={onClose}
              className={`mt-2 px-4 py-2 rounded ${dark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="p-5 space-y-4">
              <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                Report a bug, suggest a feature, or just say hello.
              </p>

              <div>
                <label htmlFor="feedback-message" className={labelClass}>Message</label>
                <textarea
                  id="feedback-message"
                  ref={messageRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={MAX_MESSAGE}
                  rows={6}
                  className={`${inputClass} resize-y`}
                />
                <p className={`${hintClass} mt-1 text-right`}>{message.length} / {MAX_MESSAGE}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="feedback-name" className={labelClass}>
                    Name <span className={`font-normal ${hintClass}`}>(optional)</span>
                  </label>
                  <input id="feedback-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="feedback-email" className={labelClass}>
                    Email <span className={`font-normal ${hintClass}`}>(optional, for a reply)</span>
                  </label>
                  <input id="feedback-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" className={inputClass} />
                </div>
              </div>

              {/* Honeypot: off-screen and skipped by keyboard and screen readers */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <label htmlFor="feedback-website">Leave this field empty</label>
                <input id="feedback-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>

              <details className={hintClass}>
                <summary className="cursor-pointer">Also sent with your message</summary>
                <ul className="mt-1 ml-4 list-disc">
                  {Object.entries(context).map(([key, value]) => (
                    <li key={key}><span className="font-medium">{key}:</span> {value}</li>
                  ))}
                </ul>
                <p className="mt-1">No files, notes or API keys are ever included.</p>
              </details>

              {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            </div>

            <div className={`flex items-center justify-end gap-3 p-5 border-t ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className={`px-4 py-2 rounded transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className={`flex items-center gap-2 px-4 py-2 rounded transition-colors text-white disabled:opacity-60 ${
                  dark ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-500 hover:bg-purple-600'
                }`}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
