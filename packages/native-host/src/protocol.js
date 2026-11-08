const { EventEmitter } = require('node:events');

/**
 * Encodes a JSON object into a Native Messaging frame:
 * 4-byte little-endian message length prefix + UTF-8 JSON payload.
 * @param {any} message 
 * @returns {Buffer}
 */
function encodeNativeMessage(message) {
  const jsonStr = JSON.stringify(message);
  const byteLen = Buffer.byteLength(jsonStr, 'utf-8');
  const buffer = Buffer.alloc(4 + byteLen);

  buffer.writeUInt32LE(byteLen, 0);
  buffer.write(jsonStr, 4, byteLen, 'utf-8');
  return buffer;
}

/**
 * Stream decoder for browser Native Messaging stdio chunks.
 * Reassembles arbitrary fragmentations cleanly.
 */
class NativeMessageDecoder extends EventEmitter {
  constructor() {
    super();
    this.buffer = Buffer.alloc(0);
    this.expectedLength = null;
  }

  /**
   * Pushes incoming raw buffer chunks from stdin
   * @param {Buffer} chunk 
   */
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this._processBuffer();
  }

  _processBuffer() {
    while (true) {
      if (this.expectedLength === null) {
        // We need at least 4 bytes to read the message length
        if (this.buffer.length < 4) {
          break;
        }
        this.expectedLength = this.buffer.readUInt32LE(0);
        this.buffer = this.buffer.subarray(4);
      }

      // Check if we have the full message payload
      if (this.buffer.length < this.expectedLength) {
        break; // Wait for more data
      }

      const payloadBuf = this.buffer.subarray(0, this.expectedLength);
      this.buffer = this.buffer.subarray(this.expectedLength);
      this.expectedLength = null;

      try {
        const jsonStr = payloadBuf.toString('utf-8');
        const message = JSON.parse(jsonStr);
        this.emit('message', message);
      } catch (err) {
        this.emit('error', err);
      }
    }
  }
}

module.exports = {
  encodeNativeMessage,
  NativeMessageDecoder
};
