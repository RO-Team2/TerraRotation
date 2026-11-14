import { BrowserWindow, dialog } from 'electron';
import { writeFileSync } from 'node:fs';

export async function saveGeoJsonDialog(
  win: BrowserWindow | null,
  payload: unknown
): Promise<{ savedPath?: string }> {
  const options: Electron.SaveDialogOptions = {
    title: 'Eksportuj mapę aplikacyjną do terminala ciągnika (GeoJSON)',
    defaultPath: `fieldshift_tractor_plan_${new Date().toISOString().slice(0, 10)}.geojson`,
    filters: [
      { name: 'GeoJSON/ISOXML Boundary', extensions: ['geojson', 'json'] },
    ],
  };

  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) {
    return {};
  }

  writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return { savedPath: result.filePath };
}

export type PdfView = 'analysis' | 'map' | 'team';
export function captureActiveReport(requestedView?: unknown): { view: PdfView; html: string; css: string } {
  const reports = Array.from(document.querySelectorAll<HTMLElement>('[data-pdf-report]'));
  const report = reports.find(element => !element.closest('[hidden]') && element.getClientRects().length > 0
    && (requestedView === undefined || element.dataset.pdfReport === requestedView));
  if (!report || report.dataset.pdfReady !== 'true') {
    throw new Error('Brak gotowego raportu w aktywnej zakładce. Najpierw zakończ analizę.');
  }
  const view = report.dataset.pdfReport as PdfView;
  const clone = report.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-no-print], button, input, select, textarea, .map-panel, script, iframe, object, embed').forEach(node => node.remove());
  clone.querySelectorAll('[data-pdf-export-time]').forEach(node => { node.textContent = `Eksport: ${new Date().toLocaleString('pl-PL')}`; });
  clone.querySelectorAll('details').forEach(details => { details.open = true; });
  clone.querySelectorAll('*').forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith('on')) element.removeAttribute(attribute.name);
    }
  });
  const css = Array.from(document.styleSheets).flatMap(sheet => {
    try {
      return Array.from(sheet.cssRules).filter(rule => rule.type !== 3).map(rule => rule.cssText);
    } catch { return []; }
  }).join('\n');
  return { view, html: clone.outerHTML, css };
}

export async function renderReportPdf(snapshot: { view: PdfView; html: string; css: string }): Promise<Buffer> {
  const printWindow = new BrowserWindow({
    show: false, width: 900, height: 1200,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  try {
    const safeCss = snapshot.css.replace(/<\/style/gi, '<\\/style');
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">
      <title>TerraRotation</title><style>${safeCss}</style></head>
      <body class="pdf-document pdf-${snapshot.view}">${snapshot.html}</body></html>`;
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await printWindow.webContents.executeJavaScript(`document.fonts.ready.then(() => true)`);
    return await printWindow.webContents.printToPDF({
      printBackground: true, landscape: false, pageSize: 'A4', preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  } finally {
    printWindow.destroy();
  }
}

let exportingPdf = false;

export async function savePdfReportDialog(
  win: BrowserWindow | null,
  requestedView?: unknown,
): Promise<{ savedPath?: string }> {
  if (!win) return {};
  if (exportingPdf) throw new Error('Eksport PDF już trwa. Poczekaj na zakończenie.');
  const view = requestedView === 'analysis' || requestedView === 'map' ? requestedView : undefined;
  exportingPdf = true;
  try {
    const captured = await win.webContents.executeJavaScript(
      `(() => { try { return { snapshot: (${captureActiveReport.toString()})(${JSON.stringify(view) ?? 'undefined'}) }; } catch (error) { return { error: error.message }; } })()`,
    ) as { snapshot?: ReturnType<typeof captureActiveReport>; error?: string };
    if (!captured.snapshot) throw new Error(captured.error ?? 'Nie udało się przygotować raportu PDF.');
    const snapshot = captured.snapshot;
    const name = { analysis: 'plan_zmianowania', map: 'raport_satelitarny', team: 'panel_zespolu' }[snapshot.view];
    const result = await dialog.showSaveDialog(win, {
      title: snapshot.view === 'map' ? 'Zapisz raport satelitarny PDF' : 'Zapisz plan zmianowania PDF',
      defaultPath: `terrarotation_${name}_${new Date().toISOString().slice(0, 10)}.pdf`,
      filters: [{ name: 'Dokument PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return {};
    const pdfBuffer = await renderReportPdf(snapshot);
    const filePath = /\.pdf$/i.test(result.filePath) ? result.filePath : `${result.filePath}.pdf`;
    writeFileSync(filePath, pdfBuffer);
    return { savedPath: filePath };
  } finally {
    exportingPdf = false;
  }
}
