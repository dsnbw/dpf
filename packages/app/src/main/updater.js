const https = require('node:https');
const os = require('node:os');
const { EventEmitter } = require('node:events');

class GitHubAutoUpdater extends EventEmitter {
  constructor(currentVersion = '1.0.1', repo = 'dsnbw/dpf') {
    super();
    this.currentVersion = (currentVersion || '1.0.1').replace(/^v/, '');
    this.repo = repo;
    this.isChecking = false;
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

        const info = {
          hasUpdate: true,
          currentVersion: this.currentVersion,
          latestVersion: latestTag,
          releaseNotes: release.body || 'New performance improvements and bug fixes.',
          releaseUrl: release.html_url,
          downloadUrl: asset ? asset.browser_download_url : release.html_url,
          assetName: asset ? asset.name : null
        };
        this.emit('update-available', info);
        return info;
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
      return assets.find(a => a.name.endsWith('.exe') || a.name.endsWith('.msi')) ||
             assets.find(a => a.name.includes('win') && a.name.endsWith('.zip'));
    }
    if (platform === 'darwin') {
      return assets.find(a => a.name.endsWith('.dmg')) ||
             assets.find(a => a.name.includes('mac') && a.name.endsWith('.zip'));
    }
    // Linux
    return assets.find(a => a.name.endsWith('.AppImage')) ||
           assets.find(a => a.name.endsWith('.deb')) ||
           assets.find(a => a.name.endsWith('.tar.gz'));
  }
}

module.exports = { GitHubAutoUpdater };
