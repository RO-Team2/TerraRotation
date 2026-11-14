import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';

const API_BASE = (process.env.TERRAROTATION_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error(`Nie można połączyć się z API (${API_BASE}). Uruchom backend FastAPI i spróbuj ponownie.`);
  }

  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const detail = typeof body === 'object' && body !== null && 'detail' in body
      ? JSON.stringify((body as { detail: unknown }).detail)
      : `HTTP ${response.status}`;
    throw new Error(`API zwróciło błąd: ${detail}`);
  }
  return body as T;
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 680,
    backgroundColor: '#f5f7f2',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('api:health', () => apiRequest('/api/v1/health'));
ipcMain.handle('api:config', () => apiRequest('/api/v1/config'));
ipcMain.handle('api:crops', () => apiRequest('/api/v1/crops'));
ipcMain.handle('api:recommend', (_event, payload: unknown) => apiRequest('/api/v1/recommend', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
}));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
