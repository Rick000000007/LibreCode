import { describe, test, expect, vi } from 'vitest';
import {
  ok,
  fail,
  LibreError,
  EventBus,
  withTimeout,
  TimeoutError,
  DisposableStore,
  Logger,
  MetricsCollector,
} from '../foundation.js';

describe('Foundation Utilities', () => {
  describe('Result Types', () => {
    test('ok wrapper should return true status', () => {
      const r = ok('success');
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value).toBe('success');
      }
    });

    test('fail wrapper should return false status', () => {
      const err = new Error('failed');
      const r = fail(err);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBe(err);
      }
    });
  });

  describe('LibreError Hierarchy', () => {
    test('should correctly construct LibreError properties', () => {
      const original = new Error('original error');
      const err = new LibreError(
        'TEST_CODE',
        'network',
        'Failed to connect',
        'Check internet connection',
        'Custom detail log text',
        original
      );

      expect(err.code).toBe('TEST_CODE');
      expect(err.category).toBe('network');
      expect(err.message).toBe('Failed to connect');
      expect(err.recoverySuggestion).toBe('Check internet connection');
      expect(err.technicalDetails).toBe('Custom detail log text');
      expect(err.originalCause).toBe(original);
      expect(err.stack).toContain('Caused by: Error: original error');
    });

    test('fromError should wrap generic error into LibreError', () => {
      const err = new Error('generic error');
      const libreErr = LibreError.fromError(err, 'auth');
      expect(libreErr).toBeInstanceOf(LibreError);
      expect(libreErr.code).toBe('UNEXPECTED_ERROR');
      expect(libreErr.category).toBe('auth');
      expect(libreErr.message).toBe('generic error');
    });

    test('fromError should return input if it is already a LibreError', () => {
      const original = new LibreError('CUSTOM_CODE', 'config', 'config failed');
      const resolved = LibreError.fromError(original);
      expect(resolved).toBe(original);
    });
  });

  describe('EventBus', () => {
    test('should subscribe and receive events', () => {
      const bus = new EventBus();
      let received: string | null = null;

      bus.on('test:event', (payload: string) => {
        received = payload;
      });

      bus.emit('test:event', 'payload-value');
      expect(received).toBe('payload-value');
    });

    test('should unsubscribe correctly using returned callback', () => {
      const bus = new EventBus();
      let callCount = 0;

      const unsubscribe = bus.on('test:event', () => {
        callCount++;
      });

      bus.emit('test:event', {});
      expect(callCount).toBe(1);

      unsubscribe();
      bus.emit('test:event', {});
      expect(callCount).toBe(1);
    });

    test('should support multiple concurrent listeners', () => {
      const bus = new EventBus();
      let countA = 0;
      let countB = 0;

      bus.on('test:event', () => { countA++; });
      bus.on('test:event', () => { countB++; });

      bus.emit('test:event', {});
      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });

    test('should not crash if listener rejects', async () => {
      const bus = new EventBus();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      bus.on('test:event', async () => {
        throw new Error('rejected async');
      });

      bus.emit('test:event', {});
      // Wait for promise microtask queue to drain
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('withTimeout & AbortSignal', () => {
    test('should resolve if promise resolves before timeout', async () => {
      const task = Promise.resolve('completed-value');
      const result = await withTimeout(task, 100);
      expect(result).toBe('completed-value');
    });

    test('should reject with TimeoutError if timeout expires first', async () => {
      const task = new Promise((resolve) => setTimeout(resolve, 200));
      await expect(withTimeout(task, 50)).rejects.toThrow(TimeoutError);
    });

    test('should reject immediately if AbortSignal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const task = Promise.resolve('completed-value');
      await expect(withTimeout(task, 100, controller.signal)).rejects.toThrow(
        'Operation cancelled by AbortSignal'
      );
    });

    test('should reject if AbortSignal is triggered during wait', async () => {
      const controller = new AbortController();
      const task = new Promise((resolve) => setTimeout(resolve, 200));

      setTimeout(() => {
        controller.abort();
      }, 50);

      await expect(withTimeout(task, 150, controller.signal)).rejects.toThrow(
        'Operation cancelled by AbortSignal'
      );
    });
  });

  describe('DisposableStore', () => {
    test('should clean up all registered disposables', async () => {
      const store = new DisposableStore();
      let disposedA = false;
      let disposedB = false;

      store.add({
        dispose: () => { disposedA = true; }
      });
      store.add(() => {
        disposedB = true;
      });

      await store.dispose();
      expect(disposedA).toBe(true);
      expect(disposedB).toBe(true);
    });

    test('should dispose immediately if store is already disposed', async () => {
      const store = new DisposableStore();
      await store.dispose();

      let disposed = false;
      store.add(() => {
        disposed = true;
      });

      expect(disposed).toBe(true);
    });
  });

  describe('Logger & MetricsCollector', () => {
    test('Logger should output to console when DEBUG is enabled', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const originalDebug = process.env['DEBUG'];
      process.env['DEBUG'] = 'true';

      const logger = new Logger('TestLogger');
      logger.info('Test message', { tag: 'foo' });

      expect(consoleLogSpy).toHaveBeenCalled();
      const firstCallArgs = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(firstCallArgs);
      expect(parsed.logger).toBe('TestLogger');
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe('Test message');
      expect(parsed.tag).toBe('foo');

      process.env['DEBUG'] = originalDebug;
      consoleLogSpy.mockRestore();
    });

    test('MetricsCollector should accumulate metrics entries', () => {
      const collector = new MetricsCollector();
      collector.record('api_latency', 123, { provider: 'openai' });

      const metrics = collector.getMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0]?.name).toBe('api_latency');
      expect(metrics[0]?.value).toBe(123);
      expect(metrics[0]?.tags?.['provider']).toBe('openai');

      collector.clear();
      expect(collector.getMetrics().length).toBe(0);
    });
  });
});
