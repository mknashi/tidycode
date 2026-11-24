import React, { useEffect, useRef, useState } from 'react';

export const NEW_FILE_TYPES = [
  ['auto', 'Auto-detect', '', null],
  ['text', 'Plain text', '.txt', 'text'],
  ['json', 'JSON', '.json', 'json'],
  ['yaml', 'YAML', '.yaml', 'yaml'],
  ['toml', 'TOML', '.toml', 'toml'],
  ['xml', 'XML', '.xml', 'markup'],
  ['markdown', 'Markdown', '.md', 'markdown'],
  ['csv', 'CSV', '.csv', null],
  ['http', 'HTTP requests', '.http', 'http'],
  ['javascript', 'JavaScript', '.js', 'javascript'],
  ['typescript', 'TypeScript', '.ts', 'typescript'],
  ['python', 'Python', '.py', 'python'],
  ['html', 'HTML', '.html', 'markup'],
  ['css', 'CSS', '.css', 'css'],
  ['sql', 'SQL', '.sql', 'sql'],
];

export default function NewFileDialog({ theme, onCreate, onClose }) {
  const dialog = useRef(null);
  const [type, setType] = useState('auto');
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby="new-file-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      className={`rounded-xl border p-5 w-[360px] max-w-[90vw] shadow-2xl backdrop:bg-black/50 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}>
      <form onSubmit={event => { event.preventDefault(); onCreate(NEW_FILE_TYPES.find(item => item[0] === type)); }}>
        <h2 id="new-file-title" className="font-semibold text-base mb-4">New file</h2>
        <label className="block text-sm mb-2" htmlFor="new-file-type">File type</label>
        <select id="new-file-type" autoFocus value={type} onChange={event => setType(event.target.value)}
          className={`w-full rounded border px-3 py-2 text-sm ${theme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'}`}>
          {NEW_FILE_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <p className="text-xs opacity-70 mt-2">{type === 'auto' ? 'Detect the type from the content you enter.' : 'Use this file type for editing and saving.'}</p>
        <div className="flex justify-end gap-2 mt-5 text-sm">
          <button type="button" onClick={onClose} className="rounded border border-gray-500 px-3 py-1.5">Cancel</button>
          <button type="submit" className="rounded bg-indigo-600 text-white px-3 py-1.5">Create</button>
        </div>
      </form>
    </dialog>
  );
}
