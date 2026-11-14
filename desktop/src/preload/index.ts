import { contextBridge, ipcRenderer } from 'electron';

const api = {
  health: () => ipcRenderer.invoke('api:health'),
  config: () => ipcRenderer.invoke('api:config'),
  crops: () => ipcRenderer.invoke('api:crops'),
  recommend: (payload: unknown) => ipcRenderer.invoke('api:recommend', payload),
};

contextBridge.exposeInMainWorld('terraApi', api);
