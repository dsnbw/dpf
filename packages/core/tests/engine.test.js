const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DownloadEngine } = require('../src/index');

test('DownloadEngine downloads complete file with dynamic multi-stream segmentation', async () => {
  // Create a 512 KB payload of recognizable data
  const fileSize = 512 * 1024;
  const mockPayload = Buffer.alloc(fileSize);
  for (let i = 0; i < fileSize; i++) {
    mockPayload[i] = (i % 256);
  }

  // Start a local mock HTTP server that supports byte range requests
  const server = http.createServer((req, res) => {
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'application/octet-stream',
        'ETag': '"test-etag-12345"',
        'Content-Disposition': 'attachment; filename="mock-test-file.bin"'
      });
      res.end();
      return;
    }

    const range = req.headers['range'];
    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        const chunk = mockPayload.subarray(start, end + 1);

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.length,
          'Content-Type': 'application/octet-stream'
        });
        res.end(chunk);
        return;
      }
    }

    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream'
    });
    res.end(mockPayload);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const testUrl = `http://127.0.0.1:${port}/mock-test-file.bin`;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpf-engine-test-'));
  const destPath = path.join(tempDir, 'downloaded-output.bin');

  const engine = new DownloadEngine();

  await new Promise((resolve, reject) => {
    engine.on('completed', resolve);
    engine.on('worker-error', reject);

    engine.startTask({
      id: 'task-1',
      url: testUrl,
      destinationPath: destPath,
      connections: 4
    }).catch(reject);
  });

  // Verify downloaded file integrity
  assert.strictEqual(fs.existsSync(destPath), true);
  const downloadedData = fs.readFileSync(destPath);
  assert.strictEqual(downloadedData.length, fileSize);
  assert.deepStrictEqual(downloadedData, mockPayload);

  // Clean up
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});
