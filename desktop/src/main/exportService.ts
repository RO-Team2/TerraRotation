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
      { name: 'GeoJSON / ISOXML Boundary', extensions: ['geojson', 'json'] },
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

export async function savePdfReportDialog(
  win: BrowserWindow | null
): Promise<{ savedPath?: string }> {
  if (!win) return {};

  const result = await dialog.showSaveDialog(win, {
    title: 'Zapisz raport agronomiczny NASA Earth Data (PDF)',
    defaultPath: `fieldshift_raport_nasa_${new Date().toISOString().slice(0, 10)}.pdf`,
    filters: [{ name: 'Dokument PDF', extensions: ['pdf'] }],
  });

  if (result.canceled || !result.filePath) {
    return {};
  }

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    landscape: true,
    pageSize: 'A4',
  });

  writeFileSync(result.filePath, pdfBuffer);
  return { savedPath: result.filePath };
}
