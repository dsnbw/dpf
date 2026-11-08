# Downloader Pro Free (DPF) - Architecture & System Design Document

**Document Version:** 1.0.0  
**Date:** 2026-11-08  
**Target Repository:** https://github.com/dsnbw/dpf  
**Status:** In Review / Sized Project  

---

## 1. Intent & The Why

### 1.1 Background & Motivation
Internet Download Manager (IDM) has long been the gold standard for HTTP/HTTPS download acceleration on Windows due to its dynamic file segmentation algorithm, high-speed connection reuse, and seamless browser integration. However, IDM suffers from critical modern limitations:
1. **Proprietary & Paid:** Requires purchase licenses, frequently triggering crack/key issues, nag screens, and security vulnerabilities with unofficial patches.
2. **Platform Locked:** Strictly Windows-only, leaving macOS and Linux users without an equivalent native IDM experience.
3. **Outdated Tech Stack:** Closed-source Win32 GDI GUI, missing modern dark mode, responsive layout, and cross-platform native messaging automation.

### 1.2 Purpose
**Downloader Pro Free (DPF)** is an enterprise-grade, 100% free, open-source, and cross-platform download manager designed to replicate and exceed IDM's feature set and raw download speeds. Using clean-room software design principles informed by `morluto/rea` (Reverse Engineer Anything) and `storytold/craft-anything`, DPF reproduces IDM's proven dynamic segmentation, media stream sniffing, and browser integration while offering a modern UI and multi-platform support across Windows, macOS, and Linux.

---

## 2. Goals, Non-Goals, and Anti-Goals

### 2.1 Goals
* **Maximum Download Acceleration:** 
  * Multi-connection dynamic segmentation (up to 32 concurrent streams per task).
  * Dynamic segment splitting: actively running chunks are split on the fly when other chunks finish to keep all connections saturated until the final byte.
  * Direct zero-copy disk writes (sparse file pre-allocation and random-access chunk writing to avoid end-of-download file reassembly bottlenecks).
  * HTTP/1.1, HTTP/2, and HTTP/3 (QUIC) support with TCP keep-alive connection reuse.
* **Universal Browser Integration:**
  * Universal WebExtension (Manifest V3 with V2 compatibility) for Google Chrome, Microsoft Edge, Mozilla Firefox, Brave, Opera, Vivaldi, Arc, and Safari.
  * One-click download interception with bypass keys (e.g. holding Alt to prevent interception).
  * In-page floating "Download this Video / Audio" overlay on HTML5 media elements.
  * Media sniffer for dynamic streams (HLS `.m3u8` playlists and MPEG-DASH `.mpd` manifests with automatic audio/video muxing).
* **Comprehensive IDM Feature Parity:**
  * Advanced Queue & Scheduler: prioritized queues, synchronized start/stop times, auto-shutdown/sleep upon completion.
  * Global and Per-Task Speed Limiter (bandwidth throttling).
  * Clipboard monitor: auto-detect downloadable URLs copied to the system clipboard.
  * Site Grabber / Batch Downloader: recursive site scraping with file-type and depth filters.
  * Full download resume and integrity verification (ETag, Content-Range, MD5/SHA256 checksums).
* **Cross-Platform & Easy Distribution:**
  * Native installers and standalone portables for:
    * **Windows:** `.exe` (NSIS installer with automatic registry Native Messaging registration), `.zip` portable.
    * **macOS:** `.dmg` (Universal build for Apple Silicon M1/M2/M3/M4 and Intel x64).
    * **Linux:** `.AppImage`, `.deb`, `.tar.gz` for Debian/Ubuntu, Fedora, Arch, etc.
  * Automated GitHub Actions CI/CD to build, sign, and publish all release assets to `github.com/dsnbw/dpf`.

### 2.2 Non-Goals
* BitTorrent / P2P client functionality in v1.0 (focus is direct HTTP/HTTPS/FTP high-speed acceleration).
* Proprietary Tonec code bundling (DPF is 100% clean-room open-source code).

### 2.3 Anti-Goals
* **No Telemetry / No Ads:** Zero user tracking, zero third-party telemetry, zero promotions.
* **No Artificial Throttles:** Unlimited speed by default.
* **No File Corruption:** Robust atomic segment commit, recovery journals, and file integrity validation preventing partial corruptions.

---

## 3. Considered Approaches & Selection

| Architecture Approach | Description | Pros | Cons | Decision |
|---|---|---|---|---|
| **Approach A: Electron + High-Speed Multi-Worker Node/C++ Engine** | Modern cross-platform shell with Node.js 24 multi-threaded worker engine, native stream buffers, and WebExtension Native Messaging Host. | • Ready immediately with current system toolchain (Node 24, npm 12, Python 3.12).<br>• Beautiful IDM-inspired UI with high-precision chunk visualizer.<br>• Mature packaging ecosystem (`electron-builder`) for Win/Mac/Linux.<br>• Flawless browser native messaging integration. | • Installer size ~70MB.<br>• Idle memory ~60-80MB. | **SELECTED (User Choice)** |
| **Approach B: Rust Core + Tauri v2** | Rust async core (tokio/hyper) with native OS webview. | • Ultra-low RAM (<25MB).<br>• Small binary size (~15MB). | • Requires installing MSVC & Rust toolchains on host.<br>• Complex multi-platform webview inconsistencies on old Linux distros. | Rejected |
| **Approach C: Go Daemon + Wails/Fyne GUI** | Go goroutine-based engine with Wails webview or Fyne OpenGL. | • Fast single-binary cross-compilation. | • Fyne lacks modern DOM for rich media sniffer previews.<br>• Wails requires system webkit2gtk libraries on Linux. | Rejected |

---

## 4. Detailed System Architecture

```
+---------------------------------------------------------------------------------------+
|                                    DPF ECOSYSTEM                                      |
+---------------------------------------------------------------------------------------+
|                                                                                       |
|   +-------------------------------------+     +-----------------------------------+   |
|   |          Web Browsers               |     |          Desktop GUI (DPF)        |   |
|   |  Chrome / Edge / Firefox / Opera    |     |   Electron UI (IDM Layout)        |   |
|   |  +-------------------------------+  |     |   - Category Sidebar              |   |
|   |  | DPF WebExtension (MV3/MV2)    |  |     |   - Dynamic Chunk Segment Bar     |   |
|   |  | - Network Interceptor         |  |     |   - Floating Video Grabber UI     |   |
|   |  | - Media Sniffer (HLS/DASH/MP4)|  |     |   - Queue & Scheduler Manager     |   |
|   |  +---------------+---------------+  |     |   - Real-time Speed Graph         |   |
|   +------------------|------------------+     +-----------------+-----------------+   |
|                      | Stdio JSON IPC                           | IPC                 |
|                      v                                          v                     |
|   +-------------------------------------------------------------------------------+   |
|   |                       DPF Native Messaging Host                               |   |
|   |               (DPF.exe --run-as-node native-host.js)                          |   |
|   +--------------------------------------+----------------------------------------+   |
|                                          | Local IPC (Named Pipe / Unix Domain Socket)|
|                                          v                                            |
|   +-------------------------------------------------------------------------------+   |
|   |                     DPF Core Download Engine (Worker Pool)                    |   |
|   |  +----------------------+ +-----------------------+ +----------------------+  |   |
|   |  | Dynamic Segmenter    | | Http/1.1 & Http/2     | | Sparse File Manager  |  |   |
|   |  | (On-the-fly split)   | | (TCP connection pool) | | (Zero-assembly I/O)  |  |   |
|   |  +----------------------+ +-----------------------+ +----------------------+  |   |
|   |  +----------------------+ +-----------------------+ +----------------------+  |   |
|   |  | Video Grabber Bridge | | Bandwidth Limiter     | | Task Database        |  |   |
|   |  | (HLS/DASH/yt-dlp)    | | (Token bucket throttle| | (JSON Ledger Journal)|  |   |
|   |  +----------------------+ +-----------------------+ +----------------------+  |   |
|   +-------------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------------+
```

### 4.1 Core Components & Builder Decisions (Reviewed)

1. **`dpf-core` (Download Acceleration Engine):**
   * **Networking Engine:** Utilizes Node.js 24's high-throughput `http`, `https`, and `http2` modules with TCP connection pooling and keep-alive (`keepAlive: true`, `maxSockets: 64`). This achieves 100% link saturation identical to IDM while remaining 100% portable across Windows, macOS, and Linux without native C++ compilation risks.
   * **Dynamic Segmenter:** Splits a download into $N$ segments (default 8, up to 32). Monitors segment progress in real time. If Connection A completes its range $R_A = [s_A, e_A]$ while Connection B is still downloading $R_B = [s_B, e_B]$ with $e_B - current_B > threshold$, Connection A dynamically splits Connection B's remaining bytes into two sub-ranges:
     $$R_{B1} = [current_B, current_B + \lfloor \Delta / 2 \rfloor], \quad R_{A\_new} = [current_B + \lfloor \Delta / 2 \rfloor + 1, e_B]$$
     This guarantees maximum throughput up to the very last byte without dead idle streams.
   * **Direct-to-Disk Sparse File Writer:** Instead of downloading parts into separate temporary files and incurring expensive file reassembly copying at 100%, DPF pre-allocates the full target file (or uses sparse file allocation via OS system calls) and writes byte buffers directly to their calculated file offsets (`fs.write(fd, buffer, 0, length, offset)`). When the last chunk finishes, the file is already complete—zero wait time!

2. **`dpf-app` (Cross-Platform Electron Interface):**
   * Single-instance tray application (`app.requestSingleInstanceLock()`).
   * High-fidelity IDM-inspired dashboard:
     * **Left Sidebar:** Categories (*All Downloads, Compressed, Documents, Music, Programs, Video, Incomplete, Queues*).
     * **Top Toolbar:** *Add URL, Resume, Stop, Stop All, Delete, Options, Scheduler, Start Queue, Stop Queue*.
     * **Task Table:** File Name, Size, Status, Progress Bar, Speed, Time Left, Date Added, Category.
     * **Task Details Modal:** Live segment visualizer showing individual connection bars, byte ranges, transfer rates, and connection status.
     * **Download Complete Dialog:** *Open, Open Folder, Close*.
   * Native system tray integration with minimize-to-tray, quick-add clipboard capture, and global speed limit toggles.

3. **`dpf-native-host` (Zero-Dependency Browser Bridge):**
   * Implements the Native Messaging Protocol (4-byte length prefix + UTF-8 JSON payload over `stdin`/`stdout`).
   * **Self-Contained Execution:** Runs via Electron's built-in `--run-as-node` mode (`DPF.exe --run-as-node native-host.js` on Windows, or direct executable wrapper on Unix). End users do NOT need Node.js installed on their machines!
   * Connects to the running DPF instance over Windows Named Pipe (`\\.\pipe\dpf-ipc`) or Unix Domain Socket (`/tmp/dpf.sock`).
   * Built-in 1-click installer in DPF Settings to register the host manifest in Windows Registry (`HKCU\Software\Google\Chrome\NativeMessagingHosts\...`, Edge, Firefox) and macOS/Linux config directories.

4. **`dpf-extension` & Video Grabber:**
   * Universal WebExtension (Manifest V3 + V2 compatibility) supporting Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi, and Mozilla Firefox.
   * **In-Page Floating Video Grabber:** Injects an IDM-style download button on `<video>` and `<audio>` elements.
   * **Media Sniffer:** Captures `.mp4`, `.webm`, `.m3u8` (HLS), `.mpd` (DASH) requests.
   * For complex streaming sites (YouTube, Facebook, etc.), DPF includes a smart extractor bridge that handles streams cleanly. Lightweight media muxing binaries (ffmpeg) are downloaded automatically on-demand if the user initiates an HLS/DASH download, keeping base installer size minimal (~65MB).

5. **Packaging, CI/CD & Open-Source Distribution:**
   * Automated GitHub Actions matrix (`.github/workflows/build-release.yml`) for Windows, macOS, and Linux.
   * Standard unsigned open-source releases with built-in onboarding documentation for Windows SmartScreen and macOS Gatekeeper.
   * Outputs:
     * Windows: `DPF-Setup.exe` (NSIS Installer), `DPF-Portable.zip`.
     * macOS: `DPF.dmg` (Universal binary for Intel & Apple Silicon).
     * Linux: `DPF.AppImage`, `DPF.deb`.
   * Automatically publishes to `github.com/dsnbw/dpf`.

---

## 5. Security, Reliability & Quality Assurance

1. **Authentication & Token Safety:**
   * GitHub Access Token stored securely, never leaked into public build artifacts.
2. **Crash & Power Loss Resilience:**
   * Task states and segment offsets are persisted to a JSON state ledger with write-ahead journaling (`.dpf.state`). If network drops or the PC shuts down, DPF resumes exactly where it left off.
3. **Automated Test Coverage:**
   * Unit tests for chunk calculation, dynamic range splitting, sparse buffer writing, and Native Messaging serialization.
   * Integration tests with a mock HTTP range server simulating high latency, connection drops, and chunk re-requests.

---

## 6. What's Left to the Builder
* Specific UI styling tokens (customizable classic IDM vs. modern glassmorphism dark theme).
* Default maximum connection count per download (set to 8 by default, adjustable up to 32 in Options).
* Default download destination path (`~/Downloads/DPF`).
