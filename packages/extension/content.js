(function () {
  'use strict';

  // Floating Grabber Button Injector
  function attachGrabberToMedia(mediaElement) {
    if (mediaElement.__dpf_attached) return;
    mediaElement.__dpf_attached = true;

    const container = document.createElement('div');
    container.className = 'dpf-grabber-widget';
    container.innerHTML = `
      <div class="dpf-grabber-button">
        <svg class="dpf-grabber-icon" viewBox="0 0 24 24" width="14" height="14" fill="white">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
        </svg>
        <span>Download this video</span>
      </div>
    `;

    document.body.appendChild(container);

    function updatePosition() {
      const rect = mediaElement.getBoundingClientRect();
      if (rect.width > 120 && rect.height > 80 && rect.top < window.innerHeight && rect.bottom > 0) {
        container.style.display = 'block';
        container.style.top = `${window.scrollY + rect.top + 8}px`;
        container.style.left = `${window.scrollX + rect.right - 180}px`;
      } else {
        container.style.display = 'none';
      }
    }

    // Hover & position listeners
    mediaElement.addEventListener('mouseenter', updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    container.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const mediaUrl = mediaElement.currentSrc || mediaElement.src;
      if (mediaUrl) {
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_MEDIA',
          url: mediaUrl,
          filename: document.title ? `${document.title.replace(/[\\/:*?"<>|]/g, '_')}.mp4` : 'video.mp4'
        });
      }
    });

    // Check periodically if media element is still in DOM
    const checkInterval = setInterval(() => {
      if (!document.body.contains(mediaElement)) {
        container.remove();
        clearInterval(checkInterval);
      }
    }, 3000);
  }

  // Scan for media elements
  function scanMedia() {
    const videos = document.querySelectorAll('video, audio');
    videos.forEach(attachGrabberToMedia);
  }

  // Observe dynamically loaded video players (e.g., YouTube, TikTok, Facebook)
  const observer = new MutationObserver(() => {
    scanMedia();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanMedia);
  } else {
    scanMedia();
  }

  // Listen for batch download requests
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'GET_ALL_LINKS') {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(href => href.startsWith('http://') || href.startsWith('https://'));
      
      const uniqueLinks = Array.from(new Set(links));
      chrome.runtime.sendMessage({
        action: 'BATCH_DOWNLOAD',
        urls: uniqueLinks
      });
    }
  });
})();
