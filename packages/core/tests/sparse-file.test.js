const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { SparseFile } = require('../src/sparse-file');

test('SparseFile pre-allocates and writes chunks at exact offsets without corrupting', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpf-test-'));
  const filePath = path.join(tempDir, 'test-download.bin');
  const totalSize = 1024 * 1024; // 1 MB

  const sparse = new SparseFile(filePath, totalSize);
  await sparse.open();

  // Write chunk 1 at offset 0
  const chunk1 = Buffer.from('CHUNK_ONE_DATA_AT_START');
  await sparse.writeChunk(0, chunk1);

  // Write chunk 2 at offset 500,000
  const chunk2 = Buffer.from('CHUNK_TWO_DATA_IN_MIDDLE');
  await sparse.writeChunk(500000, chunk2);

  // Write chunk 3 at offset 1,000,000
  const chunk3 = Buffer.from('CHUNK_THREE_DATA_NEAR_END');
  await sparse.writeChunk(1000000, chunk3);

  await sparse.close();

  // Verify file size and content at offsets
  const stat = fs.statSync(filePath);
  assert.strictEqual(stat.size, totalSize);

  const fd = fs.openSync(filePath, 'r');
  const buf1 = Buffer.alloc(chunk1.length);
  fs.readSync(fd, buf1, 0, chunk1.length, 0);
  assert.strictEqual(buf1.toString(), 'CHUNK_ONE_DATA_AT_START');

  const buf2 = Buffer.alloc(chunk2.length);
  fs.readSync(fd, buf2, 0, chunk2.length, 500000);
  assert.strictEqual(buf2.toString(), 'CHUNK_TWO_DATA_IN_MIDDLE');

  const buf3 = Buffer.alloc(chunk3.length);
  fs.readSync(fd, buf3, 0, chunk3.length, 1000000);
  assert.strictEqual(buf3.toString(), 'CHUNK_THREE_DATA_NEAR_END');

  fs.closeSync(fd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});
