// --- Global Scope ---
let ytPlayer;
let spotifyPlayer;
let isYouTubeApiReady = false;
let commandQueue = [];

// 1. IP Rewrite Helper
function getCorrectedUrl(originalUrl) {
    const serverIp = localStorage.getItem('GMS_SERVER_IP');
    if (!originalUrl || !serverIp) return originalUrl;
    try {
        const urlObj = new URL(originalUrl);
        urlObj.hostname = serverIp;
        return urlObj.href;
    } catch (e) {
        console.warn("URL Rewrite failed:", e);
        return originalUrl;
    }
}

window.onYouTubeIframeAPIReady = function() {
    console.log("YouTube API is Ready.");
    isYouTubeApiReady = true;
    while(commandQueue.length > 0) {
        handleTizenCommand(commandQueue.shift());
    }
};

window.onSpotifyWebPlaybackSDKReady = () => {
    console.log("✅ Spotify Web Playback SDK is ready.");
};

function handleTizenCommand(command) {
    const mainContent = document.getElementById('main-content');
    const sideBanner = document.getElementById('side-banner');
    const bottomTicker = document.getElementById('bottom-ticker');
    const bottomTickerText = document.querySelector('#bottom-ticker .scrolling-text p');

    console.log("Received Command:", command);

    switch (command.target) {
        case 'ticker': 
            updateTicker(command.content, bottomTickerText); 
            break;
        case 'banner': 
            updateBanner(command.content, sideBanner); 
            break;
        case 'mainZone': 
            updateMainContent(command.contentType, command.content, mainContent); 
            break;
        case 'spotify': 
            initializeSpotifyPlayer(command.content); 
            break;
        case 'layout': 
            updateLayout(command.content); 
            break;
        case 'style':
            if (command.content.section === 'ticker') {
                if (command.content.backgroundColor) {
                    bottomTicker.style.background = command.content.backgroundColor;
                }
                if (command.content.color) {
                    bottomTicker.style.color = command.content.color;
                    const textElements = bottomTicker.querySelectorAll('p, span, div');
                    textElements.forEach(el => el.style.color = command.content.color);
                }
            }
            break;
        default: 
            console.warn("Unknown command target:", command.target);
    }
}

window.onload = function () {
    console.log("Tizen App DOM Loaded.");

    const setupScreen = document.getElementById('setup-screen');
    const startScreen = document.getElementById('start-screen');
    const mainContainer = document.querySelector('.container');
    const ipInput = document.getElementById('ip-input');
    const nameInput = document.getElementById('name-input');
    const saveButton = document.getElementById('save-button');
    const startButton = document.getElementById('start-button');
    const setupMessage = document.getElementById('setup-message');
    const tickerZone = document.getElementById('bottom-ticker');
    
    const SERVER_PORT = 8080;
    
    let serverIp = localStorage.getItem('GMS_SERVER_IP') || null;
    let tvName = localStorage.getItem('GMS_TV_NAME') || `TV-${Math.floor(Math.random() * 1000)}`; 
    let setupComplete = localStorage.getItem('GMS_SETUP_COMPLETE') === 'true';

    tickerZone.addEventListener('click', () => {
        if(confirm("Reset App Connection Settings?")) {
            localStorage.clear();
            location.reload();
        }
    });

    if (setupComplete && serverIp) {
        startScreen.style.display = 'flex';
    } else {
        setupScreen.style.display = 'flex';
        ipInput.value = serverIp || '';
        nameInput.value = tvName.startsWith('TV-') ? '' : tvName;
    }

    saveButton.addEventListener('click', () => {
        const newIp = ipInput.value.trim();
        const newName = nameInput.value.trim();
        if (newIp && newName) {
            localStorage.setItem('GMS_SERVER_IP', newIp);
            localStorage.setItem('GMS_TV_NAME', newName);
            localStorage.setItem('GMS_SETUP_COMPLETE', 'true');
            serverIp = newIp;
            tvName = newName;
            setupScreen.style.display = 'none';
            startScreen.style.display = 'flex';
        } else {
            setupMessage.textContent = "IP and TV Name are required.";
            setupMessage.style.color = "#f87171"; 
        }
    });

    startButton.addEventListener('click', () => {
        startScreen.style.display = 'none';
        mainContainer.style.display = 'grid';
        connectWebSocket();
    });

    function connectWebSocket() {
        console.log(`Attempting to connect to ws://${serverIp}:${SERVER_PORT}`);
        const ws = new WebSocket(`ws://${serverIp}:${SERVER_PORT}`);
        
        ws.onopen = () => {
            console.log("🔌 WebSocket connection established.");
            
            const tickerText = document.querySelector('#bottom-ticker .scrolling-text p');
            if(tickerText) tickerText.textContent = "Gaelenix Connected";

            const handshake = { type: 'register', name: tvName, platform: 'Tizen' };
            ws.send(JSON.stringify(handshake));
        };
        
        ws.onclose = () => {
            mainContainer.style.display = 'none';
            setupMessage.textContent = `Connection lost to ${serverIp}. Click here to reset.`;
            setupMessage.onclick = () => location.reload();
            setupScreen.style.display = 'flex';
        };
        
        ws.onerror = (err) => console.error('WebSocket Error: ', err);
        
        ws.onmessage = (event) => {
            try {
                const command = JSON.parse(event.data);
                if (command.targetId && command.targetId !== 'ALL' && command.targetId !== tvName) {
                    console.log(`Ignoring command for ${command.targetId}`);
                    return; 
                }
                if ((command.target === 'mainZone' && (command.contentType === 'youtube' || command.contentType === 'youtubePlaylist')) && !isYouTubeApiReady) {
                    commandQueue.push(command);
                } else {
                    handleTizenCommand(command);
                }
            } catch (e) { console.error("Failed to handle command:", e); }
        };
    }
};

function updateMainContent(type, content, mainContentElement) {
    if (ytPlayer && typeof ytPlayer.destroy === 'function') {
        ytPlayer.destroy();
        ytPlayer = null;
    }
    mainContentElement.innerHTML = '';

    if (type === 'youtube' || type === 'youtubePlaylist') {
        // Standard DIV container
        mainContentElement.innerHTML = '<div id="youtube-player" style="width:100%; height:100%;"></div>';
        
        let playerVars = { 
            autoplay: 1, 
            controls: 0, 
            loop: 1, 
            mute: content.soundEnabled ? 0 : 1,
            rel: 0,
            origin: 'https://www.youtube.com',
            
            // --- FIX: THIS PREVENTS THE CRASH ON EMULATOR ---
            wmode: 'transparent' 
            // ------------------------------------------------
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
            host: 'https://www.youtube-nocookie.com',
            playerVars: playerVars,
            events: {
                'onReady': (event) => event.target.playVideo(),
                'onError': (e) => console.error("YouTube Error:", e.data)
            }
        });

    } else if (type === 'localVideo') {
        const correctedUrl = getCorrectedUrl(content.videoUrl);
        mainContentElement.innerHTML = `
            <video id="local-player" width="100%" height="100%"
                   src="${correctedUrl}" 
                   autoplay loop playsinline
                   ${content.soundEnabled ? '' : 'muted'}>
            </video>`;
        
        setTimeout(() => {
            const video = document.getElementById('local-player');
            if(video) video.play().catch(e => console.log("Autoplay blocked:", e));
        }, 500);
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
    void container.offsetHeight; 
}

function updateTicker(content, tickerElement) {
    const bottomTicker = document.getElementById('bottom-ticker');
    bottomTicker.innerHTML = '';

    if (content.imageUrl) {
        const correctedUrl = getCorrectedUrl(content.imageUrl);
        bottomTicker.innerHTML = `<img src="${correctedUrl}" style="width: 100%; height: 100%; object-fit: contain;">`;
    } 
    else if (content.messages && Array.isArray(content.messages)) {
        const wrapper = document.createElement('div');
        wrapper.className = 'scrolling-text';
        const p = document.createElement('p');
        p.textContent = content.messages.join('   •••   ');
        wrapper.appendChild(p);
        bottomTicker.appendChild(wrapper);
    }
}

let carouselInterval = null;

function updateBanner(content, bannerElement) {
    if (carouselInterval) clearInterval(carouselInterval);
    bannerElement.innerHTML = ''; 
    
    bannerElement.style.position = 'relative';
    bannerElement.style.overflow = 'hidden';
    bannerElement.style.width = '100%';
    bannerElement.style.height = '100%';
    
    if (content.videoUrl) {
         const correctedUrl = getCorrectedUrl(content.videoUrl);
         bannerElement.innerHTML = `
            <video src="${correctedUrl}" 
                   autoplay loop muted playsinline 
                   style="width: 100%; height: 100%; object-fit: contain; position: absolute; top: 0; left: 0;">
            </video>`;
         
         setTimeout(() => {
             const v = bannerElement.querySelector('video');
             if(v) v.play().catch(e => console.log("Banner autoplay blocked", e));
         }, 500);
         return;
    }

    const images = content.images;
    if (!images || images.length === 0) {
        bannerElement.innerHTML = '<img src="https://placehold.co/480x810/1F2937/FFFFFF?text=Side+Banner" alt="Promotional Banner" class="active">';
        return;
    }

    images.forEach((src, index) => {
        const img = document.createElement('img');
        img.src = getCorrectedUrl(src); 
        img.alt = "Promotional Banner";
        img.style.objectFit = "cover"; 
        if (index === 0) img.classList.add('active');
        bannerElement.appendChild(img);
    });

    if (images.length > 1) {
        let currentIndex = 0;
        carouselInterval = setInterval(() => {
            const allImages = bannerElement.querySelectorAll('img');
            if (allImages.length > 0) {
                allImages[currentIndex].classList.remove('active');
                currentIndex = (currentIndex + 1) % allImages.length;
                allImages[currentIndex].classList.add('active');
            }
        }, 5000); 
    }
}