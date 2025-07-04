document.addEventListener('DOMContentLoaded', () => {
    const previewMain = document.getElementById('preview-main-content');
    const previewBanner = document.getElementById('preview-side-banner');
    const previewTicker = document.querySelector('#preview-bottom-ticker .scrolling-text p');
    
    const SERVER_IP = 'localhost';
    const SERVER_PORT = 8080;

    function connectWebSocket() {
        const ws = new WebSocket(`ws://${SERVER_IP}:${SERVER_PORT}`);
        ws.onopen = () => console.log('Preview window connected.');
        ws.onclose = () => setTimeout(connectWebSocket, 3000);
        ws.onerror = (err) => console.error('Preview WebSocket Error:', err);
        ws.onmessage = (event) => {
            try {
                const command = JSON.parse(event.data);
                updateLocalPreview(command);
            } catch (error) {
                console.error('Error parsing command in preview window:', error);
            }
        };
    }

    let carouselInterval = null; // Variable to hold the carousel timer

    function updateLocalPreview(command) {
        if (!command || !command.target) return;
        switch(command.target) {
            case 'ticker':
                if (command.content && command.content.messages) {
                    previewTicker.textContent = command.content.messages.join('   •••   ');
                }
                break;
            case 'banner':
                // Clear any existing carousel timer
                if (carouselInterval) clearInterval(carouselInterval);
                previewBanner.innerHTML = '';
                
                const images = command.content.images;
                if (images && images.length > 0) {
                    // Create all image elements and add them to the banner
                    images.forEach((src, index) => {
                        const img = document.createElement('img');
                        img.src = src;
                        if (index === 0) img.classList.add('active'); // Start with the first image visible
                        previewBanner.appendChild(img);
                    });

                    // If there's more than one image, start the carousel
                    if (images.length > 1) {
                        let currentIndex = 0;
                        carouselInterval = setInterval(() => {
                            const allImages = previewBanner.querySelectorAll('img');
                            allImages[currentIndex].classList.remove('active');
                            currentIndex = (currentIndex + 1) % allImages.length;
                            allImages[currentIndex].classList.add('active');
                        }, 5000); // Change image every 5 seconds
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
                    video.muted = true;
                    previewMain.appendChild(video);
                } else if (command.contentType === 'youtube' || command.contentType === 'youtubePlaylist') {
                    previewMain.innerHTML = `<div class="placeholder-text">YouTube Preview</div>`;
                }
                break;
        }
    }

    connectWebSocket();
});