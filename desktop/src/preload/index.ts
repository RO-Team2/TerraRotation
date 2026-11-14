import { contextBridge, ipcRenderer } from 'electron';

function presentSatelliteError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/COPERNICUS_CLIENT_ID|COPERNICUS_CLIENT_SECRET|Skonfiguruj.*Copernicus/i.test(message)) {
    return new Error([
      'Nie skonfigurowano dostępu do analizy Sentinel-2. To osobne poświadczenia Copernicus Data Space — nie są potrzebne do wyświetlenia kafelków mapy.',
      '1. Utwórz klienta OAuth w https://shapps.dataspace.copernicus.eu/dashboard/.',
      '2. W terminalu backendu (WSL), w katalogu repozytorium, ustaw:',
      '   export COPERNICUS_CLIENT_ID="TWÓJ_CLIENT_ID"',
      '   export COPERNICUS_CLIENT_SECRET="TWÓJ_CLIENT_SECRET"',
      '3. Uruchom ponownie uvicorn w tym samym terminalu. Nie wklejaj tych sekretów do kodu ani do repozytorium.',
      'Jeśli nie masz klienta OAuth, korzystaj z płodozmianu NASA POWER/SoilGrids; przycisk analizy Sentinel-2 wymaga tych danych.',
    ].join('\n'));
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
  mapJobStart: (payload: unknown) => ipcRenderer.invoke('api:map-job-start', payload),
  mapJobStatus: (id: string) => ipcRenderer.invoke('api:map-job-status', id),
  mapJobCancel: (id: string) => ipcRenderer.invoke('api:map-job-cancel', id),
  mapAnalyze: (payload: unknown) => ipcRenderer.invoke('api:map-analyze', payload),
  health: () => ipcRenderer.invoke('api:health'),
  config: () => ipcRenderer.invoke('api:config'),
  crops: () => ipcRenderer.invoke('api:crops'),
  recommend: (payload: unknown) => ipcRenderer.invoke('api:recommend', payload),
};

contextBridge.exposeInMainWorld('nasaApi', nasaApi);
contextBridge.exposeInMainWorld('terraApi', terraApi);
