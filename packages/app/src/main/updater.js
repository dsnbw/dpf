const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

class GitHubAutoUpdater extends EventEmitter {
  constructor(currentVersion = '1.0.4', repo = 'dsnbw/dpf') {
    super();
    this.currentVersion = (currentVersion || '1.0.4').replace(/^v/, '');
    this.repo = repo;
    this.isChecking = false;
    this.isDownloading = false;
    this.downloadedInstallerPath = null;
    this.updateInfo = null;
  }

  /**
   * Checks GitHub Releases for a newer version
   */
  async checkForUpdates() {
    if (this.isChecking) {
      return { isChecking: true };
    }
    this.isChecking = true;
    this.emit('checking-for-update');

    try {
      const release = await this._fetchLatestRelease();
      const latestTag = (release.tag_name || '').replace(/^v/, '');

      if (this._isNewerVersion(latestTag, this.currentVersion)) {
        const platform = os.platform();
        const asset = this._findPlatformAsset(release.assets || [], platform);

        this.updateInfo = {
          hasUpdate: true,
          currentVersion: this.currentVersion,
          latestVersion: latestTag,
          releaseNotes: release.body || 'New performance improvements and bug fixes.',
          releaseUrl: release.html_url,
          downloadUrl: asset ? asset.browser_download_url : release.html_url,
          assetName: asset ? asset.name : null,
          assetSize: asset ? asset.size : 0
        };

        this.emit('update-available', this.updateInfo);
        return this.updateInfo;
      } else {
        const info = {
          hasUpdate: false,
          currentVersion: this.currentVersion,
          latestVersion: latestTag || this.currentVersion
        };
        this.emit('update-not-available', info);
        return info;
      }
    } catch (err) {
      this.emit('error', err);
      return { hasUpdate: false, error: err.message, currentVersion: this.currentVersion };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Downloads the update installer in the background with progress reporting
   */
  downloadUpdate(progressCallback) {
    if (this.isDownloading) {
      return Promise.reject(new Error('Update download already in progress.'));
    }
    if (!this.updateInfo || !this.updateInfo.downloadUrl) {
      return Promise.reject(new Error('No update available to download. Please check for updates first.'));
    }

    this.isDownloading = true;
    const downloadUrl = this.updateInfo.downloadUrl;
    const filename = this.updateInfo.assetName || `dpf-update-${this.updateInfo.latestVersion}.exe`;
    const targetPath = path.join(os.tmpdir(), filename);

    return new Promise((resolve, reject) => {
      const downloadFile = (url, redirectCount = 0) => {
        if (redirectCount > 8) {
          this.isDownloading = false;
          return reject(new Error('Too many redirects while downloading update.'));
        }

        const client = url.startsWith('https:') ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': `DPF-Updater/${this.currentVersion}` } }, (res) => {
          // Handle HTTP redirects (GitHub Releases redirect to objects.githubusercontent.com)
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            return downloadFile(res.headers.location, redirectCount + 1);
          }

          if (res.statusCode !== 200) {
            this.isDownloading = false;
            return reject(new Error(`Failed to download update file: HTTP ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10) || this.updateInfo.assetSize || 0;
          let transferredBytes = 0;
          let lastTime = Date.now();
          let lastTransferred = 0;
          let currentSpeed = 0;

          const fileStream = fs.createWriteStream(targetPath);

          res.on('data', (chunk) => {
            transferredBytes += chunk.length;
            const now = Date.now();
            if (now - lastTime >= 500) {
              const deltaBytes = transferredBytes - lastTransferred;
              const deltaTime = (now - lastTime) / 1000;
              currentSpeed = deltaBytes / deltaTime;
              lastTime = now;
              lastTransferred = transferredBytes;

              const percent = totalBytes > 0 ? (transferredBytes / totalBytes) * 100 : 0;
              const progressData = {
                percent: Math.min(100, percent),
                transferred: transferredBytes,
                total: totalBytes,
                speed: currentSpeed
              };

              this.emit('download-progress', progressData);
              if (typeof progressCallback === 'function') {
                progressCallback(progressData);
              }
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => {
              this.isDownloading = false;
              this.downloadedInstallerPath = targetPath;
              const result = {
                installerPath: targetPath,
                version: this.updateInfo.latestVersion,
                totalBytes: transferredBytes
              };
              this.emit('update-downloaded', result);
              resolve(result);
            });
          });

          fileStream.on('error', (err) => {
            fs.unlink(targetPath, () => {});
            this.isDownloading = false;
            reject(err);
          });
        });

        req.on('error', (err) => {
          this.isDownloading = false;
          reject(err);
        });

        req.setTimeout(60000, () => {
          req.destroy(new Error('Connection timed out while downloading update.'));
        });
      };

      downloadFile(downloadUrl);
    });
  }

  /**
   * Silently executes the downloaded installer and restarts the application
   */
  quitAndInstallSilent() {
    if (!this.downloadedInstallerPath || !fs.existsSync(this.downloadedInstallerPath)) {
      throw new Error('Downloaded installer file not found. Please download the update first.');
    }

    const platform = os.platform();
    const installerPath = this.downloadedInstallerPath;

    if (platform === 'win32') {
      // NSIS silent install flag is /S (case-sensitive)
      // /S runs completely silently, updates the installation, and quits
      const child = spawn(installerPath, ['/S'], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();

      // Gracefully exit Electron app
      const { app } = require('electron');
      app.quit();
      setTimeout(() => process.exit(0), 1000);
      return { success: true, mode: 'silent' };
    } else if (platform === 'darwin') {
      // macOS: Open DMG installer
      spawn('open', [installerPath], { detached: true, stdio: 'ignore' }).unref();
      const { app } = require('electron');
      app.quit();
      return { success: true, mode: 'open' };
    } else {
      // Linux: Make executable and launch or open
      fs.chmodSync(installerPath, 0o755);
      spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref();
      const { app } = require('electron');
      app.quit();
      return { success: true, mode: 'exec' };
    }
  }

  _fetchLatestRelease() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.repo}/releases/latest`,
        headers: {
          'User-Agent': `DPF-Updater/${this.currentVersion}`
        }
      };

      const req = https.get(options, (res) => {
        if (res.statusCode === 404) {
          resolve({ tag_name: this.currentVersion, body: 'No releases published yet.' });
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API returned HTTP ${res.statusCode}`));
          return;
        }

        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(12000, () => {
        req.destroy(new Error('Update check request timed out after 12s'));
      });
    });
  }

  _isNewerVersion(latest, current) {
    if (!latest) return false;
    const lParts = latest.split('.').map(n => parseInt(n, 10) || 0);
    const cParts = current.split('.').map(n => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
      const l = lParts[i] || 0;
      const c = cParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  _findPlatformAsset(assets, platform) {
    if (platform === 'win32') {
      // Prefer Setup.exe for silent installation capability
      return assets.find(a => a.name.includes('Setup') && a.name.endsWith('.exe')) ||
             assets.find(a => a.name.endsWith('.exe')) ||
             assets.find(a => a.name.includes('win') && a.name.endsWith('.zip'));
    }
    if (platform === 'darwin') {
      return assets.find(a => a.name.endsWith('.dmg')) ||
             assets.find(a => a.name.includes('mac') && a.name.endsWith('.zip'));
    }
    return assets.find(a => a.name.endsWith('.AppImage')) ||
           assets.find(a => a.name.endsWith('.deb')) ||
           assets.find(a => a.name.endsWith('.tar.gz'));
  }
}

module.exports = { GitHubAutoUpdater };
