const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendCommand: (command) => ipcRenderer.send('send-command', command),
  getInitialData: () => ipcRenderer.invoke('get-initial-data'),
  selectMediaFolder: () => ipcRenderer.invoke('select-media-folder'),
  getMediaFiles: () => ipcRenderer.invoke('get-media-files'),
  saveTickerMessages: (messages) => ipcRenderer.send('save-ticker-messages', messages),
  saveBannerImages: (images) => ipcRenderer.send('save-banner-images', images),
  saveMainContent: (state) => ipcRenderer.send('save-main-content', state),
  spotifyLogin: () => ipcRenderer.invoke('spotify-login')
});