const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Commands to Tizen
  sendCommand: (command) => ipcRenderer.send('send-command', command),
  
  // Data & File Operations
  getInitialData: () => ipcRenderer.invoke('get-initial-data'),
  selectMediaFolder: () => ipcRenderer.invoke('select-media-folder'),
  getMediaFiles: () => ipcRenderer.invoke('get-media-files'),
  onMediaFolderChanged: (callback) => ipcRenderer.on('media-folder-changed', (event, ...args) => callback(...args)),

  // Save State
  saveTickerMessages: (messages) => ipcRenderer.send('save-ticker-messages', messages),
  saveBannerImages: (images) => ipcRenderer.send('save-banner-images', images),
  saveMainContent: (state) => ipcRenderer.send('save-main-content', state),

  // Spotify
  spotifyLogin: () => ipcRenderer.invoke('spotify-login'),
  spotifyPlay: (trackUri) => ipcRenderer.invoke('spotify-play', trackUri),
  spotifyPause: () => ipcRenderer.invoke('spotify-pause')
});