const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const express = require('express');
const { net } = require('electron');

require('dotenv').config();

try { require('electron-reloader')(module); } catch (_) {}

let wss;
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');
const tickerPath = path.join(userDataPath, 'ticker.json');
const bannerPath = path.join(userDataPath, 'banner.json');
const mainContentPath = path.join(userDataPath, 'mainContent.json');
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';

// --- Spotify API --- //
ipcMain.handle('spotify-login', () => {
    return new Promise((resolve, reject) => {
        const authWindow = new BrowserWindow({
            width: 500, height: 600,
            webPreferences: { nodeIntegration: false, contextIsolation: true }
        });

        const scopes = 'streaming user-read-private user-modify-playback-state';
        const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${SPOTIFY_CLIENT_ID}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

        authWindow.loadURL(authUrl);

        const onWillRedirect = (event, url) => {
            const urlParams = new URLSearchParams(new URL(url).search);
            if (url.startsWith(REDIRECT_URI) && urlParams.has('code')) {
                const authCode = urlParams.get('code');
                authWindow.close();

                // Exchange the code for tokens
                const tokenRequest = net.request({
                    method: 'POST',
                    url: 'https://accounts.spotify.com/api/token',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
                    }
                });

                const requestBody = `grant_type=authorization_code&code=${authCode}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
                tokenRequest.write(requestBody);

                tokenRequest.on('response', response => {
                    let responseBody = '';
                    response.on('data', chunk => responseBody += chunk);
                    response.on('end', () => {
                        try {
                            const tokenData = JSON.parse(responseBody);
                            const config = readConfig();
                            config.spotifyAuth = {
                                accessToken: tokenData.access_token,
                                refreshToken: tokenData.refresh_token,
                                expiresAt: Date.now() + tokenData.expires_in * 1000
                            };
                            writeConfig(config);
                            resolve({ success: true });
                        } catch (e) { reject(e); }
                    });
                });
                tokenRequest.end();
            }
        };

        authWindow.webContents.on('will-redirect', onWillRedirect);
    });
});

// --- Persistent Storage Functions ---
function readConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
    } catch (error) { console.error('Error reading config file:', error); }
    return {};
}

function writeConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) { console.error('Error writing config file:', error); }
}

// --- Main App Setup ---
function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    }
  });
  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // --- WebSocket Server ---
  wss = new WebSocket.Server({ port: 8080 });
  wss.on('connection', ws => {
    console.log('[Server] A client has connected!');
    ws.on('close', () => console.log('[Server] Client disconnected.'));
  });

  // --- Static File Server ---
  const expressApp = express();
  const config = readConfig();
  if (config.mediaFolder && fs.existsSync(config.mediaFolder)) {
      expressApp.use('/media', express.static(config.mediaFolder));
  }
  expressApp.listen(8081, () => {
    console.log('Static file server running at http://localhost:8081');
  });

  // --- IPC Handlers for Persistent Data ---
  ipcMain.on('send-command', (event, command) => {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(command));
    });
  });

ipcMain.handle('get-initial-data', () => {
    const config = readConfig();
    let tickerMessages = [];
    if (fs.existsSync(tickerPath)) { /* ... */ }
    let bannerImages = [];
    if (fs.existsSync(bannerPath)) { /* ... */ }
    let mainContentState = null;
    if (fs.existsSync(mainContentPath)) {
        try { mainContentState = JSON.parse(fs.readFileSync(mainContentPath, 'utf-8')); }
        catch(e) { console.error('Error reading main content file:', e); }
    }

    return { config, tickerMessages, bannerImages, mainContentState }; // NEW: Return the mainContentState
});

  ipcMain.handle('select-media-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (canceled || filePaths.length === 0) return null;
    const folderPath = filePaths[0];
    const config = readConfig();
    config.mediaFolder = folderPath;
    writeConfig(config);
    app.relaunch();
    app.exit();
    return folderPath;
  });

  ipcMain.handle('get-media-files', () => {
      const config = readConfig();
      if (!config.mediaFolder || !fs.existsSync(config.mediaFolder)) return [];
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm'];
      try {
          return fs.readdirSync(config.mediaFolder)
              .filter(file => validExtensions.includes(path.extname(file).toLowerCase()))
              .map(file => ({ name: file, url: `http://localhost:8081/media/${file}` }));
      } catch (error) {
          console.error('Error reading media folder:', error);
          return [];
      }
  });

  ipcMain.on('save-main-content', (event, state) => {
    try {
        fs.writeFileSync(mainContentPath, JSON.stringify(state, null, 2));
    } catch(error) {
        console.error('Error saving main content state:', error);
    }
});
  
  ipcMain.on('save-ticker-messages', (event, messages) => {
      try {
          fs.writeFileSync(tickerPath, JSON.stringify(messages, null, 2));
      } catch(error) {
          console.error('Error saving ticker messages:', error);
      }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});