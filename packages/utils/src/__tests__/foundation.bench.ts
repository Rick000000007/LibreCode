import { bench, describe } from 'vitest';
import { EventBus, ok, fail } from '../foundation.js';

describe('EventBus Performance', () => {
  const bus = new EventBus();
  bus.on('test-event', () => {});

  bench('emit event', () => {
    bus.emit('test-event', { data: 'test' });
  });
});

describe('Result Wrapper Performance', () => {
  bench('create ok result', () => {
    ok('success-data');
  });

  bench('create fail result', () => {
    fail(new Error('fail-data'));
  });
});
