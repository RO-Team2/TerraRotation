import { useState } from 'react';

export default function PdfExportButton({ view, disabled = false }: { view: 'analysis' | 'map'; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function exportReport() {
    setBusy(true); setMessage('');
    try {
      const result = await window.terraApi.exportPdf(view);
      if (result.savedPath) setMessage('PDF saved.');
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : 'Could not save PDF.';
      setMessage(text.replace(/^Error invoking remote method '[^']+':\s*/, ''));
    } finally { setBusy(false); }
  }
  return <div className="pdf-export-control" data-no-print>
    <button type="button" className="pdf-export-button" disabled={disabled || busy} onClick={() => void exportReport()}>
      {busy ? 'Saving PDF…' : 'Export to PDF'}
    </button>
    {message && <span role="status">{message}</span>}
  </div>;
}
