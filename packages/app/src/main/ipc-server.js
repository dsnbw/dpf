const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const PIPE_NAME = os.platform() === 'win32' ? '\\\\.\\pipe\\dpf-ipc' : '/tmp/dpf.sock';

class LocalIpcServer extends EventEmitter {
  constructor() {
    super();
    this.server = null;
  }

  start() {
    if (os.platform() !== 'win32' && fs.existsSync(PIPE_NAME)) {
      try {
        fs.unlinkSync(PIPE_NAME);
      } catch (e) {}
    }

    this.server = net.createServer((socket) => {
      let buffer = '';

      socket.on('error', () => {
        // Handled: client disconnected
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep partial line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);
            this.emit('message', message);
            socket.write(JSON.stringify({ success: true, status: 'received' }) + '\n');
          } catch (err) {
            socket.write(JSON.stringify({ success: false, error: err.message }) + '\n');
          }
        }
      });
    });

    this.server.listen(PIPE_NAME, () => {
      console.log(`DPF Local IPC Server listening on ${PIPE_NAME}`);
    });

    this.server.on('error', (err) => {
      console.warn('IPC server error:', err.message);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = { LocalIpcServer };
