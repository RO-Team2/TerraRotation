import { contextBridge, ipcRenderer } from 'electron';

function presentSatelliteError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/COPERNICUS_CLIENT_ID|COPERNICUS_CLIENT_SECRET|Skonfiguruj.*Copernicus/i.test(message)) {
    return new Error('Analiza Sentinel-2 wymaga poświadczeń Copernicus Data Space. Ustaw COPERNICUS_CLIENT_ID i COPERNICUS_CLIENT_SECRET w terminalu backendu, po czym uruchom go ponownie. Podkład mapy działa niezależnie od tych danych.');
  }
  return new Error(message.replace(/^Error invoking remote method '[^']+':\s*/, ''));
}

const nasaApi = {
  windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.invoke('window:control', action),
  syncNasaData: (fieldId: string) => ipcRenderer.invoke('nasa:sync-field', fieldId),
  exportGeoJSON: (payload: unknown) => ipcRenderer.invoke('export:geojson', payload),
  exportPDF: (payload?: unknown) => ipcRenderer.invoke('export:pdf', payload),
};

const terraApi = {
  windowControl: nasaApi.windowControl,
  syncField: nasaApi.syncNasaData,
  exportGeoJson: nasaApi.exportGeoJSON,
  exportPdf: () => nasaApi.exportPDF(undefined),
  satellite: async (payload: unknown) => {
    try { return await ipcRenderer.invoke('api:satellite', payload); }
    catch (error) { throw presentSatelliteError(error); }
  },
  health: () => ipcRenderer.invoke('api:health'),
  config: () => ipcRenderer.invoke('api:config'),
  crops: () => ipcRenderer.invoke('api:crops'),
  recommend: (payload: unknown) => ipcRenderer.invoke('api:recommend', payload),
};

contextBridge.exposeInMainWorld('nasaApi', nasaApi);
contextBridge.exposeInMainWorld('terraApi', terraApi);
