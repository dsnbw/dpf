const { EventEmitter } = require('node:events');
const { HttpClient } = require('./http-client');
const { SparseFile } = require('./sparse-file');
const { DynamicSegmenter } = require('./dynamic-segmenter');

class DownloadEngine extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
  }

  /**
   * Starts or resumes a download task
   * @param {object} config
   * @param {string} config.id
   * @param {string} config.url
   * @param {string} config.destinationPath
   * @param {number} [config.connections=8]
   * @param {Record<string, string>} [config.headers]
   */
  async startTask(config) {
    const taskId = config.id || Math.random().toString(36).substring(2, 10);
    const numConnections = Math.max(1, Math.min(32, config.connections || 8));

    // Probe URL metadata
    const probe = await HttpClient.probeUrl(config.url, config.headers);
    const totalSize = probe.totalSize;
    const supportsRanges = probe.supportsRanges && totalSize > 0;

    const sparseFile = new SparseFile(config.destinationPath, totalSize);
    await sparseFile.open();

    const segmenter = new DynamicSegmenter(
      totalSize,
      supportsRanges ? numConnections : 1
    );

    const taskState = {
      id: taskId,
      url: probe.url,
      destinationPath: config.destinationPath,
      totalSize,
      supportsRanges,
      sparseFile,
      segmenter,
      isPaused: false,
      isCancelled: false,
      activeWorkers: new Set(),
      lastDownloaded: 0,
      speed: 0,
      speedTimer: null
    };

    this.tasks.set(taskId, taskState);

    // Speed calculation ticker
    let previousDownloaded = 0;
    taskState.speedTimer = setInterval(() => {
      if (taskState.isPaused || taskState.isCancelled) return;
      const currentDownloaded = segmenter.getTotalDownloaded();
      taskState.speed = Math.max(0, currentDownloaded - previousDownloaded);
      previousDownloaded = currentDownloaded;

      this.emit('progress', {
        id: taskId,
        downloaded: currentDownloaded,
        total: totalSize,
        speed: taskState.speed,
        percentage: totalSize > 0 ? (currentDownloaded / totalSize) * 100 : 0,
        activeConnections: taskState.activeWorkers.size,
        segments: segmenter.getSegments().map(s => ({
          id: s.id,
          start: s.start,
          end: s.end,
          current: s.current,
          percentage: s.totalBytes > 0 ? (s.downloadedBytes / s.totalBytes) * 100 : 0,
          isActive: s.isActive,
          isCompleted: s.isCompleted
        }))
      });
    }, 500);

    // Launch worker streams for each initial segment
    const initialSegments = segmenter.getSegments();
    for (const segment of initialSegments) {
      this._runWorker(taskState, segment);
    }

    return taskId;
  }

  async _runWorker(taskState, segment) {
    if (taskState.isPaused || taskState.isCancelled || segment.isCompleted) return;

    taskState.activeWorkers.add(segment.id);
    segment.isActive = true;

    try {
      const stream = await HttpClient.getRangeStream(
        taskState.url,
        segment.current,
        segment.end
      );

      for await (const chunk of stream) {
        if (taskState.isPaused || taskState.isCancelled) {
          stream.destroy();
          break;
        }

        const writeOffset = segment.current;
        await taskState.sparseFile.writeChunk(writeOffset, chunk);
        taskState.segmenter.updateProgress(segment.id, chunk.length);

        if (segment.isCompleted) {
          break;
        }
      }
    } catch (err) {
      if (!taskState.isPaused && !taskState.isCancelled) {
        this.emit('worker-error', { id: taskState.id, segmentId: segment.id, error: err.message });
      }
    } finally {
      taskState.activeWorkers.delete(segment.id);
      segment.isActive = false;

      if (!taskState.isPaused && !taskState.isCancelled) {
        // IDM dynamic segmentation magic:
        // Try to split the largest remaining segment for this now-idle connection!
        const newSeg = taskState.segmenter.splitLargestRemainingSegment(segment.id);
        if (newSeg) {
          // Continue downloading the new split portion with this idle connection!
          this._runWorker(taskState, newSeg);
        } else if (taskState.activeWorkers.size === 0 && taskState.segmenter.isAllCompleted()) {
          // All segments finished!
          await this._finalizeTask(taskState);
        }
      }
    }
  }

  async _finalizeTask(taskState) {
    clearInterval(taskState.speedTimer);
    await taskState.sparseFile.close();
    this.tasks.delete(taskState.id);

    this.emit('completed', {
      id: taskState.id,
      destinationPath: taskState.destinationPath,
      totalSize: taskState.totalSize
    });
  }

  async pauseTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.isPaused = true;
    clearInterval(task.speedTimer);
    await task.sparseFile.close();
    this.emit('paused', { id: taskId });
  }

  async cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.isCancelled = true;
    clearInterval(task.speedTimer);
    await task.sparseFile.close();
    this.tasks.delete(taskId);
    this.emit('cancelled', { id: taskId });
  }
}

module.exports = { DownloadEngine };
