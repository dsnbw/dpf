(function () {
  'use strict';

  let detectedMediaStreams = [];
  let floatingWidget = null;

  // Create or get the persistent floating grabber panel
  function getOrCreateWidget() {
    if (floatingWidget && document.body.contains(floatingWidget)) {
      return floatingWidget;
    }

    floatingWidget = document.createElement('div');
    floatingWidget.className = 'dpf-grabber-widget';
    floatingWidget.innerHTML = `
      <div class="dpf-grabber-button" id="dpfGrabberTrigger">
        <svg class="dpf-grabber-icon" viewBox="0 0 24 24" width="16" height="16" fill="white">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
        </svg>
        <span id="dpfGrabberText">Download with DPF</span>
        <span class="dpf-badge" id="dpfStreamCount" style="display:none;">0</span>
      </div>
      <div class="dpf-dropdown-menu" id="dpfDropdownMenu">
        <!-- Media stream items -->
      </div>
    `;

    document.documentElement.appendChild(floatingWidget);

    const trigger = floatingWidget.querySelector('#dpfGrabberTrigger');
    const dropdown = floatingWidget.querySelector('#dpfDropdownMenu');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (detectedMediaStreams.length > 1) {
        dropdown.classList.toggle('dpf-show');
      } else if (detectedMediaStreams.length === 1) {
        triggerDownload(detectedMediaStreams[0].url);
      } else {
        // Fallback: check current video/audio element or page
        const video = document.querySelector('video, audio');
        const url = video && (video.currentSrc || video.src) ? (video.currentSrc || video.src) : window.location.href;
        triggerDownload(url);
      }
    });

    document.addEventListener('click', () => {
      if (dropdown) dropdown.classList.remove('dpf-show');
    });

    return floatingWidget;
  }

  function triggerDownload(targetUrl) {
    let cleanTitle = document.title ? document.title.replace(/[\\/:*?"<>|]/g, '_').trim() : 'media';
    if (cleanTitle.toLowerCase().endsWith(' - youtube')) {
      cleanTitle = cleanTitle.substring(0, cleanTitle.length - 10).trim();
    }

    let ext = '.mp4';
    if (targetUrl.includes('.mp3') || targetUrl.includes('mime=audio') || targetUrl.includes('.m4a')) {
      ext = '.mp3';
    }

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_MEDIA',
      url: targetUrl,
      filename: `${cleanTitle}${ext}`
    });
  }

  function updateWidgetUI() {
    const widget = getOrCreateWidget();
    const countBadge = widget.querySelector('#dpfStreamCount');
    const dropdown = widget.querySelector('#dpfDropdownMenu');
    const grabberText = widget.querySelector('#dpfGrabberText');

    if (detectedMediaStreams.length > 0) {
      widget.classList.add('dpf-active');
      countBadge.style.display = 'inline-block';
      countBadge.innerText = detectedMediaStreams.length;
      grabberText.innerText = 'Download Video / Audio';

      dropdown.innerHTML = '';
      detectedMediaStreams.forEach((m, idx) => {
        const item = document.createElement('div');
        item.className = 'dpf-menu-item';
        const isAudio = m.mime.includes('audio') || m.url.includes('.mp3');
        const label = isAudio ? `🎵 Audio Stream #${idx + 1}` : `🎬 Video Stream #${idx + 1}`;
        item.innerHTML = `<span>${label}</span> <span style="font-size:10px; color:#94a3b8;">${m.size ? (m.size/1024/1024).toFixed(1)+' MB' : 'Direct'}</span>`;

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('dpf-show');
          triggerDownload(m.url);
        });

        dropdown.appendChild(item);
      });
    }

    // Position relative to primary video player if present
    const player = document.querySelector('.html5-video-player, video, audio, #movie_player, .video-player');
    if (player) {
      const rect = player.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 100 && rect.top < window.innerHeight && rect.bottom > 0) {
        widget.style.top = `${Math.max(12, rect.top + window.scrollY + 12)}px`;
        widget.style.right = `${Math.max(12, window.innerWidth - rect.right - window.scrollX + 16)}px`;
        return;
      }
    }

    // Default top-right fixed positioning
    widget.style.top = '16px';
    widget.style.right = '20px';
  }

  // Listen for background sniffer events
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'MEDIA_DETECTED' && msg.media) {
      if (!detectedMediaStreams.some(m => m.url === msg.media.url)) {
        detectedMediaStreams.push(msg.media);
        updateWidgetUI();
      }
    } else if (msg.action === 'GET_ALL_LINKS') {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(href => href.startsWith('http://') || href.startsWith('https://'));
      chrome.runtime.sendMessage({
        action: 'BATCH_DOWNLOAD',
        urls: Array.from(new Set(links))
      });
    }
  });

  // Query background for already detected media on this tab
  chrome.runtime.sendMessage({ action: 'GET_TAB_MEDIA' }, (res) => {
    if (res && res.media && res.media.length > 0) {
      detectedMediaStreams = res.media;
      updateWidgetUI();
    }
  });

  // DOM scan for HTML5 video/audio elements
  function checkMediaElements() {
    const media = document.querySelectorAll('video, audio');
    if (media.length > 0) {
      let found = false;
      media.forEach(el => {
        const src = el.currentSrc || el.src;
        if (src && !src.startsWith('blob:') && !detectedMediaStreams.some(m => m.url === src)) {
          detectedMediaStreams.push({ url: src, mime: el.tagName.toLowerCase() === 'audio' ? 'audio/mpeg' : 'video/mp4' });
          found = true;
        }
      });
      // Always show widget if video/audio is on page
      getOrCreateWidget().classList.add('dpf-active');
      updateWidgetUI();
    }
  }

  // Periodic check & mutation observer
  setInterval(checkMediaElements, 2500);
  const observer = new MutationObserver(() => checkMediaElements());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkMediaElements);
  } else {
    checkMediaElements();
  }
})();
