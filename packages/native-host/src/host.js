#!/usr/bin/env node
const net = require('node:net');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { encodeNativeMessage, NativeMessageDecoder } = require('./protocol');

const PIPE_NAME = os.platform() === 'win32' ? '\\\\.\\pipe\\dpf-ipc' : '/tmp/dpf.sock';

function sendToBrowser(msg) {
  try {
    const frame = encodeNativeMessage(msg);
    process.stdout.write(frame);
  } catch (e) {
    // Stdio closed
  }
}

function forwardToDpfApp(message) {
  const client = net.connect(PIPE_NAME, () => {
    client.write(JSON.stringify(message) + '\n');
  });

  client.on('data', (data) => {
    try {
      const response = JSON.parse(data.toString());
      sendToBrowser(response);
    } catch (e) {
      sendToBrowser({ success: true });
    }
    client.end();
  });

  client.on('error', (err) => {
    // App might not be running: send fallback response or launch app
    sendToBrowser({
      success: false,
      error: 'DPF Desktop App is not currently running. Please launch Downloader Pro Free.'
    });
  });
}

function main() {
  const decoder = new NativeMessageDecoder();

  decoder.on('message', (msg) => {
    if (msg.action === 'PING') {
      sendToBrowser({ action: 'PONG', version: '1.0.0', status: 'ready' });
    } else {
      forwardToDpfApp(msg);
    }
  });

  decoder.on('error', (err) => {
    sendToBrowser({ error: err.message });
  });

  process.stdin.on('data', (chunk) => decoder.push(chunk));
  process.stdin.on('end', () => process.exit(0));
}

if (require.main === module) {
  main();
}

module.exports = { main, forwardToDpfApp };
