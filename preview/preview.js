document.addEventListener('DOMContentLoaded', () => {
    const previewContainer = document.getElementById('preview-screen');
    const previewMain = document.getElementById('preview-main-content');
    const previewBanner = document.getElementById('preview-side-banner');
    const previewTicker = document.getElementById('preview-bottom-ticker');
    const tickerText = previewTicker.querySelector('.scrolling-text p');
    
    // Apply Default Grid Styles immediately so it looks right on load
    applyGridStyles('default');

    // --- 1. IPC Listener (Instant updates from Controller) ---
    if (window.electronAPI && window.electronAPI.onPreviewCommand) {
        window.electronAPI.onPreviewCommand((command) => {
            console.log("IPC Command:", command);
            updateLocalPreview(command);
        });
    }

    // --- 2. WebSocket Listener (Backup / Legacy) ---
    const SERVER_IP = 'localhost';
    const SERVER_PORT = 8080;

    function connectWebSocket() {
        const ws = new WebSocket(`ws://${SERVER_IP}:${SERVER_PORT}`);
        ws.onopen = () => console.log('Preview window connected via WS.');
        ws.onclose = () => setTimeout(connectWebSocket, 3000);
        ws.onerror = (err) => console.error('Preview WebSocket Error:', err);
        ws.onmessage = (event) => {
            try {
                const command = JSON.parse(event.data);
                updateLocalPreview(command);
            } catch (error) { console.error('Error parsing command:', error); }
        };
    }

    let carouselInterval = null;

function updateLocalPreview(command) {
        if (!command || !command.target) return;
        
        switch(command.target) {
            case 'layout': 
                applyGridStyles(command.content.mode);
                break;

            // --- Handle Style Changes ---
                case 'style':
                    if (command.content.section === 'ticker') {
                        const tickerEl = document.getElementById('preview-bottom-ticker');
                        
                        if (command.content.backgroundColor) {
                            tickerEl.style.background = command.content.backgroundColor;
                        }
                        if (command.content.color) {
                            tickerEl.style.color = command.content.color;
                            // Ensure children inherit color
                            tickerEl.querySelectorAll('*').forEach(el => el.style.color = command.content.color);
                        }
                    }
                    break;

case 'ticker':
                // Clear existing content
                document.getElementById('preview-bottom-ticker').innerHTML = '';
                
                // CASE 1: Image
                if (command.content && command.content.imageUrl) {
                    const img = document.createElement('img');
                    img.src = command.content.imageUrl;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'cover';
                    document.getElementById('preview-bottom-ticker').appendChild(img);
                } 
                // CASE 2: Text
                else if (command.content && command.content.messages) {
                    // Recreate text structure
                    const div = document.createElement('div');
                    div.className = 'scrolling-text';
                    const p = document.createElement('p');
                    p.textContent = command.content.messages.join('   •••   ');
                    div.appendChild(p);
                    document.getElementById('preview-bottom-ticker').appendChild(div);
                }
                break;

            case 'banner':
                if (carouselInterval) clearInterval(carouselInterval);
                previewBanner.innerHTML = '';

            // CASE 1: Video
            if (command.content && command.content.videoUrl) {
                const video = document.createElement('video');
                video.src = command.content.videoUrl;
                video.autoplay = true;
                video.loop = true;
                video.muted = true;
                
                // --- FIX: ABSOLUTE POSITIONING ---
                video.style.position = 'absolute'; // Takes it out of the flow
                video.style.top = '0';
                video.style.left = '0';
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                // ---------------------------------
                
                previewBanner.appendChild(video);
                return;
            }

                // CASE 2: Carousel
                const images = command.content.images;
                if (images && images.length > 0) {
                    // ... (Your existing Carousel code) ...
                     images.forEach((src, index) => {
                        const img = document.createElement('img');
                        img.src = src;
                        if (index === 0) img.classList.add('active');
                        previewBanner.appendChild(img);
                    });

                    if (images.length > 1) {
                        let currentIndex = 0;
                        carouselInterval = setInterval(() => {
                            const allImages = previewBanner.querySelectorAll('img');
                            allImages[currentIndex].classList.remove('active');
                            currentIndex = (currentIndex + 1) % allImages.length;
                            allImages[currentIndex].classList.add('active');
                        }, 5000); 
                    }
                }
                break;

            case 'mainZone':
                previewMain.innerHTML = '';
                if (command.contentType === 'localVideo') {
                    const video = document.createElement('video');
                    video.src = command.content.videoUrl;
                    video.autoplay = true;
                    video.loop = true;
                    video.muted = true; // Auto-play usually requires mute
                    // Basic styling to ensure video fits
                    video.style.width = "100%";
                    video.style.height = "100%";
                    video.style.objectFit = "cover";
                    previewMain.appendChild(video);
} else if (command.contentType === 'youtube' || command.contentType === 'youtubePlaylist') {
                previewMain.innerHTML = ''; // Clear previous content
                
                const iframe = document.createElement('iframe');
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                iframe.allow = "autoplay; encrypted-media; picture-in-picture";
                
                // Use standard domain (Header injection in main.js handles the permission)
                let src = 'https://www.youtube.com/embed/';
                
                if (command.contentType === 'youtubePlaylist') {
                    src += `?listType=playlist&list=${command.content.playlistId}`;
                } else {
                    src += `${command.content.videoId}?playlist=${command.content.videoId}`;
                }
                
                // FIX: Add 'origin' and 'enablejsapi' to match the header spoofing
                src += '&autoplay=1&mute=1&loop=1&controls=0&enablejsapi=1&origin=https://www.youtube.com';
                
                iframe.src = src;
                previewMain.appendChild(iframe);
            }
                break;
        }
    }

// --- Helper to Manually Set Grid Layouts ---
    function applyGridStyles(mode) {
        // Base styles for the container
        previewContainer.style.display = 'grid';
        previewContainer.style.width = '100vw';
        previewContainer.style.height = '100vh';
        previewContainer.style.overflow = 'hidden';

        // --- RESET VISIBILITY (Crucial Step!) ---
        // We must assume everything is visible first, then hide what we don't need.
        previewBanner.style.display = 'block';
        previewTicker.style.display = 'flex'; 

        // --- Lock the Banner Container ---
        previewBanner.style.position = 'relative';
        previewBanner.style.overflow = 'hidden';
        previewBanner.style.width = '100%';
        previewBanner.style.height = '100%';

        if (mode === 'fullscreen') {
            // Hide Banner and Ticker
            previewBanner.style.display = 'none';
            previewTicker.style.display = 'none';
            
            // 1 Column, 1 Row (Full)
            previewContainer.style.gridTemplateColumns = '1fr';
            previewContainer.style.gridTemplateRows = '1fr';
            previewContainer.style.gridTemplateAreas = '"main"';

        } else if (mode === 'wide') {
            // Hide Banner only
            previewBanner.style.display = 'none';
            
            // 1 Column, 2 Rows (Main + Ticker)
            previewContainer.style.gridTemplateColumns = '1fr';
            previewContainer.style.gridTemplateRows = '1fr 120px'; 
            previewContainer.style.gridTemplateAreas = '"main" "ticker"';

        } else {
            // Default: 2 Columns, 2 Rows
            // 480px fixed side, rest is main
            previewContainer.style.gridTemplateColumns = '480px 1fr'; 
            previewContainer.style.gridTemplateRows = '1fr 120px';
            previewContainer.style.gridTemplateAreas = '"side main" "ticker ticker"';
        }
        
        // Map grid areas
        previewBanner.style.gridArea = 'side';
        previewMain.style.gridArea = 'main';
        previewTicker.style.gridArea = 'ticker';
    }

    connectWebSocket();
});