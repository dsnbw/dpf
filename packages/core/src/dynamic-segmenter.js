/**
 * Segment status and byte range state
 */
class Segment {
  constructor(id, start, end) {
    this.id = id;
    this.start = start;
    this.end = end;
    this.current = start;
    this.isCompleted = false;
    this.isActive = false;
    this.speed = 0; // Bytes per second
  }

  get totalBytes() {
    return this.end - this.start + 1;
  }

  get downloadedBytes() {
    return this.current - this.start;
  }

  get remainingBytes() {
    return Math.max(0, this.end - this.current + 1);
  }
}

/**
 * DynamicSegmenter manages multi-stream byte ranges and real-time splitting
 */
class DynamicSegmenter {
  /**
   * @param {number} totalSize - Total file size in bytes
   * @param {number} maxConnections - Maximum parallel segments (default 8)
   * @param {number} minSplitThreshold - Minimum remaining bytes to justify a split (default 256KB)
   */
  constructor(totalSize, maxConnections = 8, minSplitThreshold = 256 * 1024) {
    this.totalSize = totalSize;
    this.maxConnections = Math.max(1, Math.min(32, maxConnections));
    this.minSplitThreshold = minSplitThreshold;
    this.segments = [];

    this._initializeSegments();
  }

  _initializeSegments() {
    if (this.totalSize <= 0) {
      // Unknown size: single stream from 0 onwards
      this.segments.push(new Segment(0, 0, 0));
      return;
    }

    const chunkSize = Math.floor(this.totalSize / this.maxConnections);
    let currentOffset = 0;

    for (let i = 0; i < this.maxConnections; i++) {
      const isLast = i === this.maxConnections - 1;
      const endOffset = isLast ? this.totalSize - 1 : currentOffset + chunkSize - 1;

      this.segments.push(new Segment(i, currentOffset, endOffset));
      currentOffset = endOffset + 1;
    }
  }

  getSegments() {
    return this.segments;
  }

  getSegment(id) {
    return this.segments.find(s => s.id === id);
  }

  updateProgress(id, bytesDownloaded) {
    const seg = this.getSegment(id);
    if (!seg) return;

    seg.current += bytesDownloaded;
    if (seg.current > seg.end) {
      seg.current = seg.end + 1;
      seg.isCompleted = true;
      seg.isActive = false;
    }
  }

  /**
   * Finds the active segment with the largest remaining bytes
   * and splits its remaining portion with an idle connection.
   * @param {number} idleConnectionId - Connection ID ready to take work
   * @returns {Segment|null} The newly assigned segment or null
   */
  splitLargestRemainingSegment(idleConnectionId) {
    let largest = null;
    let maxRemaining = 0;

    for (const seg of this.segments) {
      if (!seg.isCompleted && seg.id !== idleConnectionId) {
        const remaining = seg.remainingBytes;
        if (remaining > maxRemaining) {
          maxRemaining = remaining;
          largest = seg;
        }
      }
    }

    if (!largest || maxRemaining < this.minSplitThreshold) {
      return null;
    }

    // Split remaining bytes into two equal parts
    const splitDelta = Math.floor(maxRemaining / 2);
    const originalEnd = largest.end;

    // Shrink the current segment's end
    largest.end = largest.current + splitDelta - 1;

    // Create the new sub-range for the idle connection
    const newStart = largest.end + 1;
    const newEnd = originalEnd;

    // Update or reassign segment for idle connection
    let idleSeg = this.getSegment(idleConnectionId);
    if (idleSeg) {
      idleSeg.start = newStart;
      idleSeg.current = newStart;
      idleSeg.end = newEnd;
      idleSeg.isCompleted = false;
      idleSeg.isActive = true;
    } else {
      idleSeg = new Segment(idleConnectionId, newStart, newEnd);
      idleSeg.isActive = true;
      this.segments.push(idleSeg);
    }

    return idleSeg;
  }

  getTotalDownloaded() {
    return this.segments.reduce((acc, seg) => acc + seg.downloadedBytes, 0);
  }

  isAllCompleted() {
    return this.segments.every(s => s.isCompleted);
  }
}

module.exports = { Segment, DynamicSegmenter };
