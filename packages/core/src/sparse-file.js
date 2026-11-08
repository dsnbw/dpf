const fs = require('node:fs');
const path = require('node:path');

/**
 * SparseFile handles direct-to-disk chunk writes at arbitrary offsets.
 * Avoids any temporary file copying or end-of-download reassembly.
 */
class SparseFile {
  /**
   * @param {string} filePath - Absolute path to destination file
   * @param {number} totalSize - Total file size in bytes
   */
  constructor(filePath, totalSize = 0) {
    this.filePath = filePath;
    this.totalSize = totalSize;
    this.fd = null;
    this.isClosed = true;
  }

  /**
   * Pre-allocates destination file and opens file descriptor
   */
  async open() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open for reading and writing, creating if doesn't exist
    this.fd = fs.openSync(this.filePath, 'w+');
    this.isClosed = false;

    // Pre-allocate space if total size is known
    if (this.totalSize > 0) {
      try {
        fs.ftruncateSync(this.fd, this.totalSize);
      } catch (err) {
        // Fallback if ftruncate fails: seek to end and write 0
        const zeroBuf = Buffer.alloc(1);
        fs.writeSync(this.fd, zeroBuf, 0, 1, this.totalSize - 1);
      }
    }
  }

  /**
   * Writes a byte buffer directly to the specified file offset.
   * @param {number} offset - Byte position to write at
   * @param {Buffer|Uint8Array} buffer - Data buffer
   * @returns {Promise<number>} Number of bytes written
   */
  async writeChunk(offset, buffer) {
    if (this.isClosed || this.fd === null) {
      throw new Error('SparseFile descriptor is closed');
    }

    return new Promise((resolve, reject) => {
      fs.write(this.fd, buffer, 0, buffer.length, offset, (err, written) => {
        if (err) return reject(err);
        resolve(written);
      });
    });
  }

  /**
   * Flushes and closes file descriptor
   */
  async close() {
    if (!this.isClosed && this.fd !== null) {
      try {
        fs.fsyncSync(this.fd);
        fs.closeSync(this.fd);
      } catch (e) {
        // Ignore already closed
      } finally {
        this.fd = null;
        this.isClosed = true;
      }
    }
  }
}

module.exports = { SparseFile };
