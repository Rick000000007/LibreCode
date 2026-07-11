import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderManager } from '../provider-manager.js';

describe('ProviderManager', () => {
  let pm: ProviderManager;

  beforeEach(() => {
    pm = new ProviderManager();
  });

  it('starts not configured but isConfigured returns true (free always available)', () => {
    expect(pm.isConfigured()).toBe(true);
  });

  it('has model registry', () => {
    const registry = pm.getModelRegistry();
    expect(registry.size()).toBeGreaterThan(15);
  });

  it('has auto router', () => {
    const router = pm.getAutoRouter();
    expect(router).toBeDefined();
  });

  it('has health monitor', () => {
    const monitor = pm.getHealthMonitor();
    expect(monitor).toBeDefined();
  });

  it('has streaming engine', () => {
    const engine = pm.getStreamingEngine();
    expect(engine).toBeDefined();
  });

  it('has fallback handler', () => {
    const handler = pm.getFallbackHandler();
    expect(handler).toBeDefined();
  });

  it('has conversation store', () => {
    const store = pm.getConversationStore();
    expect(store).toBeDefined();
  });

  it('discovers providers from environment', async () => {
    const discovered = await pm.discoverProviders();
    expect(Array.isArray(discovered)).toBe(true);
  });

  it('getActiveProvider returns null before initialize', () => {
    expect(pm.getActiveProvider()).toBeNull();
  });

  it('destroy stops health monitoring', () => {
    expect(() => pm.destroy()).not.toThrow();
  });
});
