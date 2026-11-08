# Downloader Pro Free (DPF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade, open-source, cross-platform download acceleration manager matching and exceeding IDM capabilities (dynamic multi-connection segmentation, universal browser extension with floating video grabber, queue scheduler, and GitHub auto-updates) and publish installers to `github.com/dsnbw/dpf`.

**Architecture:** Electron 34+ desktop shell paired with Node.js 24 multi-stream download engine, direct sparse-file disk I/O, local Named Pipe/IPC bridge, zero-dependency Native Messaging Host (`--run-as-node`), universal WebExtension (MV3/MV2), and GitHub Releases-based auto-updater.

**Tech Stack:** TypeScript, Node.js 24, Electron, HTML5/CSS3 (IDM classic/dark theme), WebExtensions API, GitHub Actions CI/CD matrix.

**Spec:** `docs/superpowers/specs/2026-11-08-downloader-pro-free-design.md`

## Global Constraints

* Dynamic segmentation must bifurcate active byte ranges on the fly when one stream completes.
* Direct-to-disk writing using calculated byte offsets (`fs.write`) without temporary file merging.
* Zero external runtimes required on end-user machines (Native Messaging Host executes via Electron's `--run-as-node`).
* Native Messaging manifests must auto-configure for Chrome, Edge, Brave, Opera, Vivaldi, and Firefox.
* Automatic updates checked directly against `github.com/dsnbw/dpf/releases`.
* All releases built for Windows (x64 NSIS + Portable), macOS (Universal dmg), and Linux (AppImage + deb).

## Review Focus

1. **Non-rangeable servers (`Accept-Ranges: none` or missing Content-Length):** Must fall back gracefully to a robust single-stream download without corrupting state or crashing the segmenter.
2. **Server dropping byte-range connections mid-stream:** Engine must re-attempt and re-split failed chunks with exponential backoff and resume headers (`Range: bytes=X-Y`, `If-Range: <ETag>`).
3. **Sparse file pre-allocation across different filesystems (NTFS, APFS, ext4, FAT32):** Must handle filesystems without sparse allocation support by seeking and expanding file descriptors reliably.
4. **Browser extension communication dropouts:** Native messaging host must handle browser disconnects, reconnection attempts, and queued URL messages without dropping payloads.
5. **Network disconnect / abrupt power termination:** Task states must be safely journaled (`state.json` write-ahead journal) allowing instantaneous one-click resume on app restart.

---

### Task 1: Core Acceleration Engine (`packages/core`)

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/sparse-file.ts`
- Create: `packages/core/src/dynamic-segmenter.ts`
- Create: `packages/core/src/http-client.ts`
- Create: `packages/core/src/engine.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Test: `packages/core/tests/sparse-file.test.ts`
- Test: `packages/core/tests/dynamic-segmenter.test.ts`
- Test: `packages/core/tests/engine.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface DownloadTaskConfig {
    id: string;
    url: string;
    destinationPath: string;
    connections?: number; // default 8, max 32
    headers?: Record<string, string>;
  }
  export class DownloadEngine extends EventEmitter {
    start(config: DownloadTaskConfig): Promise<void>;
    pause(id: string): Promise<void>;
    resume(id: string): Promise<void>;
    cancel(id: string): Promise<void>;
  }
  ```

- [ ] **Step 1: Write unit tests for dynamic segment splitting and sparse file writing**
  Write tests in `packages/core/tests/dynamic-segmenter.test.ts` testing range splitting $(s, e)$ on live chunk completion, and `packages/core/tests/sparse-file.test.ts` writing buffer chunks at exact offsets.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -w packages/core`
  Expected: FAIL with missing module.
- [ ] **Step 3: Implement `SparseFile` and `DynamicSegmenter`**
  Implement dynamic chunk splitting logic in `dynamic-segmenter.ts` calculating sub-ranges and `sparse-file.ts` handling `fs.open`, `fs.write` at byte offsets without intermediate chunk files.
- [ ] **Step 4: Implement `DownloadEngine` with HTTP Range Keep-Alive Client**
  Implement `engine.ts` handling multi-part requests with Node's native `http`/`https` agents (`keepAlive: true`, `maxSockets: 64`), emitting speed, progress, and segment status.
- [ ] **Step 5: Run tests to verify they pass**
  Run: `npm test -w packages/core`
  Expected: PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add packages/core
  git commit -m "feat(core): implement dynamic segmentation download engine and sparse file writer"
  ```

---

### Task 2: Task Manager, State Ledger & Queue Scheduler (`packages/manager`)

**Files:**
- Create: `packages/manager/src/task-store.ts`
- Create: `packages/manager/src/queue-scheduler.ts`
- Create: `packages/manager/src/bandwidth-limiter.ts`
- Create: `packages/manager/src/clipboard-watcher.ts`
- Create: `packages/manager/package.json`
- Test: `packages/manager/tests/queue-scheduler.test.ts`
- Test: `packages/manager/tests/task-store.test.ts`

**Interfaces:**
- Consumes: `DownloadEngine`, `DownloadTaskConfig` from Task 1.
- Produces:
  ```typescript
  export class QueueScheduler {
    addTask(task: DownloadTaskConfig, queueId?: string): void;
    startQueue(queueId: string): void;
    stopQueue(queueId: string): void;
    setGlobalSpeedLimit(bytesPerSecond: number): void;
    schedule(queueId: string, startTime: Date, stopTime?: Date): void;
  }
  ```

- [ ] **Step 1: Write unit tests for queue sequencing, state persistence, and speed limiter**
  Write tests in `packages/manager/tests/queue-scheduler.test.ts` testing queue item ordering, max concurrent active downloads, and speed token-bucket throttling.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -w packages/manager`
  Expected: FAIL.
- [ ] **Step 3: Implement `TaskStore` with atomic JSON state journaling**
  Implement write-ahead crash-resilient task persistence (`~/.dpf/tasks.json` with `.tmp` atomic rename).
- [ ] **Step 4: Implement `QueueScheduler` and `BandwidthLimiter`**
  Implement priority queues, start/stop timers, auto-shutdown hooks, and clipboard URL pattern monitor.
- [ ] **Step 5: Run tests to verify they pass**
  Run: `npm test -w packages/manager`
  Expected: PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add packages/manager
  git commit -m "feat(manager): implement task store, queue scheduler, and bandwidth limiter"
  ```

---

### Task 3: Universal Native Messaging Host & Browser Auto-Config (`packages/native-host`)

**Files:**
- Create: `packages/native-host/src/host.ts`
- Create: `packages/native-host/src/protocol.ts`
- Create: `packages/native-host/src/installer.ts`
- Create: `packages/native-host/manifest-chrome.json`
- Create: `packages/native-host/manifest-firefox.json`
- Test: `packages/native-host/tests/protocol.test.ts`

**Interfaces:**
- Consumes: Local IPC server / Named Pipe (`\\.\pipe\dpf-ipc` on Windows, `/tmp/dpf.sock` on Unix).
- Produces:
  ```typescript
  export function registerBrowserHost(): Promise<{ success: boolean; registered: string[] }>;
  export function unregisterBrowserHost(): Promise<void>;
  export function handleStdioStream(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): void;
  ```

- [ ] **Step 1: Write test for Native Messaging 4-byte prefix frame codec**
  Test encoding and decoding 32-bit little-endian message length and JSON bodies.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -w packages/native-host`
  Expected: FAIL.
- [ ] **Step 3: Implement `protocol.ts` and `host.ts`**
  Implement stdio framing and local IPC client connecting to the running DPF app or launching it.
- [ ] **Step 4: Implement `installer.ts` for Windows Registry, macOS, and Linux**
  Write automatic registration scripts modifying `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.dpf.downloader`, Edge, Brave, and Firefox directories.
- [ ] **Step 5: Run tests to verify they pass**
  Run: `npm test -w packages/native-host`
  Expected: PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add packages/native-host
  git commit -m "feat(native-host): implement native messaging protocol and cross-platform browser registration"
  ```

---

### Task 4: Universal WebExtension & Floating Video Grabber (`packages/extension`)

**Files:**
- Create: `packages/extension/manifest.json`
- Create: `packages/extension/src/background.ts`
- Create: `packages/extension/src/content.ts`
- Create: `packages/extension/src/grabber-ui.ts`
- Create: `packages/extension/src/media-sniffer.ts`
- Create: `packages/extension/icons/icon16.png`, `icon48.png`, `icon128.png`
- Create: `packages/extension/popup/popup.html`, `popup.ts`

**Interfaces:**
- Communicates via `chrome.runtime.sendNativeMessage("com.dpf.downloader", payload)`.

- [ ] **Step 1: Implement `media-sniffer.ts` and `grabber-ui.ts`**
  Sniff `<video>` and `<audio>` DOM elements, intercept `.m3u8`, `.mpd`, `.mp4` URLs via `chrome.webRequest` / `declarativeNetRequest`, and render the floating "Download with DPF" button over the player.
- [ ] **Step 2: Implement `background.ts`**
  Intercept downloads via `chrome.downloads.onCreated`, forward metadata (URL, headers, cookies, referer) to DPF Native Host.
- [ ] **Step 3: Implement `popup.html` and options toggle**
  Create options popup enabling/disabling media sniffing, file type exclusions, and bypass keys (Alt key to prevent interception).
- [ ] **Step 4: Package extension into installable bundle and crx/zip generator**
  Add build script producing clean unpacked extension directory and `.zip` for Chrome/Firefox/Edge.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/extension
  git commit -m "feat(extension): implement universal web extension with media sniffer and floating grabber"
  ```

---

### Task 5: Electron GUI Application & GitHub Auto-Updater (`packages/app`)

**Files:**
- Create: `packages/app/src/main/index.ts`
- Create: `packages/app/src/main/ipc-server.ts`
- Create: `packages/app/src/main/updater.ts`
- Create: `packages/app/src/renderer/index.html`
- Create: `packages/app/src/renderer/styles.css`
- Create: `packages/app/src/renderer/app.ts`
- Create: `packages/app/src/renderer/components/SegmentVisualizer.ts`
- Create: `packages/app/src/renderer/components/Toolbar.ts`
- Create: `packages/app/src/renderer/components/Sidebar.ts`
- Create: `packages/app/src/renderer/components/TaskList.ts`
- Create: `packages/app/package.json`

**Interfaces:**
- Integrates `dpf-core`, `dpf-manager`, `dpf-native-host`.
- Produces: Standalone executable desktop app with tray and updater.

- [ ] **Step 1: Implement Electron Main process with single-instance lock and IPC server**
  Implement `main/index.ts` and `ipc-server.ts` listening on named pipe `\\.\pipe\dpf-ipc` / Unix socket to receive URLs from Native Host.
- [ ] **Step 2: Implement GitHub Auto-Updater (`updater.ts`)**
  Implement checking GitHub releases API `https://api.github.com/repos/dsnbw/dpf/releases/latest`, comparing semver, notifying user, and 1-click downloading/applying new versions.
- [ ] **Step 3: Implement Renderer UI (Classic & Dark Mode IDM theme)**
  Implement Category Sidebar, Toolbar (Add URL, Resume, Pause, Stop All, Delete, Options, Scheduler), Task List table with real-time speed/ETA, and dynamic Segment Bar visualizer showing live chunk progress.
- [ ] **Step 4: Add New Download Dialog and Download Complete Dialog**
  Build popups for "Start Download" (file name, path, categories, download now / later) and "Download Complete" (Open, Open Folder).
- [ ] **Step 5: Verify full application build locally**
  Run: `npm run build`
  Expected: Clean build without errors.
- [ ] **Step 6: Commit**
  ```bash
  git add packages/app
  git commit -m "feat(app): implement Electron GUI with IDM layout, segment visualizer, and GitHub auto-updater"
  ```

---

### Task 6: GitHub Repo Setup, Cross-Platform Packaging & CI/CD Release (`.github/workflows`)

**Files:**
- Create: `electron-builder.yml`
- Create: `.github/workflows/build-release.yml`
- Create: `README.md`
- Create: `LICENSE` (MIT)
- Create: `scripts/build-all.js`

**Interfaces:**
- Produces release installers published to `github.com/dsnbw/dpf`:
  - Windows: `DPF-Setup.exe`, `DPF-Portable.zip`
  - macOS: `DPF.dmg`, `DPF-macOS.zip`
  - Linux: `DPF.AppImage`, `DPF.deb`

- [ ] **Step 1: Configure `electron-builder.yml` for multi-platform distribution**
  Configure NSIS for Windows, DMG for macOS, and AppImage/DEB for Linux with desktop shortcuts and file associations.
- [ ] **Step 2: Create GitHub Actions Workflow `.github/workflows/build-release.yml`**
  Set up matrix strategy for `windows-latest`, `macos-latest`, `ubuntu-latest`, automated build, artifact packaging, and release publication using `softprops/action-gh-release`.
- [ ] **Step 3: Write comprehensive `README.md` with installation guides and browser integration**
  Include badges, feature list, installation instructions for Windows, macOS, Linux, and 1-click browser extension setup.
- [ ] **Step 4: Initialize Git repo, create remote repository on `github.com/dsnbw/dpf` using token, and push code**
  Create repo via GitHub REST API, push `main` branch with tag `v1.0.0`.
- [ ] **Step 5: Verify build script and GitHub release workflow trigger**
  Verify local build and repository synchronization on GitHub.
- [ ] **Step 6: Commit**
  ```bash
  git add .
  git commit -m "chore: setup multi-platform packaging, CI/CD release workflow, and documentation"
  ```
