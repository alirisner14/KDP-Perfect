'use strict';

// Runs in an isolated, sandboxed context. Exposes one narrow capability to the page:
// "ask the main process to save these bytes via a native Save As dialog".
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kdpDesktop', {
  platform: process.platform,
  saveFile: ({ suggestedName, data }) => ipcRenderer.invoke('kdp:save-file', { suggestedName, data }),
});
