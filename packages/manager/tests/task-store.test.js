const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { TaskStore } = require('../src/task-store');

test('TaskStore saves and loads tasks with atomic write-ahead persistence', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpf-store-test-'));
  const storePath = path.join(tempDir, 'tasks.json');

  const store = new TaskStore(storePath);
  store.load();

  const task1 = {
    id: 't-1',
    url: 'https://example.com/file1.zip',
    filename: 'file1.zip',
    destinationPath: 'C:\\Downloads\\file1.zip',
    totalSize: 1048576,
    downloadedSize: 524288,
    status: 'paused',
    category: 'Compressed',
    dateAdded: new Date().toISOString()
  };

  store.upsertTask(task1);
  assert.strictEqual(store.getTask('t-1').status, 'paused');

  // Verify file was written to disk
  assert.strictEqual(fs.existsSync(storePath), true);

  // Load from disk in a fresh instance
  const freshStore = new TaskStore(storePath);
  freshStore.load();
  const loadedTask = freshStore.getTask('t-1');
  assert.strictEqual(loadedTask.filename, 'file1.zip');
  assert.strictEqual(loadedTask.totalSize, 1048576);

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
});
