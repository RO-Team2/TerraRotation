import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { savePdfReportDialog } from './exportService';

const API_BASE = (process.env.TERRAROTATION_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

let mainWindow: BrowserWindow | null = null;

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error(`Cannot connect to API (${API_BASE}). Check that the backend is running.`);
  }

  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const detail =
      typeof body === 'object' && body !== null && 'detail' in body
        ? JSON.stringify((body as { detail: unknown }).detail)
        : `HTTP ${response.status}`;
    throw new Error(`API returned an error: ${detail}`);
  }
  return body as T;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 740,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0F172A',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('window:control', (_event, action: 'minimize' | 'maximize' | 'close') => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
  if (action === 'close') mainWindow.close();
});

ipcMain.handle('export:pdf', (_event, view: unknown) => savePdfReportDialog(mainWindow, view));
ipcMain.handle('api:health', () => apiRequest('/api/v1/health'));
ipcMain.handle('api:config', () => apiRequest('/api/v1/config'));
ipcMain.handle('api:crops', () => apiRequest('/api/v1/crops'));
ipcMain.handle('api:satellite', (_event, payload: unknown) => apiRequest('/api/v1/satellite/field', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(120000),
}));
ipcMain.handle('api:map-job-start', (_event, payload: unknown) => apiRequest('/api/map/jobs', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
}));
ipcMain.handle('api:map-job-status', (_event, id: string) => apiRequest(`/api/map/jobs/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) }));
ipcMain.handle('api:map-job-cancel', (_event, id: string) => apiRequest(`/api/map/jobs/${encodeURIComponent(id)}`, { method: 'DELETE', signal: AbortSignal.timeout(10000) }));
ipcMain.handle('api:map-analyze', (_event, payload: unknown) => apiRequest('/api/map/analyze', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload), signal: AbortSignal.timeout(125000),
}));
ipcMain.handle('api:recommend', (_event, payload: unknown) =>
  apiRequest('/api/v1/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
);


app.disableHardwareAcceleration();

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
