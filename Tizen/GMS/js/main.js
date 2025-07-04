// --- Global Scope ---
let ytPlayer, spotifyPlayer, isYouTubeApiReady = false, commandQueue = [];

window.onYouTubeIframeAPIReady = function() {
    isYouTubeApiReady = true;
    while(commandQueue.length > 0) handleTizenCommand(commandQueue.shift());
};
window.onSpotifyWebPlaybackSDKReady = () => console.log("✅ Spotify Web Playback SDK is ready.");

function handleTizenCommand(command) {
    const mainContent = document.getElementById('main-content');
    const sideBanner = document.getElementById('side-banner');
    const bottomTickerText = document.querySelector('#bottom-ticker .scrolling-text p');
    switch (command.target) {
        case 'ticker': updateTicker(command.content, bottomTickerText); break;
        case 'banner': updateBanner(command.content, sideBanner); break;
        case 'mainZone': updateMainContent(command.contentType, command.content, mainContent); break;
        case 'spotify': initializeSpotifyPlayer(command.content); break;
        case 'layout': updateLayout(command.content); break;
        default: console.warn("Unknown command target:", command.target);
    }
}

// --- Main Application Logic ---
window.onload = function () {
    console.log("Tizen App DOM Loaded.");

    // --- Element References ---
    const setupScreen = document.getElementById('setup-screen');
    const startScreen = document.getElementById('start-screen');
    const mainContainer = document.querySelector('.container');
    const ipInput = document.getElementById('ip-input');
    const saveButton = document.getElementById('save-button');
    const startButton = document.getElementById('start-button');
    const setupMessage = document.getElementById('setup-message');
    
    // --- Configuration ---
    const SERVER_PORT = 8080;
    let serverIp = localStorage.getItem('GMS_SERVER_IP') || null;
    let setupComplete = localStorage.getItem('GMS_SETUP_COMPLETE') === 'true';

    // --- Core Startup Logic ---
    if (setupComplete && serverIp) {
        // If setup is done, show the normal start screen
        startScreen.style.display = 'flex';
    } else {
        // Otherwise, show the initial setup screen
        setupScreen.style.display = 'flex';
        ipInput.value = serverIp || '';
    }

    // --- Event Listeners ---
    saveButton.addEventListener('click', () => {
        const newIp = ipInput.value.trim();
        if (newIp) {
            localStorage.setItem('GMS_SERVER_IP', newIp);
            localStorage.setItem('GMS_SETUP_COMPLETE', 'true');
            serverIp = newIp;
            setupComplete = true;
            // Hide setup screen and show the start screen
            setupScreen.style.display = 'none';
            startScreen.style.display = 'flex';
        } else {
            setupMessage.textContent = "IP Address cannot be empty.";
            setupMessage.style.color = "#f87171"; // Red
        }
    });

    startButton.addEventListener('click', () => {
        startScreen.style.display = 'none';
        mainContainer.style.display = 'grid';
        connectWebSocket();
    });

    // --- WebSocket Connection ---
    function connectWebSocket() {
        const ws = new WebSocket(`ws://${serverIp}:${SERVER_PORT}`);
        ws.onopen = () => {
            console.log("🔌 WebSocket connection established.");
            ws.send("Tizen TV reporting for duty!");
        };
        ws.onclose = () => {
            // If connection fails after setup, show setup screen again
            mainContainer.style.display = 'none';
            setupMessage.textContent = `Connection failed. Please check IP: ${serverIp}`;
            setupScreen.style.display = 'flex';
        };
        ws.onerror = (err) => console.error('WebSocket Error: ', err.message);
        ws.onmessage = (event) => {
            try {
                const command = JSON.parse(event.data);
                if ((command.target === 'mainZone' && (command.contentType === 'youtube' || command.contentType === 'youtubePlaylist')) && !isYouTubeApiReady) {
                    commandQueue.push(command);
                } else {
                    handleTizenCommand(command);
                }
            } catch (e) {
                console.error("Failed to handle command:", e);
            }
        };
    }
};

// --- Content Update Functions ---
function updateMainContent(type, content, mainContentElement) {
    if (ytPlayer && typeof ytPlayer.destroy === 'function') {
        ytPlayer.destroy();
        ytPlayer = null;
    }
    mainContentElement.innerHTML = '';

    if (type === 'youtube' || type === 'youtubePlaylist') {
        mainContentElement.innerHTML = '<div id="youtube-player"></div>';
        let playerVars = { 
            autoplay: 1, 
            controls: 0, 
            loop: 1, 
            mute: content.soundEnabled ? 0 : 1 
        };
        if (type === 'youtubePlaylist') {
            playerVars.listType = 'playlist';
            playerVars.list = content.playlistId;
        } else {
            playerVars.playlist = content.videoId;
        }
        ytPlayer = new YT.Player('youtube-player', {
            height: '100%',
            width: '100%',
            videoId: (type === 'youtube') ? content.videoId : undefined,
            playerVars: playerVars
        });
    } else if (type === 'localVideo') {
        mainContentElement.innerHTML = `
            <video id="local-player" width="100%" height="100%"
                   src="${content.videoUrl}" autoplay loop 
                   ${content.soundEnabled ? '' : 'muted'}>
            </video>`;
    }
}

function initializeSpotifyPlayer(content) {
    if (spotifyPlayer) spotifyPlayer.disconnect();
    spotifyPlayer = new Spotify.Player({ name: 'Gaelenix Display', getOAuthToken: cb => cb(content.accessToken) });
    spotifyPlayer.addListener('ready', ({ device_id }) => console.log('Spotify Player Ready with Device ID', device_id));
    spotifyPlayer.connect();
}

function updateLayout(content) {
    const container = document.querySelector('.container');
    if (!container) return;
    container.classList.remove('layout-fullscreen', 'layout-wide');
    if (content.mode === 'fullscreen' || content.mode === 'wide') {
        container.classList.add(`layout-${content.mode}`);
    }
}

function updateTicker(content, tickerElement) {
    if (content.messages && Array.isArray(content.messages)) {
        tickerElement.textContent = content.messages.join('   •••   ');
    }
}

let carouselInterval = null;
function updateBanner(content, bannerElement) {
    if (carouselInterval) clearInterval(carouselInterval);
    bannerElement.innerHTML = ''; 
    const images = content.images;
    if (!images || images.length === 0) {
        bannerElement.innerHTML = '<img src="https://placehold.co/480x810/1F2937/FFFFFF?text=Side+Banner" alt="Promotional Banner" class="active">';
        return;
    }
    images.forEach((src, index) => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = "Promotional Banner";
        if (index === 0) img.classList.add('active');
        bannerElement.appendChild(img);
    });
    if (images.length > 1) {
        let currentIndex = 0;
        carouselInterval = setInterval(() => {
            const allImages = bannerElement.querySelectorAll('img');
            allImages[currentIndex].classList.remove('active');
            currentIndex = (currentIndex + 1) % allImages.length;
            allImages[currentIndex].classList.add('active');
        }, 5000); 
    }
}