/**
 * Token-bucket algorithm for global download speed throttling.
 */
class BandwidthLimiter {
  constructor(maxBytesPerSecond = 0) {
    this.maxBytesPerSecond = maxBytesPerSecond; // 0 = unlimited
    this.tokens = maxBytesPerSecond;
    this.lastRefill = Date.now();
  }

  setLimit(maxBytesPerSecond) {
    this.maxBytesPerSecond = Math.max(0, maxBytesPerSecond);
    this.tokens = this.maxBytesPerSecond;
  }

  async throttle(bytes) {
    if (this.maxBytesPerSecond <= 0) {
      return; // Unlimited
    }

    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxBytesPerSecond, this.tokens + elapsed * this.maxBytesPerSecond);
    this.lastRefill = now;

    if (this.tokens >= bytes) {
      this.tokens -= bytes;
      return;
    }

    // Must wait for enough tokens
    const needed = bytes - this.tokens;
    const waitTimeMs = (needed / this.maxBytesPerSecond) * 1000;
    this.tokens = 0;
    await new Promise(resolve => setTimeout(resolve, Math.min(waitTimeMs, 1000)));
  }
}

module.exports = { BandwidthLimiter };
