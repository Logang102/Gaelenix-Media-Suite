/* ============================================================================
  FILE: renderer.js (Electron Renderer Process)
  ============================================================================
  UPDATED: Implemented single vs. queue functionality for the ticker.
*/
document.addEventListener('DOMContentLoaded', async () => {
    // --- Element References ---
    const [mainContentControl, sideBannerControl, bottomTickerControl] = 
        ['control-main-content', 'control-side-banner', 'control-bottom-ticker'].map(id => document.getElementById(id));
    const [panelContainer, panelTitle, panelContent, closePanelBtn] = 
        ['editing-panel-container', 'editing-panel-title', 'editing-panel-content', 'close-panel-btn'].map(id => document.getElementById(id));

    // --- State Management ---
    let mediaFiles = [];
    let tickerMessages = [];
    let selectedBannerImages = [];
    let mediaFolderPath = '';

    // --- Initial Data Load ---
    async function loadInitialData() {
        const { config, tickerMessages: savedTickerMessages, bannerImages: savedBannerImages, mainContentState } = await window.electronAPI.getInitialData();
        tickerMessages = savedTickerMessages || [];
        selectedBannerImages = savedBannerImages || [];
        mediaFolderPath = config.mediaFolder || '';
        if (mediaFolderPath) {
            mediaFiles = await window.electronAPI.getMediaFiles();
        }
        if (mainContentState) {
            window.electronAPI.sendCommand(mainContentState);
        }
                // Check if we have Spotify auth tokens
        if (config.spotifyAuth && config.spotifyAuth.accessToken) {
            // We are logged in. Let's send the token to the Tizen app to initialize the player.
            const command = { target: 'spotify', content: { accessToken: config.spotifyAuth.accessToken } };
            window.electronAPI.sendCommand(command);
        }
    }
    await loadInitialData();

    // --- Core Functions ---
    function openEditingPanel(zoneName) {
        panelTitle.textContent = `Editing: ${zoneName}`;
        let contentHTML = '';

        if (zoneName === 'Main Content') {
            const videoOptions = mediaFiles.filter(f => f.name.endsWith('.mp4') || f.name.endsWith('.webm')).map(f => `<option value="${f.url}">${f.name}</option>`).join('');
            contentHTML = `
                <div class="space-y-4">
                    <div class="flex items-center">
                        <input id="enable-sound-checkbox" type="checkbox" ...>
                        <label for="enable-sound-checkbox" ...>Enable Sound</label>
                    </div>
                    
                    <hr class="border-gray-600 my-4">
                    <div>
                        <label class="label-style">Display Mode</label>
                        <div id="layout-controls" class="grid grid-cols-3 gap-2 mt-2">
                            <button data-mode="default" class="btn-secondary layout-btn">Default</button>
                            <button data-mode="wide" class="btn-secondary layout-btn">Wide</button>
                            <button data-mode="fullscreen" class="btn-secondary layout-btn">Fullscreen</button>
                        </div>
                    </div>
                </div>`;
        } 
        else if (zoneName === 'Bottom Ticker') {
             contentHTML = `
                <div class="space-y-4">
                    <div>
                        <label class="label-style">Message Queue</label>
                        <p class="text-xs text-gray-400 mb-2">Click 'Send' for a single message, or 'Send Queue' for all.</p>
                        <div id="ticker-message-list" class="my-2 p-2 bg-gray-700 rounded-md min-h-[100px]"></div>
                        <div class="flex gap-2"><input type="text" id="new-ticker-message" class="input-field" placeholder="Add a message..."><button id="add-ticker-msg-btn" class="btn-secondary flex-shrink-0">Add</button></div>
                    </div>
                    <button id="send-queue-btn" class="btn-primary">Send Entire Queue to TVs</button>
                </div>`;
        } else if (zoneName === 'Side Banner') {
            const imageOptions = mediaFiles.filter(f => !f.name.endsWith('.mp4') && !f.name.endsWith('.webm')).map(f => `<option value="${f.url}">${f.name}</option>`).join('');
            contentHTML = `
                <div class="space-y-4">
                    <div>
                        <label class="label-style">Media Folder</label>
                        <p class="text-xs text-gray-400 truncate" title="${mediaFolderPath}">${mediaFolderPath || 'No folder selected.'}</p>
                        <button id="select-folder-btn" class="btn-secondary mt-2">Select Folder</button>
                    </div>
                    <hr class="border-gray-600 my-4">
                    <div>
                        <label for="image-select" class="label-style">Add Image to Carousel</label>
                        <div class="flex gap-2">
                           <select id="image-select" class="input-field"><option value="">-- Select an image --</option>${imageOptions}</select>
                           <button id="add-image-btn" class="btn-secondary flex-shrink-0">Add</button>
                        </div>
                        <div id="image-preview-list" class="my-2 p-2 bg-gray-700 rounded-md min-h-[100px]"></div>
                    </div>
                    <button id="update-banner-btn" class="btn-primary">Update Banner on TVs</button>
                </div>`;
        } 
        
        if (zoneName === 'Spotify') {
             contentHTML = `
                <div class="space-y-4">
                    <button id="login-spotify-btn" class="btn-secondary">Login to Spotify</button>
                    <hr class="border-gray-600 my-4">
                    <p class="text-xs text-gray-400">Enter a Spotify Track URI</p>
                    <input type="text" id="spotify-uri-input" class="input-field" placeholder="spotify:track:...">
                    <button id="play-spotify-btn" class="btn-primary">Play Track & Mute Video</button>
                    <button id="pause-spotify-btn" class="btn-secondary">Pause Music & Unmute Video</button>
                </div>`;
        }
        
        panelContent.innerHTML = contentHTML;
        if (zoneName === 'Side Banner') renderImagePreview();
        if (zoneName === 'Bottom Ticker') renderTickerPreview();
        addPanelButtonListeners(zoneName);
        panelContainer.classList.remove('hidden');
    }

    function addPanelButtonListeners(zoneName) {
        if (zoneName === 'Main Content') {
            document.getElementById('play-video-btn').addEventListener('click', handlePlayVideo);
            document.getElementById('play-local-video-btn').addEventListener('click', handlePlayLocalVideo);
            // NEW: Add a listener for the layout buttons
            document.getElementById('layout-controls').addEventListener('click', (e) => {
                if (e.target.classList.contains('layout-btn')) {
                    const mode = e.target.dataset.mode;
                    const command = { target: 'layout', content: { mode: mode } };
                    window.electronAPI.sendCommand(command);
                    // Optional: You could add persistence for this setting using the same
                    // pattern we used for the banner and main content.
                }
            });
        }
        else if (zoneName === 'Bottom Ticker') {
            document.getElementById('add-ticker-msg-btn').addEventListener('click', handleAddTickerMessage);
            document.getElementById('send-queue-btn').addEventListener('click', handleSendTickerQueue);
            document.getElementById('ticker-message-list').addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-btn')) handleRemoveTickerMessage(e);
                if (e.target.classList.contains('send-btn')) handleSendSingleTickerMessage(e);
            });
        } 
        else if (zoneName === 'Side Banner') {
            document.getElementById('select-folder-btn').addEventListener('click', handleSelectFolder);
            document.getElementById('add-image-btn').addEventListener('click', handleAddImageToBanner);
            document.getElementById('update-banner-btn').addEventListener('click', handleUpdateBanner);
            document.getElementById('image-preview-list').addEventListener('click', handleRemoveImage);
        }
        
        if (zoneName === 'Spotify') {
            document.getElementById('login-spotify-btn').addEventListener('click', async () => {
                await window.electronAPI.spotifyLogin();
                alert('Login successful! Please restart the app.');
            });
            document.getElementById('play-spotify-btn').addEventListener('click', handlePlaySpotify);
            document.getElementById('pause-spotify-btn').addEventListener('click', handlePauseSpotify);
        }
    }

    function closeEditingPanel() { panelContainer.classList.add('hidden'); }

    function getYouTubeId(url) {
        let ID = '';
        if (!url) return '';
        url = url.replace(/(>|<)/gi, '').split(/(vi\/|v=|\/v\/|youtu\.be\/|\/embed\/)/);
        if (url[2] !== undefined) {
            ID = url[2].split(/[^0-9a-z_\-]/i)[0];
        } else {
            ID = url.toString();
        }
        return ID;
    }
    
    function renderImagePreview() {
        const listEl = document.getElementById('image-preview-list');
        if (!listEl) return;
        listEl.innerHTML = selectedBannerImages.length === 0 ? '<p class="text-xs text-gray-400">No images added to carousel.</p>' :
            selectedBannerImages.map((url, i) => `<div class="preview-item"><span>${url.split('/').pop()}</span><button class="remove-btn" data-index="${i}">[x]</button></div>`).join('');
    }

    function renderTickerPreview() {
        const listEl = document.getElementById('ticker-message-list');
        if (!listEl) return;
        listEl.innerHTML = tickerMessages.length === 0 ? '<p class="text-xs text-gray-400">No messages in queue.</p>' :
            tickerMessages.map((msg, i) => `
                <div class="preview-item">
                    <span>${msg}</span>
                    <div class="flex-shrink-0">
                        <button class="send-btn" data-index="${i}">Send</button>
                        <button class="remove-btn" data-index="${i}">[x]</button>
                    </div>
                </div>`).join('');
    }

    // --- Command Handlers ---
    // --- Command Handlers ---
    function handlePlayVideo() {
        const urlInput = document.getElementById('youtube-url');
        const videoId = getYouTubeId(urlInput.value);
        // NEW: Check the status of the sound checkbox
        const soundEnabled = document.getElementById('enable-sound-checkbox').checked;

        if (videoId) {
            // NEW: Add the sound preference to the command
            const command = { target: 'mainZone', contentType: 'youtube', content: { videoId: videoId, soundEnabled: soundEnabled } };
            window.electronAPI.sendCommand(command);
            window.electronAPI.saveMainContent(command);
            closeEditingPanel();
        }
    }

    function handlePlayLocalVideo() {
        const select = document.getElementById('local-video-select');
        // NEW: Check the status of the sound checkbox
        const soundEnabled = document.getElementById('enable-sound-checkbox').checked;
        if (select.value) {
            // NEW: Add the sound preference to the command
            const command = { target: 'mainZone', contentType: 'localVideo', content: { videoUrl: select.value, soundEnabled: soundEnabled } };
            window.electronAPI.sendCommand(command);
            window.electronAPI.saveMainContent(command);
            closeEditingPanel();
        }
    }

    async function handleSelectFolder() {
        await window.electronAPI.selectMediaFolder();
        alert('Folder selected. The app will now restart to apply the changes.');
    }

    function handleAddImageToBanner() {
        const select = document.getElementById('image-select');
        if (select.value && !selectedBannerImages.includes(select.value)) {
            selectedBannerImages.push(select.value);
            renderImagePreview();
            window.electronAPI.saveBannerImages(selectedBannerImages);
        }
    }
    
    function handleUpdateBanner() {
        const command = { target: 'banner', contentType: 'carousel', content: { images: selectedBannerImages } };
        window.electronAPI.sendCommand(command);
        // REMOVED: Do not clear the selection anymore
      // selectedBannerImages = []; 
        closeEditingPanel();
    }

    function handleRemoveImage(event) {
        if (event.target.classList.contains('remove-btn')) {
            const index = parseInt(event.target.dataset.index, 10);
            selectedBannerImages.splice(index, 1);
            renderImagePreview();
            window.electronAPI.saveBannerImages(selectedBannerImages);
        }
    }

    function handleAddTickerMessage() {
        const input = document.getElementById('new-ticker-message');
        if (input.value.trim()) {
            tickerMessages.push(input.value.trim());
            input.value = '';
            renderTickerPreview();
            window.electronAPI.saveTickerMessages(tickerMessages);
        }
    }
    
    function handleSendTickerQueue() {
        const command = { target: 'ticker', content: { messages: tickerMessages } };
        window.electronAPI.sendCommand(command);
        closeEditingPanel();
    }
    
    function handleSendSingleTickerMessage(event) {
        const index = parseInt(event.target.dataset.index, 10);
        const singleMessage = tickerMessages[index];
        if (singleMessage) {
            const command = { target: 'ticker', content: { messages: [singleMessage] } };
            window.electronAPI.sendCommand(command);
        }
    }

    function handleRemoveTickerMessage(event) {
        const index = parseInt(event.target.dataset.index, 10);
        tickerMessages.splice(index, 1);
        renderTickerPreview();
        window.electronAPI.saveTickerMessages(tickerMessages);
    }

        // NEW: Add handler to play Spotify and mute the video
    async function handlePlaySpotify() {
        const { config, mainContentState } = await window.electronAPI.getInitialData();
        const trackUri = document.getElementById('spotify-uri-input').value;

        if (!config.spotifyAuth || !trackUri) {
            alert('Please login to Spotify and enter a track URI.');
            return;
        }

        // 1. Tell Spotify to play the track
        fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${config.spotifyAuth.accessToken}` },
            body: JSON.stringify({ uris: [trackUri] })
        });
        
        // 2. Mute the currently playing video
        if (mainContentState) {
            const muteCommand = { 
                target: 'mainZone', 
                contentType: mainContentState.contentType, 
                content: { ...mainContentState.content, soundEnabled: false } 
            };
            window.electronAPI.sendCommand(muteCommand);
        }
    }

    // NEW: Add handler to pause Spotify and unmute the video
    async function handlePauseSpotify() {
        const { config, mainContentState } = await window.electronAPI.getInitialData();
        if (!config.spotifyAuth) return;

        // 1. Tell Spotify to pause
        fetch('https://api.spotify.com/v1/me/player/pause', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${config.spotifyAuth.accessToken}` }
        });

        // 2. Unmute the video by re-sending its original command
        if (mainContentState) {
            window.electronAPI.sendCommand(mainContentState);
        }
    }

    // --- Initial Event Listeners ---
    mainContentControl.addEventListener('click', () => openEditingPanel('Main Content'));
    sideBannerControl.addEventListener('click', () => openEditingPanel('Side Banner'));
    bottomTickerControl.addEventListener('click', () => openEditingPanel('Bottom Ticker'));
    // NEW: Add a click handler for a new Spotify zone
    document.body.addEventListener('click', (e) => {
        if(e.target.id === 'control-spotify-zone') { // You would need to add this element to your index.html
            openEditingPanel('Spotify');
        }
    });
    closePanelBtn.addEventListener('click', closeEditingPanel);
});