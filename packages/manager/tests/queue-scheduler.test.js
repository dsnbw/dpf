const test = require('node:test');
const assert = require('node:assert');
const { QueueScheduler } = require('../src/queue-scheduler');

test('QueueScheduler respects max concurrent active tasks and priority order', () => {
  const scheduler = new QueueScheduler({ maxActiveTasks: 2 });

  scheduler.enqueueTask({ id: 'task-A', priority: 1 });
  scheduler.enqueueTask({ id: 'task-B', priority: 10 }); // Higher priority
  scheduler.enqueueTask({ id: 'task-C', priority: 5 });

  // Next task to process should be task-B (highest priority)
  const next1 = scheduler.popNextTask();
  assert.strictEqual(next1.id, 'task-B');
  scheduler.markTaskActive(next1.id);

  // Next task should be task-C
  const next2 = scheduler.popNextTask();
  assert.strictEqual(next2.id, 'task-C');
  scheduler.markTaskActive(next2.id);

  // Capacity is 2, so should return null until one finishes
  assert.strictEqual(scheduler.canStartNextTask(), false);
  assert.strictEqual(scheduler.popNextTask(), null);

  // Finish task-B
  scheduler.markTaskDone('task-B');
  assert.strictEqual(scheduler.canStartNextTask(), true);

  // Now task-A can be taken
  const next3 = scheduler.popNextTask();
  assert.strictEqual(next3.id, 'task-A');
});
