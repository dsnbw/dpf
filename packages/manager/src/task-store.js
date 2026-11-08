const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/**
 * TaskStore handles persistence of all downloads and queues with write-ahead crash-resilient saving.
 */
class TaskStore {
  /**
   * @param {string} [customPath]
   */
  constructor(customPath) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const configDir = path.join(os.homedir(), '.dpf');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      this.filePath = path.join(configDir, 'tasks.json');
    }
    this.tasks = new Map();
    this.categories = ['All', 'Compressed', 'Documents', 'Music', 'Programs', 'Video', 'Incomplete'];
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.tasks)) {
        this.tasks.clear();
        for (const task of data.tasks) {
          this.tasks.set(task.id, task);
        }
      }
    } catch (err) {
      console.error('Failed to parse TaskStore data:', err);
    }
  }

  save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const payload = JSON.stringify({
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      tasks: Array.from(this.tasks.values())
    }, null, 2);

    // Atomic write via temp file rename
    const tempFile = `${this.filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, payload, 'utf-8');
    fs.renameSync(tempFile, this.filePath);
  }

  getTask(id) {
    return this.tasks.get(id);
  }

  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  upsertTask(task) {
    this.tasks.set(task.id, {
      ...this.tasks.get(task.id),
      ...task,
      updatedAt: new Date().toISOString()
    });
    this.save();
  }

  removeTask(id) {
    const deleted = this.tasks.delete(id);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  getTasksByCategory(category) {
    if (!category || category === 'All') {
      return this.getAllTasks();
    }
    if (category === 'Incomplete') {
      return this.getAllTasks().filter(t => t.status !== 'completed');
    }
    return this.getAllTasks().filter(t => t.category === category);
  }

  static detectCategory(filename = '', contentType = '') {
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const mime = contentType.toLowerCase();

    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
      return 'Compressed';
    }
    if (['mp4', 'mkv', 'avi', 'mov', 'flv', 'webm', 'ts', 'm4v', '3gp'].includes(ext) || mime.includes('video')) {
      return 'Video';
    }
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext) || mime.includes('audio')) {
      return 'Music';
    }
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'epub'].includes(ext) || mime.includes('pdf') || mime.includes('document')) {
      return 'Documents';
    }
    if (['exe', 'msi', 'dmg', 'appimage', 'deb', 'rpm', 'apk'].includes(ext)) {
      return 'Programs';
    }
    return 'General';
  }
}

module.exports = { TaskStore };
