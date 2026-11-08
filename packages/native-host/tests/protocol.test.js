const test = require('node:test');
const assert = require('node:assert');
const { encodeNativeMessage, NativeMessageDecoder } = require('../src/protocol');

test('encodeNativeMessage formats 4-byte little-endian length prefix and JSON UTF-8 payload', () => {
  const payload = { type: 'DOWNLOAD_URL', url: 'https://example.com/test.zip' };
  const encoded = encodeNativeMessage(payload);

  const expectedJson = JSON.stringify(payload);
  const expectedLen = Buffer.byteLength(expectedJson, 'utf-8');

  // First 4 bytes must be little-endian 32-bit unsigned int
  const lenInHeader = encoded.readUInt32LE(0);
  assert.strictEqual(lenInHeader, expectedLen);

  const body = encoded.subarray(4).toString('utf-8');
  assert.strictEqual(body, expectedJson);
});

test('NativeMessageDecoder handles chunked stream inputs and decodes multiple messages', (t, done) => {
  const decoder = new NativeMessageDecoder();
  const msg1 = { id: 1, action: 'PING' };
  const msg2 = { id: 2, action: 'DOWNLOAD', url: 'https://test.com/file.iso' };

  const enc1 = encodeNativeMessage(msg1);
  const enc2 = encodeNativeMessage(msg2);
  const combined = Buffer.concat([enc1, enc2]);

  const received = [];
  decoder.on('message', (msg) => {
    received.push(msg);
    if (received.length === 2) {
      assert.deepStrictEqual(received[0], msg1);
      assert.deepStrictEqual(received[1], msg2);
      done();
    }
  });

  // Feed in fragmented chunks (e.g. 5 bytes at a time) to test streaming reassembly
  for (let i = 0; i < combined.length; i += 5) {
    decoder.push(combined.subarray(i, i + 5));
  }
});
