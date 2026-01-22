import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import NativePrintDialog from './components/NativePrintDialog';

export default function App() {
  const [pdfPath, setPdfPath] = useState<string>('');

  const handlePickPdf = async () => {
    const selection = await open({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      multiple: false
    });

    if (typeof selection === 'string') {
      setPdfPath(selection);
    }
  };

  return (
    <div className="app">
      <header>
        <p className="eyebrow">Native PDF Print Plugin</p>
        <h1>Preview and print selected PDF pages.</h1>
        <p className="subhead">
          This lab app renders PDFs in-app, lets you pick pages, and submits the
          selected pages to the native print spooler.
        </p>
      </header>

      <div className="row">
        <button onClick={handlePickPdf}>Pick PDF</button>
        <span className="path">{pdfPath || 'No file selected'}</span>
      </div>

      <NativePrintDialog filePath={pdfPath} />
    </div>
  );
}
