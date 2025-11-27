document.addEventListener('DOMContentLoaded', async () => {
    // --- Element References ---
    const [mainContentControl, sideBannerControl, bottomTickerControl, spotifyControl, settingsControl, showPreviewBtn] =
        ['control-main-content', 'control-side-banner', 'control-bottom-ticker', 'control-spotify-zone', 'control-settings', 'show-preview-btn'].map(id => document.getElementById(id));
    const [panelContainer, panelTitle, panelContent, closePanelBtn] =
        ['editing-panel-container', 'editing-panel-title', 'editing-panel-content', 'close-panel-btn'].map(id => document.getElementById(id));
    const tvListContainer = document.getElementById('tv-list');
    const notificationEl = document.getElementById('notification-toast');

    // --- State Management ---
    let mediaFiles = [], tickerMessages = [], selectedBannerImages = [], mediaFolderPath = '', localIpAddress = '';
    let connectedTvs = []; 
    let currentTargetId = 'ALL'; // Default to broadcast

    // --- Core Helper Functions ---
    function showNotification(message, isError = false) {
        notificationEl.textContent = message;
        notificationEl.className = `notification-toast ${isError ? 'error' : 'success'}`;
        notificationEl.classList.add('show');
        setTimeout(() => notificationEl.classList.remove('show'), 3000);
    }

    // --- NEW: Command Sender Wrapper ---
    // Instead of calling window.electronAPI.sendCommand directly, we use this 
    // to automatically attach the current targetId (e.g., "Cardio TV" or "ALL").
    function sendCommand(commandObj) {
        commandObj.targetId = currentTargetId;
        window.electronAPI.sendCommand(commandObj);
    }

    // --- NEW: TV List Management ---
    window.electronAPI.onTvListUpdated((tvs) => {
        connectedTvs = tvs;
        renderTvList();
    });

    function renderTvList() {
        // Always start with 'ALL'
        let html = `<button class="tv-btn ${currentTargetId === 'ALL' ? 'active' : ''}" data-id="ALL">ALL TVs</button>`;
        
        connectedTvs.forEach(tvName => {
            html += `<button class="tv-btn ${currentTargetId === tvName ? 'active' : ''}" data-id="${tvName}">${tvName}</button>`;
        });
        
        tvListContainer.innerHTML = html;

        // Attach listeners to new buttons
        document.querySelectorAll('.tv-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                currentTargetId = e.target.dataset.id;
                renderTvList(); // Re-render to update styling
                showNotification(`Targeting: ${currentTargetId}`);
            });
        });
    }

    // Initialize TV list (start with just ALL)
    renderTvList();

    // --- Data Helpers ---
    function getYouTubeId(url) {
        let ID = '';
        if (!url) return '';
        url = url.replace(/(>|<)/gi, '').split(/(vi\/|v=|\/v\/|youtu\.be\/|\/embed\/)/);
        if (url[2] !== undefined) ID = url[2].split(/[^0-9a-z_\-]/i)[0];
        else ID = url.toString();
        return ID;
    }

    function getYouTubePlaylistId(url) {
        const regExp = /^.*(youtu.be\/|list=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2]) ? match[2] : null;
    }

    function renderImagePreview() {
        const listEl = document.getElementById('image-preview-list');
        if (!listEl) return;
        listEl.innerHTML = selectedBannerImages.length === 0 ? '<p style="font-size: 0.75rem; color: #9ca3af;">No images added to carousel.</p>' :
            selectedBannerImages.map((url, i) => `<div class="preview-item"><span>${url.split('/').pop()}</span><button class="remove-btn" data-index="${i}">[x]</button></div>`).join('');
    }

    function renderTickerPreview() {
        const listEl = document.getElementById('ticker-message-list');
        if (!listEl) return;
        listEl.innerHTML = tickerMessages.length === 0 ? '<p style="font-size: 0.75rem; color: #9ca3af;">No messages in queue.</p>' :
            tickerMessages.map((msg, i) => `<div class="preview-item"><span>${msg}</span><div style="flex-shrink: 0;"><button class="send-btn" data-index="${i}">Send</button><button class="remove-btn" data-index="${i}">[x]</button></div></div>`).join('');
    }

    function openEditingPanel(zoneName) {
        panelTitle.textContent = `Editing: ${zoneName}`;
        let contentHTML = '';

        const generateOptions = (filterFn) => mediaFiles.filter(filterFn).map(f => `<option value="${f.url}">${f.name}</option>`).join('');
        const videoOptions = generateOptions(f => f.name.endsWith('.mp4') || f.name.endsWith('.webm'));
        const imageOptions = generateOptions(f => !f.name.endsWith('.mp4') && !f.name.endsWith('.webm'));
        
        if (zoneName === 'Settings') {
             contentHTML = `
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <p class="label-style">Your Computer's IP Address is:</p>
                        <p style="font-size: 1.5rem; font-weight: bold; color: #a78bfa; margin-top: 0.25rem;">${localIpAddress}</p>
                    </div>
                    <hr style="border-color: #4b5563; margin: 1rem 0;">
                    <div>
                        <label class="label-style">Media Folder</label>
                        <p style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.5rem;">${mediaFolderPath || 'No folder selected.'}</p>
                        <button id="select-folder-btn" class="btn-secondary">Select New Folder</button>
                    </div>
                </div>`;
        } else if (zoneName === 'Main Content') {
             contentHTML = `
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <input type="checkbox" id="sound-enabled-checkbox" style="width: 1rem; height: 1rem;">
                        <label for="sound-enabled-checkbox" class="label-style" style="margin-bottom: 0;">Start with Sound</label>
                    </div>
                    <hr style="border-color: #4b5563;">
                    <div>
                        <label class="label-style">Display Mode</label>
                        <div id="layout-controls" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-top: 0.5rem;">
                            <button data-mode="default" class="btn-secondary layout-btn">Default</button>
                            <button data-mode="wide" class="btn-secondary layout-btn">Wide</button>
                            <button data-mode="fullscreen" class="btn-secondary layout-btn">Fullscreen</button>
                        </div>
                    </div>
                    <div>
                        <label for="youtube-url" class="label-style">YouTube URL</label>
                        <input type="text" id="youtube-url" class="input-field" placeholder="Enter a YouTube URL...">
                        <button id="play-youtube-btn" class="btn-primary" style="margin-top: 0.5rem;">Play</button>
                    </div>
                    <div>
                        <label for="local-video-select" class="label-style">Select Local Video</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <select id="local-video-select" class="input-field"><option value="">-- Select a video --</option>${videoOptions}</select>
                            <button id="play-local-video-btn" class="btn-primary" style="flex-shrink: 0;">Play</button>
                        </div>
                    </div>
                </div>`;
        } else if (zoneName === 'Bottom Ticker') {
             contentHTML = `
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <label class="label-style">Ticker Appearance</label>
                        <div style="display: flex; gap: 2rem; margin-top: 0.5rem;">
                            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                <span style="font-size: 0.75rem; color: #9ca3af;">Background</span>
                                <div style="display: flex; gap: 0.5rem; align-items: center;">
                                    <input type="color" id="ticker-bg-input" value="#BE123C" style="width: 50px; height: 40px; border: none; cursor: pointer;">
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                <span style="font-size: 0.75rem; color: #9ca3af;">Text</span>
                                <div style="display: flex; gap: 0.5rem; align-items: center;">
                                    <input type="color" id="ticker-text-input" value="#FFFFFF" style="width: 50px; height: 40px; border: none; cursor: pointer;">
                                </div>
                            </div>
                            <div style="display: flex; align-items: end;">
                                <button id="update-ticker-style-btn" class="btn-secondary">Apply Colors</button>
                            </div>
                        </div>
                    </div>
                    <hr style="border-color: #4b5563; margin: 0;">
                    <div>
                        <label class="label-style">Option A: Static Image</label>
                        <p style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.5rem;">Display a banner image instead of scrolling text.</p>
                        <div style="display: flex; gap: 0.5rem;">
                            <select id="ticker-image-select" class="input-field"><option value="">-- Select Image --</option>${imageOptions}</select>
                            <button id="set-ticker-image-btn" class="btn-primary" style="flex-shrink: 0;">Set Image</button>
                        </div>
                    </div>
                    <hr style="border-color: #4b5563; margin: 0;">
                    <div>
                        <label class="label-style">Option B: Scrolling Text</label>
                        <div id="ticker-message-list" style="margin: 0.5rem 0; padding: 0.5rem; background-color: #1f2937; border-radius: 0.375rem; min-height: 100px;"></div>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" id="new-ticker-message" class="input-field" placeholder="Add a message...">
                            <button id="add-ticker-msg-btn" class="btn-secondary" style="flex-shrink: 0;">Add</button>
                        </div>
                    </div>
                    <button id="send-queue-btn" class="btn-primary">Send Text Queue</button>
                </div>`;
        } else if (zoneName === 'Side Banner') {
            contentHTML = `
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <label class="label-style">Option A: Promo Video (Muted)</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <select id="banner-video-select" class="input-field"><option value="">-- Select Video --</option>${videoOptions}</select>
                            <button id="play-banner-video-btn" class="btn-primary" style="flex-shrink: 0;">Play Video</button>
                        </div>
                    </div>
                    <hr style="border-color: #4b5563;">
                    <div>
                        <label class="label-style">Option B: Image Carousel</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <select id="image-select" class="input-field"><option value="">-- Select Image --</option>${imageOptions}</select>
                            <button id="add-image-btn" class="btn-secondary" style="flex-shrink: 0;">Add</button>
                        </div>
                        <div id="image-preview-list" style="margin: 0.5rem 0; padding: 0.5rem; background-color: #1f2937; border-radius: 0.375rem; min-height: 100px;"></div>
                    </div>
                    <button id="update-banner-btn" class="btn-primary">Start Carousel</button>
                </div>`;
        } else if (zoneName === 'Spotify') {
             contentHTML = `<div style="display: flex; flex-direction: column; gap: 1rem;">
                    <button id="login-spotify-btn" class="btn-secondary">Login to Spotify</button>
                    <hr style="border-color: #4b5563; margin: 1rem 0;">
                    <p style="font-size: 0.75rem; color: #9ca3af;">Enter a Spotify Track URI</p>
                    <input type="text" id="spotify-uri-input" class="input-field" placeholder="spotify:track:...">
                    <button id="play-spotify-btn" class="btn-primary">Play Track & Mute Video</button>
                    <button id="pause-spotify-btn" class="btn-secondary">Pause Music & Unmute Video</button>
                </div>`;
        }
        
        panelContent.innerHTML = contentHTML;
        if (zoneName === 'Side Banner') renderImagePreview();
        if (zoneName === 'Bottom Ticker') renderTickerPreview();
        panelContainer.classList.remove('hidden');
    }

    async function loadInitialData() {
        const { localIp, config, tickerMessages: savedTickerMessages, bannerImages: savedBannerImages, mainContentState } = await window.electronAPI.getInitialData();
        localIpAddress = localIp;
        tickerMessages = savedTickerMessages || [];
        selectedBannerImages = savedBannerImages || [];
        mediaFolderPath = config.mediaFolder || '';
        if (mediaFolderPath) mediaFiles = await window.electronAPI.getMediaFiles();
    }

    // --- Command Handlers (UPDATED TO USE sendCommand WRAPPER) ---
    
    function handlePlayVideo() {
        const urlInput = document.getElementById('youtube-url');
        const soundEnabled = document.getElementById('sound-enabled-checkbox').checked;
        const url = urlInput.value;
        const playlistId = getYouTubePlaylistId(url);
        let command;
        if (playlistId) {
            command = { target: 'mainZone', contentType: 'youtubePlaylist', content: { playlistId, soundEnabled } };
        } else {
            const videoId = getYouTubeId(url);
            if (videoId) {
                command = { target: 'mainZone', contentType: 'youtube', content: { videoId, soundEnabled } };
            } else { return showNotification('Invalid YouTube URL.', true); }
        }
        sendCommand(command); // Use wrapper
        window.electronAPI.saveMainContent(command);
        showNotification(`Playing YouTube content...`);
    }

    function handlePlayLocalVideo() {
        const select = document.getElementById('local-video-select');
        const soundEnabled = document.getElementById('sound-enabled-checkbox').checked;
        if (select.value) {
            const command = { target: 'mainZone', contentType: 'localVideo', content: { videoUrl: select.value, soundEnabled } };
            sendCommand(command); // Use wrapper
            window.electronAPI.saveMainContent(command);
            showNotification(`Playing: ${select.options[select.selectedIndex].text}`);
        }
    }

    function handlePlayBannerVideo() {
        const select = document.getElementById('banner-video-select');
        if (select && select.value) {
            sendCommand({ 
                target: 'banner', 
                contentType: 'video', 
                content: { videoUrl: select.value } 
            });
            showNotification('Playing video on side banner.');
            closePanelBtn.click();
        }
    }

    function handleSetTickerImage() {
        const select = document.getElementById('ticker-image-select');
        if (select && select.value) {
            sendCommand({ 
                target: 'ticker', 
                contentType: 'image', 
                content: { imageUrl: select.value } 
            });
            showNotification('Ticker set to static image.');
            closePanelBtn.click();
        }
    }

    function handleUpdateTickerStyle() {
        const bgInput = document.getElementById('ticker-bg-input');
        const textInput = document.getElementById('ticker-text-input');
        if (bgInput && textInput) {
            sendCommand({ 
                target: 'style', 
                content: { 
                    section: 'ticker', 
                    backgroundColor: bgInput.value,
                    color: textInput.value 
                } 
            });
            showNotification(`Ticker style updated.`);
        }
    }
    
    function handleUpdateBanner() {
        const command = { target: 'banner', contentType: 'carousel', content: { images: selectedBannerImages } };
        sendCommand(command); // Use wrapper
        showNotification('Side banner has been updated.');
        closePanelBtn.click();
    }
    
    function handleSendTickerQueue() {
        if (tickerMessages.length === 0) return showNotification('Ticker queue is empty.', true);
        const command = { target: 'ticker', contentType: 'text', content: { messages: tickerMessages } };
        sendCommand(command); // Use wrapper
        showNotification('Ticker queue sent to TVs.');
        closePanelBtn.click();
    }
    
    function handleSendSingleTickerMessage(index) {
        const singleMessage = tickerMessages[index];
        if (singleMessage) {
            const command = { target: 'ticker', content: { messages: [singleMessage] } };
            sendCommand(command); // Use wrapper
            showNotification(`Sent message: "${singleMessage}"`);
        }
    }

    async function handlePlaySpotify() {
        const trackUri = document.getElementById('spotify-uri-input').value;
        if (!trackUri) return showNotification('Please enter a Spotify track URI.', true);
        const result = await window.electronAPI.spotifyPlay(trackUri);
        if (result.error) return showNotification(`Spotify Error: ${result.error}`, true);
        const { mainContentState } = await window.electronAPI.getInitialData();
        if (mainContentState) {
            // Mute current video while playing music
            const muteCommand = { target: 'mainZone', contentType: mainContentState.contentType, content: { ...mainContentState.content, soundEnabled: false } };
            sendCommand(muteCommand); // Use wrapper
        }
        showNotification('Playing track on Spotify.');
    }
    
    async function handlePauseSpotify() {
        const result = await window.electronAPI.spotifyPause();
        if (result.error) return showNotification(`Spotify Error: ${result.error}`, true);
        const { mainContentState } = await window.electronAPI.getInitialData();
        if (mainContentState && mainContentState.content.soundEnabled) sendCommand(mainContentState); // Use wrapper
        showNotification('Music paused.');
    }

    // --- Helpers for List Management ---
    function handleAddImageToBanner() {
        const select = document.getElementById('image-select');
        if (select.value && !selectedBannerImages.includes(select.value)) {
            selectedBannerImages.push(select.value);
            renderImagePreview();
            window.electronAPI.saveBannerImages(selectedBannerImages);
        }
    }
    function handleRemoveImage(index) {
        selectedBannerImages.splice(index, 1);
        renderImagePreview();
        window.electronAPI.saveBannerImages(selectedBannerImages);
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
    function handleRemoveTickerMessage(index) {
        tickerMessages.splice(index, 1);
        renderTickerPreview();
        window.electronAPI.saveTickerMessages(tickerMessages);
    }

    // --- Event Listeners ---
    await loadInitialData(); 

    window.electronAPI.onMediaFolderChanged(async () => {
        showNotification('Media folder changed. Refreshing files...');
        await loadInitialData();
        if (!panelContainer.classList.contains('hidden')) {
            const currentZone = panelTitle.textContent.replace('Editing: ', '');
            openEditingPanel(currentZone);
        }
    });

    mainContentControl.addEventListener('click', () => openEditingPanel('Main Content'));
    sideBannerControl.addEventListener('click', () => openEditingPanel('Side Banner'));
    bottomTickerControl.addEventListener('click', () => openEditingPanel('Bottom Ticker'));
    spotifyControl.addEventListener('click', () => openEditingPanel('Spotify'));
    settingsControl.addEventListener('click', () => openEditingPanel('Settings'));
    showPreviewBtn.addEventListener('click', () => window.electronAPI.openPreviewWindow());
    closePanelBtn.addEventListener('click', () => panelContainer.classList.add('hidden'));

    panelContent.addEventListener('click', async (e) => {
        const target = e.target;
        const id = target.id;
        
        if (target.classList.contains('layout-btn')) {
            const mode = target.dataset.mode;
            sendCommand({ target: 'layout', content: { mode: mode } }); // Use wrapper
            showNotification(`Layout changed to ${mode}.`);
        }
        else if (id === 'play-youtube-btn') handlePlayVideo();
        else if (id === 'play-local-video-btn') handlePlayLocalVideo();
        else if (id === 'add-image-btn') handleAddImageToBanner();
        else if (id === 'update-banner-btn') handleUpdateBanner();
        else if (id === 'add-ticker-msg-btn') handleAddTickerMessage();
        else if (id === 'send-queue-btn') handleSendTickerQueue();
        
        else if (id === 'play-banner-video-btn') handlePlayBannerVideo();
        else if (id === 'set-ticker-image-btn') handleSetTickerImage();
        else if (id === 'update-ticker-style-btn') handleUpdateTickerStyle();

        else if (target.classList.contains('remove-btn')) {
            const index = parseInt(target.dataset.index, 10);
            if (target.closest('#image-preview-list')) handleRemoveImage(index);
            if (target.closest('#ticker-message-list')) handleRemoveTickerMessage(index);
        }
        else if (target.classList.contains('send-btn')) {
            const index = parseInt(target.dataset.index, 10);
            handleSendSingleTickerMessage(index);
        }
        else if (id === 'play-spotify-btn') await handlePlaySpotify();
        else if (id === 'pause-spotify-btn') await handlePauseSpotify();
        else if (id === 'login-spotify-btn') {
            const result = await window.electronAPI.spotifyLogin();
            if (result.success) {
                showNotification('Login successful! The app will now reload.');
                setTimeout(() => window.location.reload(), 2000);
            } else {
                showNotification(`Login failed: ${result.error || 'Unknown error'}`, true);
            }
        }
        else if (id === 'select-folder-btn') {
            await window.electronAPI.selectMediaFolder();
        }
    });
}); // End DOMContentLoaded