const { EventEmitter } = require('node:events');

class QueueScheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxActiveTasks = options.maxActiveTasks || 2;
    this.queue = [];
    this.activeTasks = new Set();
    this.isQueueRunning = false;
    this.scheduledTimer = null;
    this.stopTimer = null;
  }

  enqueueTask(task) {
    const existingIndex = this.queue.findIndex(t => t.id === task.id);
    if (existingIndex >= 0) {
      this.queue[existingIndex] = task;
    } else {
      this.queue.push(task);
    }
    // Sort descending by priority (higher priority first)
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  canStartNextTask() {
    return this.activeTasks.size < this.maxActiveTasks && this.queue.length > 0;
  }

  popNextTask() {
    if (!this.canStartNextTask()) {
      return null;
    }
    return this.queue.shift();
  }

  markTaskActive(taskId) {
    this.activeTasks.add(taskId);
  }

  markTaskDone(taskId) {
    this.activeTasks.delete(taskId);
    if (this.isQueueRunning) {
      this.processQueue();
    }
  }

  startQueue() {
    this.isQueueRunning = true;
    this.processQueue();
  }

  stopQueue() {
    this.isQueueRunning = false;
  }

  processQueue() {
    while (this.canStartNextTask()) {
      const next = this.popNextTask();
      if (!next) break;
      this.markTaskActive(next.id);
      this.emit('start-task', next);
    }

    if (this.queue.length === 0 && this.activeTasks.size === 0) {
      this.isQueueRunning = false;
      this.emit('queue-empty');
    }
  }

  scheduleQueue(startDate, stopDate, onAutoShutdown) {
    if (this.scheduledTimer) clearTimeout(this.scheduledTimer);
    if (this.stopTimer) clearTimeout(this.stopTimer);

    const now = Date.now();
    const startDelay = Math.max(0, new Date(startDate).getTime() - now);

    this.scheduledTimer = setTimeout(() => {
      this.startQueue();
      this.emit('schedule-started');
    }, startDelay);

    if (stopDate) {
      const stopDelay = Math.max(0, new Date(stopDate).getTime() - now);
      this.stopTimer = setTimeout(() => {
        this.stopQueue();
        this.emit('schedule-stopped');
        if (typeof onAutoShutdown === 'function') {
          onAutoShutdown();
        }
      }, stopDelay);
    }
  }
}

module.exports = { QueueScheduler };
