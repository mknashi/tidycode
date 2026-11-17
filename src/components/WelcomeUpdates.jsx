import React from 'react';
import { Shield, Braces, Wand2, GitCompare, Network } from 'lucide-react';

export default function WelcomeUpdates({ theme, desktop, onOpenAISettings }) {
  const dark = theme === 'dark';
  const features = [
    {
      icon: Shield,
      title: desktop ? 'Local AI on desktop' : 'Private AI with Gemini Nano',
      text: desktop
        ? 'Connect Ollama for local AI assistance. Choose your provider in AI Settings.'
        : 'Correct grammar, explain content, and summarize logs on your device in supported Chrome browsers. Small-JSON repair is experimental.',
    },
    {
      icon: Braces, title: 'Paste, format, validate',
      text: 'Valid JSON/XML formats on paste. Errors appear as you type, paste, or open a file, and clear when you fix them.',
    },
    {
      icon: Wand2, title: 'Auto Fix first, AI when needed',
      text: 'Local rules always try first. Enable optional AI repair in settings; cloud repair only runs when you click a named provider.',
    },
    {
      icon: GitCompare, title: 'Review and apply your changes',
      text: 'Compare the repair, then replace the current tab or open a new one. Accept All formats the result; replacement supports Undo.',
    },
    {
      icon: Network, title: 'Explore your data as a graph', wide: true,
      text: 'Open a JSON or XML file and choose Graph to explore its structure visually. Zoom, expand or collapse branches, and export the graph as SVG or PNG.',
    },
  ];
  return (
    <section aria-label="New in Tidy Code" className="text-left mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className={`text-sm font-semibold ${dark ? 'text-indigo-300' : 'text-indigo-700'}`}>New in Tidy Code</h2>
        <button onClick={onOpenAISettings} className={`text-xs rounded px-3 py-1.5 border ${dark ? 'border-indigo-500/50 text-indigo-200 hover:bg-indigo-500/20' : 'border-indigo-300 text-indigo-800 hover:bg-indigo-50'}`}>Explore AI Settings</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {features.map(({ icon: Icon, title, text, wide }, index) => (
          <article key={title} className={`rounded-lg border p-3 ${wide ? 'sm:col-span-2' : ''} ${dark ? 'border-gray-700 bg-gray-800/60' : 'border-gray-200 bg-white'}`}>
            <h3 className={`flex items-center gap-2 text-sm font-semibold mb-2 ${dark ? 'text-gray-100' : 'text-gray-900'}`}><Icon className={`w-4 h-4 shrink-0 ${dark ? 'text-indigo-300' : 'text-indigo-600'}`} aria-hidden="true" />{title}</h3>
            {!desktop && index === 0 && <p className={`text-xs mb-2 ${dark ? 'text-emerald-300' : 'text-emerald-700'}`}>Free · No API key · Local</p>}
            <p className={`text-xs leading-relaxed ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{text}</p>
          </article>
        ))}
      </div>
      <p className={`text-xs leading-relaxed mt-3 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Also improved: matching-brace and cursor contrast, plus editor-matched fonts and line spacing in errors and repair diffs.</p>
    </section>
  );
}
