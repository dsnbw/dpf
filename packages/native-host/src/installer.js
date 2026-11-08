const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const EXTENSION_ID = 'gpplglnoeigamjdeljfbgkkpikmmjjao';
const EXTENSION_VERSION = '1.0.3';

class HostInstaller {
  /**
   * Detects all installed browsers on the host system.
   */
  static detectBrowsers() {
    const platform = os.platform();
    const browsers = [];

    if (platform === 'win32') {
      const candidates = [
        {
          name: 'Google Chrome',
          paths: [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
          ],
          regKey: 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.dpf.downloader',
          extKey: `HKCU\\Software\\Google\\Chrome\\Extensions\\${EXTENSION_ID}`
        },
        {
          name: 'Microsoft Edge',
          paths: [
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
          ],
          regKey: 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.dpf.downloader',
          extKey: `HKCU\\Software\\Microsoft\\Edge\\Extensions\\${EXTENSION_ID}`
        },
        {
          name: 'Brave Browser',
          paths: [
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')
          ],
          regKey: 'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.dpf.downloader',
          extKey: `HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions\\${EXTENSION_ID}`
        },
        {
          name: 'Mozilla Firefox',
          paths: [
            'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
            'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'
          ],
          regKey: 'HKCU\\Software\\Mozilla\\NativeMessagingHosts\\com.dpf.downloader',
          extKey: 'HKCU\\Software\\Mozilla\\Firefox\\Extensions'
        },
        {
          name: 'Opera',
          paths: [
            path.join(process.env.LOCALAPPDATA || '', 'Programs\\Opera\\opera.exe'),
            'C:\\Program Files\\Opera\\opera.exe'
          ],
          regKey: 'HKCU\\Software\\Opera Software\\Opera Stable\\NativeMessagingHosts\\com.dpf.downloader',
          extKey: null
        }
      ];

      for (const item of candidates) {
        for (const exePath of item.paths) {
          if (exePath && fs.existsSync(exePath)) {
            browsers.push({
              name: item.name,
              executablePath: exePath,
              regKey: item.regKey,
              extKey: item.extKey
            });
            break;
          }
        }
      }
    }

    return browsers;
  }

  /**
   * Registers the DPF Native Messaging Host and Extension CRX into browser registries.
   * @param {string} [hostExecutablePath] 
   * @param {string[]} [allowedExtensionIds] 
   */
  static register(hostExecutablePath, allowedExtensionIds = []) {
    const platform = os.platform();
    const manifestDir = path.join(os.homedir(), '.dpf', 'native-host');
    const homeExtDir = path.join(os.homedir(), '.dpf', 'extension');
    const crxPath = path.join(homeExtDir, 'dpf-extension.crx');

    if (!fs.existsSync(manifestDir)) {
      fs.mkdirSync(manifestDir, { recursive: true });
    }

    // Deploy host.js and protocol.js into manifestDir so they are standalone outside asar
    const srcHost = path.resolve(__dirname, 'host.js');
    const srcProtocol = path.resolve(__dirname, 'protocol.js');
    const targetHost = path.join(manifestDir, 'host.js');
    const targetProtocol = path.join(manifestDir, 'protocol.js');

    try {
      fs.copyFileSync(srcHost, targetHost);
      fs.copyFileSync(srcProtocol, targetProtocol);
    } catch (e) {}

    // Create launcher wrapper script
    let launcherPath = '';
    if (platform === 'win32') {
      launcherPath = path.join(manifestDir, 'dpf-native-host.bat');
      const nodeExe = hostExecutablePath || process.execPath;
      const batContent = `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${nodeExe}" "${targetHost}" %*\r\n`;
      fs.writeFileSync(launcherPath, batContent, 'utf-8');
    } else {
      launcherPath = path.join(manifestDir, 'dpf-native-host.sh');
      const nodeExe = hostExecutablePath || process.execPath;
      const shContent = `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\n"${nodeExe}" "${targetHost}" "$@"\n`;
      fs.writeFileSync(launcherPath, shContent, { mode: 0o755 });
    }

    const chromeOrigins = [
      `chrome-extension://${EXTENSION_ID}/`,
      'chrome-extension://llnaagambiafkpmdpmpcnaoegngcnkii/',
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
    const registeredExtensions = [];
    const detected = HostInstaller.detectBrowsers();

    if (platform === 'win32') {
      // 1. Register Native Messaging Hosts
      const nativeHostKeys = [
        'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.dpf.downloader',
        'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.dpf.downloader',
        'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.dpf.downloader',
        'HKCU\\Software\\Mozilla\\NativeMessagingHosts\\com.dpf.downloader'
      ];

      for (const key of nativeHostKeys) {
        try {
          const isFirefox = key.includes('Mozilla');
          const targetPath = isFirefox ? firefoxManifestPath : chromeManifestPath;
          execSync(`reg add "${key}" /ve /t REG_SZ /d "${targetPath}" /f`, { stdio: 'ignore' });
          registered.push(key);
        } catch (e) {}
      }

      // 2. Remove any stale external CRX registry keys to prevent Chromium reason 256 block
      const extRegKeys = [
        `HKCU\\Software\\Google\\Chrome\\Extensions\\${EXTENSION_ID}`,
        `HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions\\${EXTENSION_ID}`,
        `HKCU\\Software\\Microsoft\\Edge\\Extensions\\${EXTENSION_ID}`
      ];

      for (const extKey of extRegKeys) {
        try {
          execSync(`reg delete "${extKey}" /f`, { stdio: 'ignore' });
        } catch (e) {}
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

    return {
      success: true,
      extensionId: EXTENSION_ID,
      unpackedPath: homeExtDir,
      crxPath: crxPath,
      registered,
      registeredExtensions,
      detectedBrowsers: detected.map(b => b.name)
    };
  }
}

module.exports = { HostInstaller, EXTENSION_ID };
