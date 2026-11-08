const { EventEmitter } = require('node:events');

class ClipboardWatcher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.intervalMs = options.intervalMs || 1000;
    this.readClipboardFn = options.readClipboardFn || (() => '');
    this.lastContent = '';
    this.timer = null;
    this.isEnabled = false;
  }

  start() {
    this.isEnabled = true;
    this.timer = setInterval(() => {
      if (!this.isEnabled) return;
      try {
        const text = (this.readClipboardFn() || '').trim();
        if (text && text !== this.lastContent) {
          this.lastContent = text;
          if (this.isDownloadableUrl(text)) {
            this.emit('url-detected', text);
          }
        }
      } catch (err) {
        // Ignore clipboard lock errors
      }
    }, this.intervalMs);
  }

  stop() {
    this.isEnabled = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isDownloadableUrl(str) {
    if (!str.startsWith('http://') && !str.startsWith('https://') && !str.startsWith('ftp://')) {
      return false;
    }
    // Check if it matches media, file or archive patterns
    const fileExtPattern = /\.(zip|rar|7z|tar|gz|iso|exe|msi|dmg|apk|mp4|mkv|webm|mp3|flac|pdf|docx|xlsx)($|\?)/i;
    return fileExtPattern.test(str);
  }
}

module.exports = { ClipboardWatcher };
