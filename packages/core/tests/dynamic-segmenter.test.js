const test = require('node:test');
const assert = require('node:assert');
const { DynamicSegmenter } = require('../src/dynamic-segmenter');

test('DynamicSegmenter creates initial balanced segments', () => {
  const totalBytes = 1000000;
  const numConnections = 4;
  const segmenter = new DynamicSegmenter(totalBytes, numConnections);

  const segments = segmenter.getSegments();
  assert.strictEqual(segments.length, 4);

  // Check contiguous coverage from 0 to totalBytes - 1
  assert.strictEqual(segments[0].start, 0);
  assert.strictEqual(segments[0].end, 249999);
  assert.strictEqual(segments[1].start, 250000);
  assert.strictEqual(segments[1].end, 499999);
  assert.strictEqual(segments[2].start, 500000);
  assert.strictEqual(segments[2].end, 749999);
  assert.strictEqual(segments[3].start, 750000);
  assert.strictEqual(segments[3].end, 999999);
});

test('DynamicSegmenter splits slowest segment when an idle connection needs work', () => {
  const totalBytes = 1000000;
  const numConnections = 2;
  const segmenter = new DynamicSegmenter(totalBytes, numConnections);

  // Segment 0 downloads completely
  segmenter.updateProgress(0, 500000); // 0-499999 completed
  assert.strictEqual(segmenter.getSegment(0).isCompleted, true);

  // Segment 1 is at byte 600,000 (remaining: 600,000 to 999,999 = 400,000 bytes)
  segmenter.updateProgress(1, 100000);

  // Connection 0 is now idle. Segmenter should split Segment 1
  const newSegment = segmenter.splitLargestRemainingSegment(0);
  assert.notStrictEqual(newSegment, null);

  // Remaining bytes on Segment 1 was 400,000. It splits roughly in half.
  const seg1 = segmenter.getSegment(1);
  assert.strictEqual(seg1.end, 799999);
  assert.strictEqual(newSegment.start, 800000);
  assert.strictEqual(newSegment.end, 999999);
  assert.strictEqual(newSegment.id, 0); // Reused connection 0
});
