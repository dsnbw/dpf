# Downloader Pro Free (DPF)

<p align="center">
  <img src="packages/extension/icons/icon128.png" width="96" height="96" alt="DPF Logo" />
</p>

<p align="center">
  <strong>The Ultimate High-Speed, Cross-Platform Download Acceleration Manager</strong><br>
  <em>100% Free • Open Source • IDM Feature Parity • Dynamic Multi-Stream Segmentation • Universal Browser Integration</em>
</p>

<p align="center">
  <a href="https://github.com/dsnbw/dpf/releases"><img src="https://img.shields.io/github/v/release/dsnbw/dpf?color=10b981&label=version" alt="Latest Release"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-38bdf8" alt="Cross-Platform">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
  <img src="https://img.shields.io/badge/browser-Chrome%20%7C%20Edge%20%7C%20Firefox%20%7C%20Brave%20%7C%20Opera-f59e0b" alt="Browser Integration">
</p>

---

## ⚡ Highlights

**Downloader Pro Free (DPF)** is an enterprise-grade download acceleration client engineered using clean-room reverse engineering principles inspired by Internet Download Manager (IDM). It overcomes IDM's proprietary limitations by running natively across **Windows, macOS, and Linux** while providing 100% feature parity, zero ads, zero subscriptions, and direct GitHub auto-updates.

* **🚀 Maximum Download Acceleration:** Multi-connection dynamic segmentation (up to 32 parallel streams per task). Active chunks are dynamically re-split on the fly when other connections finish, keeping your network connection fully saturated until the last byte.
* **⚡ Zero-Copy Direct-to-Disk I/O:** Uses Sparse File random-access chunk writing directly at target byte offsets. Never wastes time re-assembling or copying temporary files at 100%.
* **🌐 Universal Browser Integration:** Native Messaging Host and WebExtension (MV3/MV2) for Google Chrome, Microsoft Edge, Mozilla Firefox, Brave, Opera, Vivaldi, and Arc.
* **🎥 Floating Video Grabber:** Injects an in-page floating *"Download this video"* button on HTML5 video players (YouTube, TikTok, Facebook, Vimeo, Twitter, direct streams) with automatic stream sniffing.
* **🔄 Direct GitHub Auto-Updater:** Built-in auto-updater directly checks GitHub Releases (`github.com/dsnbw/dpf/releases`) and allows 1-click upgrade to the newest release.
* **📋 Advanced Queue & Scheduler:** Synchronized start/stop schedules, priority queues, and automatic computer sleep/shutdown upon completion.
* **🛡️ Bandwidth Limiter & Clipboard Monitor:** Real-time token-bucket speed limiter and automatic URL clipboard detection.

---

## 📊 Comparison: DPF vs. IDM vs. Traditional Downloaders

| Feature | Internet Download Manager (IDM) | Traditional Downloaders | Downloader Pro Free (DPF) |
|---|:---:|:---:|:---:|
| **Pricing** | Paid / Proprietary (\$24.95+) | Free with Ads | **100% Free & Open Source** |
| **OS Support** | Windows only | Limited | **Windows, macOS, Linux** |
| **Dynamic Segmentation** | Yes | No (Static chunks) | **Yes (Dynamic on-the-fly split)** |
| **Zero-Copy Sparse I/O** | Yes | No (Slow temp file merge) | **Yes (Direct offset writes)** |
| **Floating Video Grabber** | Yes | Rare | **Yes (HTML5 In-page Grabber)** |
| **Browser Compatibility** | Chrome, Edge, Firefox | Manual links | **Chrome, Edge, Firefox, Brave, Opera, etc.** |
| **Auto-Updates** | Tonec servers | Manual check | **Direct GitHub Releases API** |
| **Telemetry & Ads** | Telemetry included | Frequent Adware | **Zero Telemetry, Zero Ads** |

---

## 📥 Installation

Download the standard installer or portable archive for your operating system from the [Releases Page](https://github.com/dsnbw/dpf/releases):

### Windows
* **Installer (NSIS):** `DPF-Setup.exe` (Runs standard installer with desktop shortcuts and auto-registry setup).
* **Portable:** `DPF-Portable.zip` (Extract anywhere and run `DPF.exe`).

### macOS
* **Apple Silicon & Intel Universal:** `DPF.dmg` (Drag and drop into `/Applications`).
* *Note for Gatekeeper:* If macOS displays an unsigned app prompt, run in Terminal:
  ```bash
  xattr -cr "/Applications/Downloader Pro Free.app"
  ```

### Linux
* **AppImage (Universal):** `DPF.AppImage` (`chmod +x DPF.AppImage && ./DPF.AppImage`).
* **Debian / Ubuntu:** `DPF.deb` (`sudo dpkg -i DPF.deb`).

---

## 🧩 Browser Extension Setup (1-Click)

1. Open **Downloader Pro Free**.
2. Click **Options** on the toolbar to automatically register the Native Messaging Host into your system's browser registries.
3. In Chrome/Edge/Brave, go to `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, and select the `dist/extension` folder (or install the packaged `.zip`).
4. You are ready! Downloads and video players will now automatically integrate with DPF.

---

## 🏗️ Architecture & Development

DPF is architected as a modular monorepo:

* `packages/core`: Multi-stream download engine, `DynamicSegmenter`, `SparseFile`, HTTP Keep-Alive client.
* `packages/manager`: SQLite/JSON task store, write-ahead persistence, priority `QueueScheduler`, and `BandwidthLimiter`.
* `packages/native-host`: Stdio-based 4-byte frame Native Messaging Host (`--run-as-node`) and browser registry installer.
* `packages/extension`: Universal WebExtension (MV3) with floating media grabber and network request interception.
* `packages/app`: Electron desktop interface with IDM layout, live dynamic segment visualization bar, and GitHub auto-updater.

### Running from source

```bash
# Clone the repository
git clone https://github.com/dsnbw/dpf.git
cd dpf

# Install dependencies and build extension
npm install
node scripts/build-all.js

# Start application in development mode
npm start
```

---

## 📄 License

Downloader Pro Free is released under the [MIT License](LICENSE).
Developed with pride by [dsnbw](https://github.com/dsnbw).
