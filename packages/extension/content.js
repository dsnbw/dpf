(function () {
  'use strict';

  // Common file extensions intercepted by download managers (IDM parity)
  const DOWNLOAD_EXTENSIONS = new Set([
    // Compressed / Archives
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'cab', 'tgz', 'tbz2', 'z', 'lz', 'dmg',
    // Executables / Installers
    'exe', 'msi', 'apk', 'pkg', 'deb', 'rpm', 'appimage', 'jar', 'run', 'bin',
    // Audio
    'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus',
    // Video
    'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp',
    // Documents
    'pdf', 'epub', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    // Disk images & torrents
    'torrent', 'img', 'vhd', 'vhdx'
  ]);

  function isDownloadableUrl(url) {
    if (!url || typeof url !== 'string') return { isMatch: false };
    try {
      const parsed = new URL(url, window.location.href);
      if (!['http:', 'https:'].includes(parsed.protocol)) return { isMatch: false };

      // Check pathname
      const pathname = parsed.pathname;
      const dotIndex = pathname.lastIndexOf('.');
      if (dotIndex !== -1) {
        const ext = pathname.substring(dotIndex + 1).toLowerCase();
        if (DOWNLOAD_EXTENSIONS.has(ext)) {
          return { isMatch: true, ext, filename: decodeURIComponent(pathname.substring(pathname.lastIndexOf('/') + 1)) };
        }
      }

      // Check query params (e.g. ?file=archive.zip or ?download=app.exe)
      for (const [, val] of parsed.searchParams.entries()) {
        const pDot = val.lastIndexOf('.');
        if (pDot !== -1) {
          const ext = val.substring(pDot + 1).toLowerCase();
          if (DOWNLOAD_EXTENSIONS.has(ext)) {
            return { isMatch: true, ext, filename: decodeURIComponent(val.substring(val.lastIndexOf('/') + 1)) };
          }
        }
      }
    } catch (e) {}
    return { isMatch: false };
  }

  // 1. Automatic Download Link Interception
  document.addEventListener('click', (e) => {
    // IDM standard: holding Alt key bypasses download interception
    if (e.altKey) return;

    const anchor = e.target.closest('a[href]');
    if (!anchor || !anchor.href) return;

    const href = anchor.href;
    const hasDownloadAttr = anchor.hasAttribute('download');
    const match = isDownloadableUrl(href);

    if (hasDownloadAttr || match.isMatch) {
      e.preventDefault();
      e.stopPropagation();

      let filename = anchor.getAttribute('download') || '';
      if (!filename && match.filename) {
        filename = match.filename;
      }
      if (!filename) {
        try {
          const p = new URL(href).pathname;
          filename = decodeURIComponent(p.substring(p.lastIndexOf('/') + 1));
        } catch (err) {}
      }

      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_MEDIA',
        url: href,
        filename: filename || 'download.bin'
      });
    }
  }, true);

  // 2. Video & Audio Grabber Floating Widget (IDM Parity)
  let detectedStreams = [];
  let currentGrabberElement = null;
  let isClosedByUser = false;

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return ` (${mb.toFixed(1)} MB)`;
    const kb = bytes / 1024;
    return ` (${kb.toFixed(0)} KB)`;
  }

  function getCleanVideoTitle() {
    let title = document.title || 'video';
    title = title.replace(/[\\/:*?"<>|]/g, '_').trim();
    if (title.toLowerCase().endsWith(' - youtube')) {
      title = title.substring(0, title.length - 10).trim();
    }
    return title;
  }

  function triggerDownload(url, extHint = 'mp4', customLabel = '') {
    const title = getCleanVideoTitle();
    let ext = extHint;
    if (url.includes('.mp3') || url.includes('mime=audio') || extHint === 'mp3') {
      ext = 'mp3';
    } else if (url.includes('.m4a')) {
      ext = 'm4a';
    }

    const filename = `${title}.${ext}`;

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_MEDIA',
      url: url,
      filename: filename
    });
  }

  function findVideoPlayer() {
    // YouTube player container
    const ytPlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (ytPlayer && ytPlayer.offsetWidth > 150) {
      return { container: ytPlayer, isYouTube: true };
    }

    // Generic HTML5 video or audio
    const videos = Array.from(document.querySelectorAll('video, audio'));
    for (const v of videos) {
      const rect = v.getBoundingClientRect();
      if ((rect.width > 120 && rect.height > 80) || v.tagName.toLowerCase() === 'audio') {
        const parent = v.parentElement || document.body;
        return { container: parent, videoElement: v, isYouTube: false };
      }
    }

    return null;
  }

  function createOrUpdateGrabber() {
    if (isClosedByUser) return;

    const playerInfo = findVideoPlayer();
    if (!playerInfo) return;

    const { container, isYouTube, videoElement } = playerInfo;

    let bar = container.querySelector('.dpf-idm-grabber-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'dpf-idm-grabber-bar';
      bar.innerHTML = `
        <div class="dpf-grabber-main-btn" title="Download this video with Downloader Pro Free">
          <span class="dpf-play-icon">▶</span>
          <span class="dpf-text">Download this video</span>
          <span class="dpf-count-badge" style="display:none;">0</span>
        </div>
        <button class="dpf-sub-btn dpf-btn-help" title="Downloader Pro Free - Max Speed Downloader">❓</button>
        <button class="dpf-sub-btn dpf-btn-close" title="Hide download bar for this video">✖</button>
        <div class="dpf-dropdown-menu"></div>
      `;

      if (window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }
      container.appendChild(bar);

      const mainBtn = bar.querySelector('.dpf-grabber-main-btn');
      const dropdown = bar.querySelector('.dpf-dropdown-menu');
      const btnHelp = bar.querySelector('.dpf-btn-help');
      const btnClose = bar.querySelector('.dpf-btn-close');

      mainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (detectedStreams.length > 1) {
          dropdown.classList.toggle('dpf-show');
        } else if (detectedStreams.length === 1) {
          triggerDownload(detectedStreams[0].url, detectedStreams[0].ext || 'mp4', detectedStreams[0].label);
        } else {
          let fallbackUrl = '';
          if (videoElement && (videoElement.currentSrc || videoElement.src)) {
            fallbackUrl = videoElement.currentSrc || videoElement.src;
          } else if (isYouTube) {
            fallbackUrl = window.location.href;
          }
          if (fallbackUrl) {
            triggerDownload(fallbackUrl, 'mp4', 'Direct Video Stream');
          }
        }
      });

      btnHelp.addEventListener('click', (e) => {
        e.stopPropagation();
        alert('Downloader Pro Free (DPF) Integration\n- Multi-stream high speed dynamic download\n- Click "Download this video" or choose resolution from dropdown.');
      });

      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        isClosedByUser = true;
        bar.remove();
      });

      document.addEventListener('click', () => {
        dropdown.classList.remove('dpf-show');
      });
    }

    const countBadge = bar.querySelector('.dpf-count-badge');
    const dropdown = bar.querySelector('.dpf-dropdown-menu');

    if (detectedStreams.length > 0) {
      countBadge.style.display = 'inline-block';
      countBadge.innerText = detectedStreams.length;

      dropdown.innerHTML = '';

      detectedStreams.forEach((stream, idx) => {
        const item = document.createElement('div');
        item.className = 'dpf-stream-item';
        const sizeText = formatBytes(stream.size);
        const icon = stream.isAudio ? '🎵' : '🎬';
        const label = stream.label || `${icon} Stream #${idx + 1}`;

        item.innerHTML = `
          <div class="dpf-stream-info">
            <span class="dpf-stream-name">${label}</span>
            <span class="dpf-stream-meta">${sizeText}</span>
          </div>
          <span class="dpf-download-action">Download</span>
        `;

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('dpf-show');
          triggerDownload(stream.url, stream.ext || 'mp4', stream.label);
        });

        dropdown.appendChild(item);
      });

      if (detectedStreams.length > 1) {
        const itemAll = document.createElement('div');
        itemAll.className = 'dpf-stream-item dpf-stream-best';
        itemAll.innerHTML = `
          <div class="dpf-stream-info">
            <span class="dpf-stream-name">⚡ Download Highest Quality</span>
          </div>
        `;
        itemAll.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('dpf-show');
          triggerDownload(detectedStreams[0].url, detectedStreams[0].ext || 'mp4', detectedStreams[0].label);
        });
        dropdown.insertBefore(itemAll, dropdown.firstChild);
      }
    } else {
      countBadge.style.display = 'none';
      dropdown.innerHTML = `
        <div class="dpf-stream-item dpf-stream-best">
          <div class="dpf-stream-info">
            <span class="dpf-stream-name">⚡ Download Current Video</span>
          </div>
        </div>
      `;
      dropdown.querySelector('.dpf-stream-item').addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.remove('dpf-show');
        triggerDownload(window.location.href, 'mp4');
      });
    }

    currentGrabberElement = bar;
  }

  // Listen for media detected from background sniffer
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'MEDIA_DETECTED' && msg.media) {
      if (!detectedStreams.some(s => s.url === msg.media.url)) {
        detectedStreams.push(msg.media);
        createOrUpdateGrabber();
      }
    } else if (msg.action === 'GET_ALL_LINKS') {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => h.startsWith('http://') || h.startsWith('https://'));
      chrome.runtime.sendMessage({
        action: 'BATCH_DOWNLOAD',
        urls: Array.from(new Set(links))
      });
    }
  });

  // Query background for existing streams on this tab
  chrome.runtime.sendMessage({ action: 'GET_TAB_MEDIA' }, (res) => {
    if (res && res.media && Array.isArray(res.media)) {
      detectedStreams = res.media;
      createOrUpdateGrabber();
    }
  });

  // YouTube SPA navigation reset
  window.addEventListener('yt-navigate-finish', () => {
    isClosedByUser = false;
    detectedStreams = [];
    setTimeout(createOrUpdateGrabber, 500);
    setTimeout(createOrUpdateGrabber, 1500);
  });

  window.addEventListener('yt-page-data-updated', () => {
    setTimeout(createOrUpdateGrabber, 500);
  });

  // Check DOM mutations and polling
  const observer = new MutationObserver(() => {
    createOrUpdateGrabber();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(createOrUpdateGrabber, 1200);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createOrUpdateGrabber);
  } else {
    createOrUpdateGrabber();
  }
})();
