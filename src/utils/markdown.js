import { marked } from 'marked';
import DOMPurify from 'dompurify';

// marked passes raw HTML through untouched, so anything it renders into the
// app must go through here first; otherwise a .md file (or an AI reply) could
// run script inside TidyCode.
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(String(html ?? ''));
}

export function renderMarkdown(text, options) {
  return sanitizeHtml(marked.parse(String(text ?? ''), options));
}
