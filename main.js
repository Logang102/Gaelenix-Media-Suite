import { app, BrowserWindow, ipcMain, dialog, net } from 'electron';
import path from 'path';
import fs from 'fs';
import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Optional: electron-reloader
try {
  const reloader = await import('electron-reloader');
  reloader.default(import.meta.url);
} catch (_) {}

let wss;
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');
const tickerPath = path.join(userDataPath, 'ticker.json');
const bannerPath = path.join(userDataPath, 'banner.json');
const mainContentPath = path.join(userDataPath, 'mainContent.json');
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';

let mainWindow;

// --- Persistent Storage Functions ---
function readJsonFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(fileContent);
        }
    } catch (error) {
        console.error(`Error reading or parsing JSON from ${filePath}:`, error);
    }
    return null;
}

function writeJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing JSON to ${filePath}:`, error);
    }
}

// --- Spotify API Logic ---
ipcMain.handle('spotify-login', () => {
    return new Promise((resolve, reject) => {
        const authWindow = new BrowserWindow({
            width: 500, height: 600,
            webPreferences: { nodeIntegration: false, contextIsolation: true }
        });

        const scopes = 'streaming user-read-private user-modify-playback-state';
        // --- CORRECTED URL ---
        const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=code&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

        authWindow.loadURL(authUrl);

        const onWillRedirect = (event, url) => {
            if (!url.startsWith(REDIRECT_URI)) return;

            const urlParams = new URL(url).searchParams;
            const authCode = urlParams.get('code');
            const error = urlParams.get('error');

            authWindow.close();

            if (error) {
                return reject(new Error(`Spotify Auth Error: ${error}`));
            }

            if (authCode) {
                const tokenRequest = net.request({
                    method: 'POST',
                    // --- CORRECTED URL ---
                    url: 'https://accounts.spotify.com/api/token',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
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
                            if (tokenData.error) {
                                return reject(new Error(tokenData.error_description));
                            }
                            const config = readJsonFile(configPath) || {};
                            config.spotifyAuth = {
                                accessToken: tokenData.access_token,
                                refreshToken: tokenData.refresh_token,
                                expiresAt: Date.now() + tokenData.expires_in * 1000
                            };
                            writeJsonFile(configPath, config);
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

async function spotifyApiRequest(endpoint, method, body) {
    const config = readJsonFile(configPath) || {};
    if (!config.spotifyAuth) return { error: 'Not logged into Spotify.' };

    // --- CORRECTED URL ---
    const response = await net.fetch(`https://api.spotify.com/v1/${endpoint}`, {
        method,
        headers: { 'Authorization': `Bearer ${config.spotifyAuth.accessToken}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });
    
    if (response.status === 204 || response.status === 202) return { success: true };
    if (!response.ok) return { error: `Spotify API Error: ${response.statusText}`};
    return { success: true, data: await response.json().catch(() => ({})) };
}

ipcMain.handle('spotify-play', (e, trackUri) => spotifyApiRequest('me/player/play', 'PUT', { uris: [trackUri] }));
ipcMain.handle('spotify-pause', () => spotifyApiRequest('me/player/pause', 'PUT'));


// --- Main App Setup ---
function createWindow() {
    mainWindow = new BrowserWindow({
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

    wss = new WebSocketServer({ port: 8080 });
    wss.on('connection', ws => {
        console.log('[Server] A client has connected!');
        ws.on('close', () => console.log('[Server] Client disconnected.'));
    });

    const expressApp = express();
    const config = readJsonFile(configPath) || {};
    if (config.mediaFolder && fs.existsSync(config.mediaFolder)) {
        expressApp.use('/media', express.static(config.mediaFolder));
    }
    expressApp.listen(8081, () => {
        console.log('Static file server running at http://localhost:8081');
    });
});

// --- IPC Handlers for Persistent Data ---
ipcMain.on('send-command', (event, command) => {
    const commandString = JSON.stringify(command);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(commandString);
    });
});

ipcMain.handle('get-initial-data', () => {
    return {
        config: readJsonFile(configPath) || {},
        tickerMessages: readJsonFile(tickerPath) || [],
        bannerImages: readJsonFile(bannerPath) || [],
        mainContentState: readJsonFile(mainContentPath)
    };
});

ipcMain.handle('select-media-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (canceled || filePaths.length === 0) return null;
    
    const folderPath = filePaths[0];
    const config = readJsonFile(configPath) || {};
    config.mediaFolder = folderPath;
    writeJsonFile(configPath, config);
    
    mainWindow.webContents.send('media-folder-changed'); 
    return folderPath;
});

ipcMain.handle('get-media-files', () => {
    const config = readJsonFile(configPath) || {};
    if (!config.mediaFolder || !fs.existsSync(config.mediaFolder)) return [];
    
    const validExtensions = ['.jpg', '.jpeg', '.png', 'gif', '.mp4', '.webm'];
    try {
        return fs.readdirSync(config.mediaFolder)
            .filter(file => validExtensions.includes(path.extname(file).toLowerCase()))
            .map(file => ({ name: file, url: `http://localhost:8081/media/${file}` }));
    } catch (error) {
        console.error('Error reading media folder:', error);
        return [];
    }
});

ipcMain.on('save-main-content', (event, state) => writeJsonFile(mainContentPath, state));
ipcMain.on('save-ticker-messages', (event, messages) => writeJsonFile(tickerPath, messages));
ipcMain.on('save-banner-images', (event, images) => writeJsonFile(bannerPath, images));

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});