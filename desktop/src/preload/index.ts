import { contextBridge, ipcRenderer } from 'electron';

const nasaApi = {
  windowControl: (action: 'minimize' | 'maximize' | 'close') =>
    ipcRenderer.invoke('window:control', action),
  syncNasaData: (fieldId: string) =>
    ipcRenderer.invoke('nasa:sync-field', fieldId),
  exportGeoJSON: (payload: unknown) =>
    ipcRenderer.invoke('export:geojson', payload),
  exportPDF: (payload: unknown) =>
    ipcRenderer.invoke('export:pdf', payload),
};

const terraApi = {
  health: () => ipcRenderer.invoke('api:health'),
  config: () => ipcRenderer.invoke('api:config'),
  crops: () => ipcRenderer.invoke('api:crops'),
  recommend: (payload: unknown) => ipcRenderer.invoke('api:recommend', payload),
};

contextBridge.exposeInMainWorld('nasaApi', nasaApi);
contextBridge.exposeInMainWorld('terraApi', terraApi);
