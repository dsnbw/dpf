const NATIVE_HOST = 'com.dpf.downloader';

let isEnabled = true;
let bypassKeyActive = false;

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

// Intercept browser downloads
chrome.downloads.onCreated.addListener((item) => {
  if (!isEnabled || bypassKeyActive) return;

  // Cancel standard browser download
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

function sendDownloadToNativeHost(payload) {
  try {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, payload, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('DPF Native Host error:', chrome.runtime.lastError.message);
      } else {
        console.log('DPF Native Host response:', response);
      }
    });
  } catch (err) {
    console.error('Failed to communicate with DPF Native Host:', err);
  }
}

// Handle messages from content script
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
  } else if (msg.action === 'BATCH_DOWNLOAD') {
    sendDownloadToNativeHost({
      action: 'BATCH_DOWNLOAD',
      urls: msg.urls,
      referer: sender.tab ? sender.tab.url : ''
    });
    sendResponse({ status: 'sent' });
  }
});
