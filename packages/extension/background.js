const NATIVE_HOST = 'com.dpf.downloader';

let isEnabled = true;
const detectedMediaByTab = new Map();

// Load settings
chrome.storage.local.get(['dpfEnabled'], (result) => {
  if (result.dpfEnabled !== undefined) {
    isEnabled = result.dpfEnabled;
  }
});

// Setup context menu
chrome.runtime.onInstalled.addListener(() => {
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

// 1. Intercept file downloads from browser
chrome.downloads.onCreated.addListener((item) => {
  if (!isEnabled) return;

  chrome.downloads.cancel(item.id, () => {
    chrome.downloads.erase({ id: item.id }, () => {});
  });

  sendDownloadToNativeHost({
    action: 'DOWNLOAD_URL',
    url: item.url,
    filename: item.filename,
    referer: item.referrer || '',
    mime: item.mime || '',
    totalBytes: item.fileSize || 0
  });
});

// 2. Network Sniffer for Video / Audio Streams (HLS, DASH, MP4, WebM, MP3, YouTube streams)
const MEDIA_PATTERNS = [
  /\.(mp4|m4v|mkv|webm|flv|avi|mov|mp3|m4a|aac|wav|ogg)($|\?)/i,
  /\.(m3u8|mpd)($|\?)/i,
  /videoplayback/i,
  /mime=video/i,
  /mime=audio/i,
  /googlevideo\.com\/videoplayback/i
];

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!isEnabled || details.tabId < 0) return;

    let contentType = '';
    let contentLength = 0;

    if (details.responseHeaders) {
      for (const h of details.responseHeaders) {
        const name = h.name.toLowerCase();
        if (name === 'content-type') contentType = (h.value || '').toLowerCase();
        if (name === 'content-length') contentLength = parseInt(h.value || '0', 10);
      }
    }

    const isMediaMime = contentType.startsWith('video/') ||
                         contentType.startsWith('audio/') ||
                         contentType.includes('mpegurl') ||
                         contentType.includes('dash+xml');

    const matchesPattern = MEDIA_PATTERNS.some(p => p.test(details.url));

    if (isMediaMime || matchesPattern) {
      // Don't capture small thumbnails/icons
      if (contentLength > 0 && contentLength < 65536 && !contentType.includes('mpegurl')) {
        return;
      }

      const mediaItem = {
        url: details.url,
        mime: contentType,
        size: contentLength,
        timestamp: Date.now()
      };

      if (!detectedMediaByTab.has(details.tabId)) {
        detectedMediaByTab.set(details.tabId, []);
      }

      const tabList = detectedMediaByTab.get(details.tabId);
      // Avoid duplicates
      if (!tabList.some(m => m.url === details.url)) {
        tabList.push(mediaItem);
        // Notify tab content script to update grabber UI
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
        console.warn('DPF Native Host message note:', chrome.runtime.lastError.message);
      }
    });
  } catch (err) {
    console.error('Failed to communicate with DPF Native Host:', err);
  }
}

// Messages from content script
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
});
