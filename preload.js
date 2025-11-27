const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Commands
  sendCommand: (command) => ipcRenderer.send('send-command', command),
  
  // Data & Files
  getInitialData: () => ipcRenderer.invoke('get-initial-data'),
  selectMediaFolder: () => ipcRenderer.invoke('select-media-folder'),
  getMediaFiles: () => ipcRenderer.invoke('get-media-files'),
  onMediaFolderChanged: (callback) => ipcRenderer.on('media-folder-changed', (event, ...args) => callback(...args)),

  // Window Control
  openPreviewWindow: () => ipcRenderer.send('open-preview-window'),

  // State Saving
  saveTickerMessages: (messages) => ipcRenderer.send('save-ticker-messages', messages),
  saveBannerImages: (images) => ipcRenderer.send('save-banner-images', images),
  saveMainContent: (state) => ipcRenderer.send('save-main-content', state),

  // Spotify
  spotifyLogin: () => ipcRenderer.invoke('spotify-login'),
  spotifyPlay: (trackUri) => ipcRenderer.invoke('spotify-play', trackUri),
  spotifyPause: () => ipcRenderer.invoke('spotify-pause'),

  onPreviewCommand: (callback) => ipcRenderer.on('preview-command', (_event, value) => callback(value)),
  // Add inside the exposeInMainWorld object:
  onTvListUpdated: (callback) => ipcRenderer.on('tv-list-updated', (_event, value) => callback(value)),
});