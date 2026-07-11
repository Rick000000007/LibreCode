import { describe, it, expect, vi } from 'vitest';
import { HealthMonitor } from '../health-monitor.js';

function createMockProvider(latencyMs = 50) {
  return {
    name: () => 'test-provider',
    complete: vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, latencyMs));
      return { content: 'ok', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' };
    }),
    streamComplete: async () => [],
    maxContextWindow: () => 8192,
    supportsToolCalling: () => true,
    supportsStreaming: () => true,
    supportsVision: () => false,
    supportsReasoning: () => false,
    supportsThinking: () => false,
    supportsMCP: () => false,
    listModels: async () => [],
    getModel: () => ({ id: 'test', name: 'Test', provider: 'test', contextWindow: 8192, supportsToolCalling: true, supportsStreaming: true, isFree: true }),
    setModel: () => {},
  };
}

describe('HealthMonitor', () => {
  it('starts with unknown status', () => {
    const hm = new HealthMonitor();
    expect(hm.getStatus('anything')).toBe('unknown');
  });

  it('isHealthy returns true for unknown providers', () => {
    const hm = new HealthMonitor();
    expect(hm.isHealthy('anything')).toBe(true);
  });

  it('tracks healthy status on success', async () => {
    const hm = new HealthMonitor();
    hm.register('test', createMockProvider(10));
    await hm.runChecks();

    const snapshot = hm.getSnapshot();
    const health = snapshot.get('test');
    expect(health).toBeDefined();
    expect(health!.status).toBe('healthy');
    expect(health!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health!.consecutiveFailures).toBe(0);
  });

  it('tracks degraded on consecutive failures', () => {
    const hm = new HealthMonitor();
    hm.register('test', createMockProvider());

    hm.recordFailure('test');
    expect(hm.getStatus('test')).toBe('degraded');

    hm.recordFailure('test');
    expect(hm.getStatus('test')).toBe('degraded');
  });

  it('tracks unhealthy after 5 consecutive failures', () => {
    const hm = new HealthMonitor();
    hm.register('test', createMockProvider());

    for (let i = 0; i < 5; i++) {
      hm.recordFailure('test');
    }
    expect(hm.getStatus('test')).toBe('unhealthy');
  });

  it('recovers after successful request', () => {
    const hm = new HealthMonitor();
    hm.register('test', createMockProvider());

    for (let i = 0; i < 3; i++) {
      hm.recordFailure('test');
    }
    expect(hm.getStatus('test')).toBe('degraded');

    hm.recordSuccess('test', 50, 100);
    expect(hm.getStatus('test')).toBe('healthy');
    expect(hm.getSnapshot().get('test')!.consecutiveFailures).toBe(0);
  });

  it('recordSuccess updates token throughput', () => {
    const hm = new HealthMonitor();
    hm.register('test', createMockProvider());
    hm.recordSuccess('test', 1000, 100);
    expect(hm.getSnapshot().get('test')!.tokenThroughput).toBe(100);
  });

  it('start runs checks and creates interval', async () => {
    const hm = new HealthMonitor(5000);
    hm.register('test', createMockProvider());
    hm.start();

    // Wait for initial check
    await new Promise((r) => setTimeout(r, 100));
    const snapshot = hm.getSnapshot();
    expect(snapshot.get('test')).toBeDefined();

    hm.stop();
  });

  it('unregister removes provider', () => {
    const hm = new HealthMonitor();
    hm.register('test', createMockProvider());
    expect(hm.getStatus('test')).toBe('unknown');
    hm.unregister('test');
    expect(hm.getStatus('test')).toBe('unknown'); // falls back to unknown
  });

  it('handles provider error during health check', async () => {
    const hm = new HealthMonitor();
    const failingProvider = createMockProvider();
    failingProvider.complete = vi.fn().mockRejectedValue(new Error('Connection refused'));
    hm.register('failing', failingProvider);
    await hm.runChecks();

    expect(hm.getStatus('failing')).toBe('degraded');
    expect(hm.getSnapshot().get('failing')!.consecutiveFailures).toBe(1);
  });

  it('getSnapshot returns all providers', () => {
    const hm = new HealthMonitor();
    hm.register('p1', createMockProvider());
    hm.register('p2', createMockProvider());
    expect(hm.getSnapshot().size).toBe(2);
  });
});
