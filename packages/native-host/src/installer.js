const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

class HostInstaller {
  /**
   * Registers the DPF Native Messaging Host into browser registries and config directories.
   * @param {string} hostExecutablePath 
   * @param {string[]} allowedExtensionIds 
   */
  static register(hostExecutablePath, allowedExtensionIds = []) {
    const platform = os.platform();
    const manifestDir = path.join(os.homedir(), '.dpf', 'native-host');
    if (!fs.existsSync(manifestDir)) {
      fs.mkdirSync(manifestDir, { recursive: true });
    }

    const hostScriptPath = hostExecutablePath || path.resolve(__dirname, 'host.js');

    // Create launcher wrapper script (runs host via electron --run-as-node or node)
    let launcherPath = hostScriptPath;
    if (platform === 'win32') {
      launcherPath = path.join(manifestDir, 'dpf-native-host.bat');
      const nodeExe = process.execPath;
      const batContent = `@echo off\r\n"${nodeExe}" "${hostScriptPath}" %*\r\n`;
      fs.writeFileSync(launcherPath, batContent, 'utf-8');
    } else {
      launcherPath = path.join(manifestDir, 'dpf-native-host.sh');
      const shContent = `#!/bin/sh\n"${process.execPath}" "${hostScriptPath}" "$@"\n`;
      fs.writeFileSync(launcherPath, shContent, { mode: 0o755 });
    }

    // Chrome/Chromium manifest
    const chromeOrigins = [
      'chrome-extension://*/',
      ...allowedExtensionIds.map(id => `chrome-extension://${id}/`)
    ];

    const chromeManifest = {
      name: 'com.dpf.downloader',
      description: 'Downloader Pro Free Helper',
      path: launcherPath,
      type: 'stdio',
      allowed_origins: chromeOrigins
    };

    const chromeManifestPath = path.join(manifestDir, 'com.dpf.downloader.json');
    fs.writeFileSync(chromeManifestPath, JSON.stringify(chromeManifest, null, 2), 'utf-8');

    // Firefox manifest
    const firefoxManifest = {
      name: 'com.dpf.downloader',
      description: 'Downloader Pro Free Helper',
      path: launcherPath,
      type: 'stdio',
      allowed_extensions: ['dpf-extension@dsnbw.github.io']
    };
    const firefoxManifestPath = path.join(manifestDir, 'com.dpf.downloader-firefox.json');
    fs.writeFileSync(firefoxManifestPath, JSON.stringify(firefoxManifest, null, 2), 'utf-8');

    const registered = [];

    if (platform === 'win32') {
      const regKeys = [
        'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.dpf.downloader',
        'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.dpf.downloader',
        'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.dpf.downloader',
        'HKCU\\Software\\Mozilla\\NativeMessagingHosts\\com.dpf.downloader'
      ];

      for (const key of regKeys) {
        try {
          const isFirefox = key.includes('Mozilla');
          const targetPath = isFirefox ? firefoxManifestPath : chromeManifestPath;
          execSync(`reg add "${key}" /ve /t REG_SZ /d "${targetPath}" /f`, { stdio: 'ignore' });
          registered.push(key);
        } catch (e) {
          // Registry entry failed
        }
      }
    } else if (platform === 'darwin') {
      const macTargets = [
        path.join(os.homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.dpf.downloader.json'),
        path.join(os.homedir(), 'Library/Application Support/Mozilla/NativeMessagingHosts/com.dpf.downloader.json')
      ];
      for (const target of macTargets) {
        try {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          const isFirefox = target.includes('Mozilla');
          fs.copyFileSync(isFirefox ? firefoxManifestPath : chromeManifestPath, target);
          registered.push(target);
        } catch (e) {}
      }
    } else {
      // Linux
      const linuxTargets = [
        path.join(os.homedir(), '.config/google-chrome/NativeMessagingHosts/com.dpf.downloader.json'),
        path.join(os.homedir(), '.config/chromium/NativeMessagingHosts/com.dpf.downloader.json'),
        path.join(os.homedir(), '.mozilla/native-messaging-hosts/com.dpf.downloader.json')
      ];
      for (const target of linuxTargets) {
        try {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          const isFirefox = target.includes('mozilla');
          fs.copyFileSync(isFirefox ? firefoxManifestPath : chromeManifestPath, target);
          registered.push(target);
        } catch (e) {}
      }
    }

    return { success: true, registered };
  }
}

module.exports = { HostInstaller };
