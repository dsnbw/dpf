const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
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
const updater = new GitHubAutoUpdater(app.getVersion() || '1.0.3');

function getAppIcon() {
  const possiblePaths = [
    path.join(__dirname, '../renderer/icon.png'),
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(__dirname, '../../../../build/icon.png')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow() {
  // Completely remove native application menu and hide OS menu bars
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 840,
    minHeight: 520,
    frame: false, // Completely removes OS native title bar and borders
    autoHideMenuBar: true, // Prevents Alt key from showing default OS menu
    backgroundColor: '#0f172a',
    icon: getAppIcon(),
    title: 'Downloader Pro Free (DPF)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

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

  // Auto-updater background check on launch
  updater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-available', info);
  });
  updater.on('update-not-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-not-available', info);
  });
  updater.on('error', (err) => {
    if (mainWindow) mainWindow.webContents.send('update-error', { error: err.message });
  });

  updater.checkForUpdates().catch(() => {});
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

// Custom Title Bar Window Controls
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// Task Management IPC handlers
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

// Browser Integration Handlers
ipcMain.handle('register-browser-integration', async () => {
  return HostInstaller.register();
});

ipcMain.handle('detect-browsers', async () => {
  return HostInstaller.detectBrowsers();
});

ipcMain.handle('copy-extension-path', () => {
  const homeExtDir = path.join(os.homedir(), '.dpf', 'extension');
  const { clipboard } = require('electron');
  clipboard.writeText(homeExtDir);
  return homeExtDir;
});

ipcMain.handle('launch-browser-test', async (event, browserName) => {
  const browsers = HostInstaller.detectBrowsers();
  const target = browsers.find(b => b.name.toLowerCase().includes(browserName.toLowerCase()));
  if (!target) {
    throw new Error(`Browser ${browserName} is not installed on this system.`);
  }

  const homeExtDir = path.join(os.homedir(), '.dpf', 'extension');
  const { clipboard } = require('electron');
  clipboard.writeText(homeExtDir);

  // Auto-deploy latest extension files and registry
  try {
    HostInstaller.register();
  } catch (e) {}

  // Launch browser with extension loaded automatically pointing to YouTube
  const testUrl = 'https://www.youtube.com';
  const child = spawn(target.executablePath, [
    `--load-extension=${homeExtDir}`,
    testUrl
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  return { success: true, browser: target.name, extDir: homeExtDir };
});

// Auto-Updater Handler
ipcMain.handle('check-for-updates', async () => {
  return await updater.checkForUpdates();
});

ipcMain.handle('open-file-location', (event, filePath) => {
  shell.showItemInFolder(filePath);
});
