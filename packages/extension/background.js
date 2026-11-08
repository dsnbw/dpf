const NATIVE_HOST = 'com.dpf.downloader';

let isEnabled = true;
const detectedMediaByTab = new Map();

// Known YouTube ITAG mappings
const ITAG_MAP = {
  '18': { resolution: '360p', type: 'video', ext: 'mp4', label: '360p Medium (MP4)' },
  '22': { resolution: '720p', type: 'video', ext: 'mp4', label: '720p HD (MP4)' },
  '137': { resolution: '1080p', type: 'video', ext: 'mp4', label: '1080p Full HD (MP4)' },
  '248': { resolution: '1080p', type: 'video', ext: 'webm', label: '1080p Full HD (WebM)' },
  '136': { resolution: '720p', type: 'video', ext: 'mp4', label: '720p HD (MP4)' },
  '247': { resolution: '720p', type: 'video', ext: 'webm', label: '720p HD (WebM)' },
  '135': { resolution: '480p', type: 'video', ext: 'mp4', label: '480p Standard (MP4)' },
  '244': { resolution: '480p', type: 'video', ext: 'webm', label: '480p Standard (WebM)' },
  '134': { resolution: '360p', type: 'video', ext: 'mp4', label: '360p Medium (MP4)' },
  '133': { resolution: '240p', type: 'video', ext: 'mp4', label: '240p Low (MP4)' },
  '140': { resolution: '128k', type: 'audio', ext: 'm4a', label: '🎵 Audio M4A (128 kbps)' },
  '251': { resolution: '160k', type: 'audio', ext: 'opus', label: '🎵 Audio Opus (160 kbps)' },
  '250': { resolution: '70k', type: 'audio', ext: 'opus', label: '🎵 Audio Opus (70 kbps)' }
};

// Load settings
chrome.storage.local.get(['dpfEnabled'], (result) => {
  if (result.dpfEnabled !== undefined) {
    isEnabled = result.dpfEnabled;
  }
});

// Setup context menu
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: 'dpf-download-link',
      title: 'Download with DPF',
      contexts: ['link', 'image', 'video', 'audio']
    });

    chrome.contextMenus.create({
      id: 'dpf-download-all',
      title: 'Download all links with DPF',
      contexts: ['page']
    });
  } catch (e) {}
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'dpf-download-link') {
    const url = info.linkUrl || info.srcUrl;
    if (url) {
      sendDownloadToNativeHost({
        action: 'DOWNLOAD_URL',
        url: url,
        referer: tab ? tab.url : '',
        title: tab ? tab.title : ''
      });
    }
  } else if (info.menuItemId === 'dpf-download-all') {
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'GET_ALL_LINKS' });
    }
  }
});

// 1. Intercept standard browser downloads (IDM Parity)
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (!isEnabled) return;

  chrome.downloads.cancel(item.id, () => {
    chrome.downloads.erase({ id: item.id }, () => {});
  });

  sendDownloadToNativeHost({
    action: 'DOWNLOAD_URL',
    url: item.finalUrl || item.url,
    filename: item.filename,
    referer: item.referrer || '',
    mime: item.mime || '',
    totalBytes: item.fileSize || 0
  });
});

chrome.downloads.onCreated.addListener((item) => {
  if (!isEnabled) return;

  chrome.downloads.cancel(item.id, () => {
    chrome.downloads.erase({ id: item.id }, () => {});
  });

  sendDownloadToNativeHost({
    action: 'DOWNLOAD_URL',
    url: item.finalUrl || item.url,
    filename: item.filename,
    referer: item.referrer || '',
    mime: item.mime || '',
    totalBytes: item.fileSize || 0
  });
});

// 2. Network Sniffer for Video / Audio Streams & Attachments
const MEDIA_PATTERNS = [
  /\.(mp4|m4v|mkv|webm|flv|avi|mov|mp3|m4a|aac|wav|ogg)($|\?)/i,
  /\.(m3u8|mpd)($|\?)/i,
  /videoplayback/i,
  /mime=video/i,
  /mime=audio/i,
  /googlevideo\.com\/videoplayback/i
];

function parseMediaDetails(url, headers = []) {
  let contentType = '';
  let contentLength = 0;
  let contentDisposition = '';

  for (const h of headers) {
    const name = (h.name || '').toLowerCase();
    if (name === 'content-type') contentType = (h.value || '').toLowerCase();
    if (name === 'content-length') contentLength = parseInt(h.value || '0', 10);
    if (name === 'content-disposition') contentDisposition = h.value || '';
  }

  let label = '';
  let ext = 'mp4';
  let isAudio = false;

  try {
    const parsedUrl = new URL(url);
    if (url.includes('googlevideo.com') || url.includes('videoplayback')) {
      const itag = parsedUrl.searchParams.get('itag');
      const clen = parsedUrl.searchParams.get('clen');
      if (clen && !contentLength) contentLength = parseInt(clen, 10);

      if (itag && ITAG_MAP[itag]) {
        const info = ITAG_MAP[itag];
        label = info.label;
        ext = info.ext;
        isAudio = info.type === 'audio';
      }
    }
  } catch (e) {}

  if (!label) {
    if (contentType.includes('audio') || url.includes('.mp3') || url.includes('.m4a')) {
      label = '🎵 Audio Stream';
      isAudio = true;
      ext = 'mp3';
    } else if (contentType.includes('mpegurl') || url.includes('.m3u8')) {
      label = '📺 HLS Live / Video Stream';
      ext = 'm3u8';
    } else {
      label = '🎬 Video Stream';
      ext = 'mp4';
    }
  }

  return { contentType, contentLength, contentDisposition, label, ext, isAudio };
}

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!isEnabled || details.tabId < 0) return;

    const { contentType, contentLength, contentDisposition, label, ext, isAudio } = parseMediaDetails(
      details.url,
      details.responseHeaders || []
    );

    // If response is an attachment (file download) on navigation, intercept
    if (contentDisposition.toLowerCase().includes('attachment')) {
      let filename = '';
      const fnMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
      if (fnMatch && fnMatch[1]) {
        filename = decodeURIComponent(fnMatch[1].trim());
      }
      sendDownloadToNativeHost({
        action: 'DOWNLOAD_URL',
        url: details.url,
        filename: filename,
        mime: contentType,
        totalBytes: contentLength
      });
      return;
    }

    const isMediaMime = contentType.startsWith('video/') ||
                         contentType.startsWith('audio/') ||
                         contentType.includes('mpegurl') ||
                         contentType.includes('dash+xml');

    const matchesPattern = MEDIA_PATTERNS.some(p => p.test(details.url));

    if (isMediaMime || matchesPattern) {
      if (contentLength > 0 && contentLength < 102400 && !contentType.includes('mpegurl') && !details.url.includes('videoplayback')) {
        return;
      }

      const mediaItem = {
        url: details.url,
        mime: contentType,
        size: contentLength,
        label: label,
        ext: ext,
        isAudio: isAudio,
        timestamp: Date.now()
      };

      if (!detectedMediaByTab.has(details.tabId)) {
        detectedMediaByTab.set(details.tabId, []);
      }

      const tabList = detectedMediaByTab.get(details.tabId);
      if (tabList.length > 50) tabList.shift();

      const isDuplicate = tabList.some(m => {
        if (m.url === details.url) return true;
        if (m.label === label && label && label.includes('p ') && (Date.now() - m.timestamp < 10000)) return true;
        return false;
      });

      if (!isDuplicate) {
        tabList.push(mediaItem);
        chrome.tabs.sendMessage(details.tabId, {
          action: 'MEDIA_DETECTED',
          media: mediaItem,
          totalStreams: tabList.length
        }).catch(() => {});
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

chrome.tabs.onRemoved.addListener((tabId) => {
  detectedMediaByTab.delete(tabId);
});

// Communication with Native Host
function sendDownloadToNativeHost(payload) {
  try {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, payload, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Native Host note:', chrome.runtime.lastError.message);
        // Fallback: If native host fails or DPF desktop app is closed, trigger browser download
        if (payload.action === 'DOWNLOAD_URL' && payload.url) {
          chrome.downloads.download({
            url: payload.url,
            filename: payload.filename || undefined,
            saveAs: true
          });
        }
      }
    });
  } catch (err) {
    console.error('Failed to communicate with DPF Native Host:', err);
    if (payload.action === 'DOWNLOAD_URL' && payload.url) {
      chrome.downloads.download({
        url: payload.url,
        filename: payload.filename || undefined,
        saveAs: true
      });
    }
  }
}

// Messages from content script or popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'DOWNLOAD_MEDIA') {
    sendDownloadToNativeHost({
      action: 'DOWNLOAD_URL',
      url: msg.url,
      filename: msg.filename || '',
      referer: sender.tab ? sender.tab.url : '',
      title: sender.tab ? sender.tab.title : ''
    });
    sendResponse({ status: 'sent' });
  } else if (msg.action === 'GET_TAB_MEDIA') {
    const tabId = sender.tab ? sender.tab.id : -1;
    const media = detectedMediaByTab.get(tabId) || [];
    sendResponse({ media });
  } else if (msg.action === 'BATCH_DOWNLOAD') {
    sendDownloadToNativeHost({
      action: 'BATCH_DOWNLOAD',
      urls: msg.urls,
      referer: sender.tab ? sender.tab.url : ''
    });
    sendResponse({ status: 'sent' });
  }
  return true;
});
