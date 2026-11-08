const { app, BrowserWindow, ipcMain, shell, Tray, Menu } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

// Resilient package resolver across dev, production, and asar packaging
function safeLoad(name, relPath) {
  try {
    return require(name);
  } catch (e1) {
    try {
      return require(path.resolve(__dirname, relPath));
    } catch (e2) {
      try {
        return require(path.join(app.getAppPath(), 'packages', name.replace('@dpf/', ''), 'src'));
      } catch (e3) {
        throw new Error(`Failed to load module ${name}. Trace: ${e1.message} -> ${e2.message} -> ${e3.message}`);
      }
    }
  }
}

const { DownloadEngine } = safeLoad('@dpf/core', '../../../core/src');
const { TaskStore, QueueScheduler, BandwidthLimiter, ClipboardWatcher } = safeLoad('@dpf/manager', '../../../manager/src');
const { HostInstaller } = safeLoad('@dpf/native-host', '../../../native-host/src');
const { LocalIpcServer } = require('./ipc-server');
const { GitHubAutoUpdater } = require('./updater');

let mainWindow = null;
let tray = null;

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

const engine = new DownloadEngine();
const taskStore = new TaskStore();
taskStore.load();

const scheduler = new QueueScheduler({ maxActiveTasks: 3 });
const bandwidthLimiter = new BandwidthLimiter(0);
const ipcServer = new LocalIpcServer();
const updater = new GitHubAutoUpdater(app.getVersion());

function getAppIcon() {
  const possiblePaths = [
    path.join(__dirname, '../renderer/icon.png'),
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(__dirname, '../../../../build/icon.png')
  ];
  for (const p of possiblePaths) {
    if (require('node:fs').existsSync(p)) return p;
  }
  return undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 700,
    minWidth: 840,
    minHeight: 520,
    backgroundColor: '#0f172a',
    icon: getAppIcon(),
    title: 'Downloader Pro Free (DPF)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Auto-register browser native host manifests on launch
  try {
    HostInstaller.register();
  } catch (e) {
    console.warn('Initial host registration note:', e.message);
  }

  // Start Local IPC Server for Browser Native Messaging
  ipcServer.start();
  ipcServer.on('message', (msg) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.webContents.send('native-download-request', msg);
    }
  });

  // Forward Engine events to Renderer
  engine.on('progress', (data) => {
    if (mainWindow) mainWindow.webContents.send('download-progress', data);
  });

  engine.on('completed', (data) => {
    taskStore.upsertTask({ id: data.id, status: 'completed', progress: 100 });
    if (mainWindow) mainWindow.webContents.send('download-completed', data);
  });

  engine.on('worker-error', (data) => {
    if (mainWindow) mainWindow.webContents.send('download-error', data);
  });

  // Check for updates on startup
  updater.checkForUpdates();
  updater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-available', info);
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for Renderer
ipcMain.handle('get-tasks', () => {
  return taskStore.getAllTasks();
});

ipcMain.handle('start-download', async (event, config) => {
  const destDir = config.destinationPath || path.join(os.homedir(), 'Downloads');
  const filename = config.filename || 'download.bin';
  const fullPath = path.join(destDir, filename);

  const task = {
    id: config.id || Math.random().toString(36).substring(2, 9),
    url: config.url,
    filename: filename,
    destinationPath: fullPath,
    category: TaskStore.detectCategory(filename),
    status: 'downloading',
    totalSize: config.totalSize || 0,
    downloadedSize: 0,
    dateAdded: new Date().toISOString()
  };

  taskStore.upsertTask(task);

  engine.startTask({
    id: task.id,
    url: task.url,
    destinationPath: fullPath,
    connections: config.connections || 8
  }).catch((err) => {
    taskStore.upsertTask({ id: task.id, status: 'error', error: err.message });
  });

  return task;
});

ipcMain.handle('pause-download', async (event, taskId) => {
  await engine.pauseTask(taskId);
  taskStore.upsertTask({ id: taskId, status: 'paused' });
  return { success: true };
});

ipcMain.handle('resume-download', async (event, taskId) => {
  const task = taskStore.getTask(taskId);
  if (task) {
    taskStore.upsertTask({ id: taskId, status: 'downloading' });
    engine.startTask({
      id: task.id,
      url: task.url,
      destinationPath: task.destinationPath,
      connections: 8
    });
  }
  return { success: true };
});

ipcMain.handle('delete-task', async (event, taskId) => {
  await engine.cancelTask(taskId);
  taskStore.removeTask(taskId);
  return { success: true };
});

ipcMain.handle('register-browser-integration', async () => {
  return HostInstaller.register();
});

ipcMain.handle('detect-browsers', async () => {
  return HostInstaller.detectBrowsers();
});

ipcMain.handle('launch-browser-test', async (event, browserName) => {
  const browsers = HostInstaller.detectBrowsers();
  const target = browsers.find(b => b.name.toLowerCase().includes(browserName.toLowerCase()));
  if (!target) {
    throw new Error(`Browser ${browserName} is not installed on this system.`);
  }

  // Resolve unpacked extension path
  let extDir = path.resolve(__dirname, '../../../../dist/extension');
  if (!require('fs').existsSync(extDir)) {
    extDir = path.join(app.getAppPath(), 'dist/extension');
  }

  // Launch browser with extension loaded
  const testUrl = 'https://www.google.com';
  const child = spawn(target.executablePath, [
    `--load-extension=${extDir}`,
    testUrl
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  return { success: true, browser: target.name, extDir };
});

ipcMain.handle('check-for-updates', async () => {
  return updater.checkForUpdates();
});

ipcMain.handle('open-file-location', (event, filePath) => {
  shell.showItemInFolder(filePath);
});
