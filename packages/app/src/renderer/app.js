const { ipcRenderer, shell } = require('electron');

let tasks = [];
let selectedTaskId = null;
let currentCategory = 'All';

// DOM Elements
const taskTableBody = document.getElementById('taskTableBody');
const segmentBarsContainer = document.getElementById('segmentBarsContainer');
const segmentStats = document.getElementById('segmentStats');
const globalStatus = document.getElementById('globalStatus');
const globalSpeed = document.getElementById('globalSpeed');

// Modals
const modalAddUrl = document.getElementById('modalAddUrl');
const inputUrl = document.getElementById('inputUrl');
const inputFilename = document.getElementById('inputFilename');
const selectConnections = document.getElementById('selectConnections');
const btnAddUrl = document.getElementById('btnAddUrl');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelDownload = document.getElementById('btnCancelDownload');
const btnConfirmDownload = document.getElementById('btnConfirmDownload');

// Toolbar buttons
const btnResume = document.getElementById('btnResume');
const btnPause = document.getElementById('btnPause');
const btnStopAll = document.getElementById('btnStopAll');
const btnDelete = document.getElementById('btnDelete');
const btnBrowsers = document.getElementById('btnBrowsers');
const btnOptions = document.getElementById('btnOptions');
const btnUpdate = document.getElementById('btnUpdate');

// Browser modal
const modalBrowsers = document.getElementById('modalBrowsers');
const detectedBrowsersList = document.getElementById('detectedBrowsersList');
const btnCloseBrowserModal = document.getElementById('btnCloseBrowserModal');
const btnCloseBrowserDone = document.getElementById('btnCloseBrowserDone');
const btnRegisterAllBrowsers = document.getElementById('btnRegisterAllBrowsers');

// Update modal
const modalUpdate = document.getElementById('modalUpdate');
const updateModalBody = document.getElementById('updateModalBody');
const btnCloseUpdateModal = document.getElementById('btnCloseUpdateModal');
const btnCloseUpdate = document.getElementById('btnCloseUpdate');

// Format helpers
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec) {
  return `${formatBytes(bytesPerSec)}/s`;
}

// Initialize
async function init() {
  tasks = await ipcRenderer.invoke('get-tasks') || [];
  renderTasks();
  updateCategoryCounts();

  // Category selection
  document.querySelectorAll('.category-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      currentCategory = item.dataset.category || 'All';
      renderTasks();
    });
  });

  // Modal event listeners
  btnAddUrl.addEventListener('click', () => {
    modalAddUrl.style.display = 'flex';
    inputUrl.value = '';
    inputFilename.value = '';
    inputUrl.focus();
  });

  btnCloseModal.addEventListener('click', () => modalAddUrl.style.display = 'none');
  btnCancelDownload.addEventListener('click', () => modalAddUrl.style.display = 'none');

  btnConfirmDownload.addEventListener('click', async () => {
    const url = inputUrl.value.trim();
    if (!url) return;

    modalAddUrl.style.display = 'none';
    const filename = inputFilename.value.trim();
    const connections = parseInt(selectConnections.value, 10);

    const task = await ipcRenderer.invoke('start-download', {
      url,
      filename,
      connections
    });

    tasks.push(task);
    selectedTaskId = task.id;
    renderTasks();
  });

  // Control buttons
  btnResume.addEventListener('click', () => {
    if (selectedTaskId) ipcRenderer.invoke('resume-download', selectedTaskId);
  });

  btnPause.addEventListener('click', () => {
    if (selectedTaskId) ipcRenderer.invoke('pause-download', selectedTaskId);
  });

  btnStopAll.addEventListener('click', () => {
    tasks.forEach(t => {
      if (t.status === 'downloading') ipcRenderer.invoke('pause-download', t.id);
    });
  });

  btnDelete.addEventListener('click', () => {
    if (selectedTaskId) {
      ipcRenderer.invoke('delete-task', selectedTaskId);
      tasks = tasks.filter(t => t.id !== selectedTaskId);
      selectedTaskId = null;
      renderTasks();
      updateCategoryCounts();
    }
  });

  // Browsers Manager Modal
  btnBrowsers.addEventListener('click', async () => {
    modalBrowsers.style.display = 'flex';
    await refreshBrowsersList();
  });

  btnOptions.addEventListener('click', async () => {
    modalBrowsers.style.display = 'flex';
    await refreshBrowsersList();
  });

  btnCloseBrowserModal.addEventListener('click', () => modalBrowsers.style.display = 'none');
  btnCloseBrowserDone.addEventListener('click', () => modalBrowsers.style.display = 'none');

  btnRegisterAllBrowsers.addEventListener('click', async () => {
    btnRegisterAllBrowsers.disabled = true;
    btnRegisterAllBrowsers.innerText = 'Registering...';
    await ipcRenderer.invoke('register-browser-integration');
    btnRegisterAllBrowsers.disabled = false;
    btnRegisterAllBrowsers.innerText = '⚡ Re-register All Browsers';
    await refreshBrowsersList();
  });

  btnUpdate.addEventListener('click', async () => {
    modalUpdate.style.display = 'flex';
    updateModalBody.innerHTML = 'Connecting to GitHub Releases API (github.com/dsnbw/dpf)...';
    ipcRenderer.invoke('check-for-updates');
  });

  btnCloseUpdateModal.addEventListener('click', () => modalUpdate.style.display = 'none');
  btnCloseUpdate.addEventListener('click', () => modalUpdate.style.display = 'none');
}

async function refreshBrowsersList() {
  detectedBrowsersList.innerHTML = '<div style="color: #94a3b8; font-size: 12px;">Scanning system...</div>';
  const browsers = await ipcRenderer.invoke('detect-browsers') || [];

  if (browsers.length === 0) {
    detectedBrowsersList.innerHTML = '<div style="color: #f87171; font-size: 12px;">No supported browsers detected.</div>';
    return;
  }

  detectedBrowsersList.innerHTML = '';
  for (const b of browsers) {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 10px 14px; border-radius: 6px; margin-bottom: 8px; border: 1px solid #334155;';

    item.innerHTML = `
      <div>
        <div style="font-weight: 600; color: #f1f5f9; display: flex; align-items: center; gap: 6px;">
          <span>🌐</span> ${b.name}
          <span style="font-size: 10px; background: #10b981; color: white; padding: 1px 6px; border-radius: 4px;">Detected</span>
        </div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">${b.executablePath}</div>
      </div>
      <div>
        <button class="btn btn-secondary btn-test-browser" data-name="${b.name}" style="font-size: 11px; padding: 4px 10px;">
          Launch & Test
        </button>
      </div>
    `;

    detectedBrowsersList.appendChild(item);
  }

  document.querySelectorAll('.btn-test-browser').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bName = btn.dataset.name;
      btn.innerText = 'Launching...';
      try {
        await ipcRenderer.invoke('launch-browser-test', bName);
        btn.innerText = 'Running!';
        setTimeout(() => { btn.innerText = 'Launch & Test'; }, 3000);
      } catch (err) {
        alert('Failed to launch ' + bName + ': ' + err.message);
        btn.innerText = 'Launch & Test';
      }
    });
  });
}

// Render Tasks Table
function renderTasks() {
  taskTableBody.innerHTML = '';
  const filtered = tasks.filter(t => {
    if (currentCategory === 'All') return true;
    if (currentCategory === 'Incomplete') return t.status !== 'completed';
    return t.category === currentCategory;
  });

  for (const task of filtered) {
    const tr = document.createElement('tr');
    if (task.id === selectedTaskId) tr.classList.add('selected');

    tr.addEventListener('click', () => {
      selectedTaskId = task.id;
      renderTasks();
    });

    tr.addEventListener('dblclick', () => {
      if (task.status === 'completed' && task.destinationPath) {
        ipcRenderer.invoke('open-file-location', task.destinationPath);
      }
    });

    const progress = Math.min(100, Math.max(0, task.progress || 0));

    tr.innerHTML = `
      <td title="${task.filename}">${task.filename}</td>
      <td>${formatBytes(task.totalSize)}</td>
      <td><span class="status-tag status-${task.status}">${task.status}</span></td>
      <td>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${progress}%"></div>
          <div class="progress-bar-text">${progress.toFixed(1)}%</div>
        </div>
      </td>
      <td>${task.speed ? formatSpeed(task.speed) : '-'}</td>
      <td>${task.timeLeft || '-'}</td>
      <td>${task.category || 'General'}</td>
    `;

    taskTableBody.appendChild(tr);
  }
}

function updateCategoryCounts() {
  document.getElementById('countAll').innerText = tasks.length;
  document.getElementById('countCompressed').innerText = tasks.filter(t => t.category === 'Compressed').length;
  document.getElementById('countDocuments').innerText = tasks.filter(t => t.category === 'Documents').length;
  document.getElementById('countMusic').innerText = tasks.filter(t => t.category === 'Music').length;
  document.getElementById('countPrograms').innerText = tasks.filter(t => t.category === 'Programs').length;
  document.getElementById('countVideo').innerText = tasks.filter(t => t.category === 'Video').length;
  document.getElementById('countIncomplete').innerText = tasks.filter(t => t.status !== 'completed').length;
}

// IPC Listeners from Engine
ipcRenderer.on('download-progress', (event, data) => {
  const task = tasks.find(t => t.id === data.id);
  if (task) {
    task.downloadedSize = data.downloaded;
    task.totalSize = data.total;
    task.progress = data.percentage;
    task.speed = data.speed;
    task.status = 'downloading';

    if (data.speed > 0 && data.total > data.downloaded) {
      const remainingSecs = Math.round((data.total - data.downloaded) / data.speed);
      task.timeLeft = `${remainingSecs}s`;
    }

    renderTasks();
    globalSpeed.innerText = `Total Speed: ${formatSpeed(data.speed)}`;

    if (task.id === selectedTaskId && data.segments) {
      renderSegmentBars(data.segments, data.activeConnections);
    }
  }
});

function renderSegmentBars(segments, activeCount) {
  segmentStats.innerText = `Active Connections: ${activeCount} / ${segments.length} | Dynamic Re-splitting: Active`;
  segmentBarsContainer.innerHTML = '';

  for (const seg of segments) {
    const row = document.createElement('div');
    row.className = 'segment-row';
    const percent = seg.percentage ? seg.percentage.toFixed(1) : 0;

    row.innerHTML = `
      <div class="segment-label">Stream #${seg.id + 1}</div>
      <div class="segment-track">
        <div class="segment-fill ${seg.isActive ? '' : 'inactive'}" style="width: ${percent}%"></div>
      </div>
      <div style="width: 40px; text-align: right; color: #94a3b8;">${percent}%</div>
    `;
    segmentBarsContainer.appendChild(row);
  }
}

ipcRenderer.on('download-completed', (event, data) => {
  const task = tasks.find(t => t.id === data.id);
  if (task) {
    task.status = 'completed';
    task.progress = 100;
    task.speed = 0;
    task.timeLeft = 'Done';
    renderTasks();
    updateCategoryCounts();
  }
});

// Incoming download intercepted from browser extension
ipcRenderer.on('native-download-request', (event, msg) => {
  if (msg.action === 'DOWNLOAD_URL' && msg.url) {
    modalAddUrl.style.display = 'flex';
    inputUrl.value = msg.url;
    inputFilename.value = msg.filename || '';
    inputUrl.focus();
  }
});

// Auto-updater notification
ipcRenderer.on('update-available', (event, info) => {
  modalUpdate.style.display = 'flex';
  updateModalBody.innerHTML = `
    <div style="color: #10b981; font-weight: bold; margin-bottom: 8px;">🚀 New Version Available: v${info.latestVersion}</div>
    <div style="color: #94a3b8; font-size: 12px; margin-bottom: 12px;">Current version: v${info.currentVersion}</div>
    <div style="background: #0f172a; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 11px; max-height: 120px; overflow-y: auto;">
      ${info.releaseNotes}
    </div>
    <div style="margin-top: 14px; text-align: right;">
      <a href="${info.downloadUrl}" target="_blank" style="display: inline-block; padding: 8px 16px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Download v${info.latestVersion} Installer
      </a>
    </div>
  `;
});

ipcRenderer.on('update-not-available', (event, info) => {
  updateModalBody.innerHTML = `
    <div style="color: #38bdf8; font-weight: bold; margin-bottom: 8px;">✅ Downloader Pro Free is Up to Date</div>
    <div style="color: #94a3b8; font-size: 12px;">You are running the latest version: v${info.currentVersion}</div>
  `;
});

init();
