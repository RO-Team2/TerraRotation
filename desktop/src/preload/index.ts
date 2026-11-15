import { contextBridge, ipcRenderer } from 'electron';

function presentSatelliteError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/COPERNICUS_CLIENT_ID|COPERNICUS_CLIENT_SECRET|Skonfiguruj.*Copernicus/i.test(message)) {
    return new Error([
      'Sentinel-2 analysis access is not configured. It requires separate Copernicus Data Space credentials, which are not needed to display map tiles.',
      '1. Create an OAuth client at https://shapps.dataspace.copernicus.eu/dashboard/.',
      '2. In the backend terminal (WSL), from the repository directory, set:',
      '   export COPERNICUS_CLIENT_ID="YOUR_CLIENT_ID"',
      '   export COPERNICUS_CLIENT_SECRET="YOUR_CLIENT_SECRET"',
      '3. Restart uvicorn in the same terminal. Do not paste these credentials into the code or repository.',
      'Without an OAuth client, use NASA POWER/SoilGrids crop rotation planning; Sentinel-2 analysis requires these credentials.',
    ].join('\n'));
  }
  return new Error(message.replace(/^Error invoking remote method '[^']+':\s*/, ''));
}

const terraApi = {
  windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.invoke('window:control', action),
  exportPdf: (view?: 'analysis' | 'map') => ipcRenderer.invoke('export:pdf', view),
  satellite: async (payload: unknown) => {
    try { return await ipcRenderer.invoke('api:satellite', payload); }
    catch (error) { throw presentSatelliteError(error); }
  },
  mapJobStart: (payload: unknown) => ipcRenderer.invoke('api:map-job-start', payload),
  mapJobStatus: (id: string) => ipcRenderer.invoke('api:map-job-status', id),
  mapJobCancel: (id: string) => ipcRenderer.invoke('api:map-job-cancel', id),
  mapAnalyze: (payload: unknown) => ipcRenderer.invoke('api:map-analyze', payload),
  health: () => ipcRenderer.invoke('api:health'),
  config: () => ipcRenderer.invoke('api:config'),
  crops: () => ipcRenderer.invoke('api:crops'),
  recommend: (payload: unknown) => ipcRenderer.invoke('api:recommend', payload),
};

contextBridge.exposeInMainWorld('terraApi', terraApi);
