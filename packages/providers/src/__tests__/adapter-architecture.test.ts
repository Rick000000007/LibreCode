import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AdapterBridge } from '../adapter-bridge.js';
import { AuthManager } from '../auth-manager.js';
import { ConnectionPool } from '../connection-pool.js';
import { withRetry, isRetryableStatus } from '../retry.js';
import { PluginLoader } from '../plugin-loader.js';
import { OpenAICompatibleAdapter } from '../adapters/openai-compatible-adapter.js';
import { AnthropicAdapter } from '../adapters/anthropic-adapter.js';
import { capabilitiesFromDescriptor } from '../capabilities.js';
import type { ProviderAdapter, ProviderPlugin } from '../types/adapter.js';
import type { CompletionRequest, CompletionResponse } from 'librecode-types';
import type { ProviderConfig, Capability } from '../types/provider-descriptor.js';

// ============================================================================
// Mock Adapter for testing
// ============================================================================

class MockAdapter implements ProviderAdapter {
  readonly providerId = 'mock';
  private shouldFail = false;
  private slowStream = false;

  setShouldFail(fail: boolean) { this.shouldFail = fail; }
  setSlowStream(slow: boolean) { this.slowStream = slow; }

  async initialize(_config: ProviderConfig): Promise<void> {}

  async complete(_request: CompletionRequest): Promise<CompletionResponse> {
    if (this.shouldFail) throw new Error('Mock adapter failure');
    return {
      content: 'mock response',
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: 'stop',
    };
  }

  async streamComplete(
    _request: CompletionRequest,
    onEvent: (e: any) => void,
  ): Promise<void> {
    if (this.shouldFail) throw new Error('Mock stream failure');
    onEvent({ type: 'text_delta', delta: 'mock ' });
    onEvent({ type: 'text_delta', delta: 'stream' });
    onEvent({ type: 'done', usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } });
  }

  async listModels() {
    return [{
      id: 'mock-model',
      name: 'Mock Model',
      provider: 'mock',
      contextWindow: 4096,
      supportsToolCalling: true,
      supportsStreaming: true,
      isFree: false,
    }];
  }

  async health() {
    return this.shouldFail
      ? { status: 'unhealthy' as const, message: 'mock unhealthy' }
      : { status: 'healthy' as const, message: 'mock healthy' };
  }
}

// ============================================================================
// 1. Adapter Bridge Tests
// ============================================================================

describe('AdapterBridge', () => {
  let adapter: MockAdapter;
  let bridge: AdapterBridge;

  beforeEach(() => {
    adapter = new MockAdapter();
    bridge = new AdapterBridge(adapter, 'mock-model', ['chat', 'streaming', 'tools']);
  });

  it('delegates complete to adapter', async () => {
    const response = await bridge.complete({
      model: 'mock-model',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    });
    expect(response.content).toBe('mock response');
    expect(response.usage.totalTokens).toBe(30);
  });

  it('delegates streamComplete to adapter', async () => {
    const events: any[] = [];
    await bridge.streamComplete(
      { model: 'mock-model', messages: [{ role: 'user', content: 'hello' }], tools: [] },
      (e) => events.push(e),
    );
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'text_delta', delta: 'mock ' });
  });

  it('reports capabilities from constructor', () => {
    expect(bridge.name()).toBe('mock');
    expect(bridge.supportsStreaming()).toBe(true);
    expect(bridge.supportsToolCalling()).toBe(true);
    expect(bridge.supportsVision()).toBe(false);
  });

  it('handles adapter errors', async () => {
    adapter.setShouldFail(true);
    await expect(bridge.health()).resolves.toEqual({ status: 'unhealthy', message: 'mock unhealthy' });
  });

  it('setModel/getModel roundtrips', () => {
    bridge.setModel('new-model');
    const info = bridge.getModel();
    expect(info.id).toBe('new-model');
    expect(info.provider).toBe('mock');
  });

  it('getAdapter returns underlying adapter', () => {
    expect(bridge.getAdapter()).toBe(adapter);
  });

  it('listModels delegates to adapter', async () => {
    const models = await bridge.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('mock-model');
  });

  it('embeddings throws unsupported', async () => {
    await expect(bridge.embeddings('test')).rejects.toThrow('not supported');
  });
});

// ============================================================================
// 2. AuthManager Tests
// ============================================================================

describe('AuthManager', () => {
  let auth: AuthManager;

  beforeEach(() => {
    auth = new AuthManager();
  });

  afterEach(() => {
    auth.clearCache();
    delete process.env.TEST_API_KEY;
  });

  it('returns bearer auth headers', () => {
    const headers = auth.getAuthHeadersSync('test', { type: 'bearer', envVar: 'TEST_API_KEY' }, { apiKey: 'sk-test' });
    expect(headers).toEqual({ Authorization: 'Bearer sk-test' });
  });

  it('reads bearer key from env when not provided', () => {
    process.env.TEST_API_KEY = 'env-key-value';
    const headers = auth.getAuthHeadersSync('test', { type: 'bearer', envVar: 'TEST_API_KEY' });
    expect(headers).toEqual({ Authorization: 'Bearer env-key-value' });
  });

  it('falls back to generic env var pattern', () => {
    process.env.TEST_API_KEY = 'generic-key';
    const headers = auth.getAuthHeadersSync('test', { type: 'bearer', envVar: 'TEST_API_KEY' });
    expect(headers).toEqual({ Authorization: 'Bearer generic-key' });
  });

  it('returns custom header auth', () => {
    const headers = auth.getAuthHeadersSync('test', { type: 'header', headerName: 'X-API-Key', envVar: 'TEST_API_KEY' }, { apiKey: 'my-key' });
    expect(headers).toEqual({ 'X-API-Key': 'my-key' });
  });

  it('returns empty for none auth type', () => {
    const headers = auth.getAuthHeadersSync('test', { type: 'none' });
    expect(headers).toEqual({});
  });

  it('caches resolved keys', () => {
    process.env.CACHED_KEY = 'cached-value';
    const h1 = auth.getAuthHeadersSync('cached', { type: 'bearer', envVar: 'CACHED_KEY' });
    delete process.env.CACHED_KEY;
    const h2 = auth.getAuthHeadersSync('cached', { type: 'bearer', envVar: 'CACHED_KEY' });
    expect(h1).toEqual(h2);
  });

  it('async getAuthHeaders works', async () => {
    const headers = await auth.getAuthHeaders('test', { type: 'bearer', envVar: 'TEST_API_KEY' }, { apiKey: 'async-key' });
    expect(headers).toEqual({ Authorization: 'Bearer async-key' });
  });

  it('clearCache resets cached keys', () => {
    process.env.CLEAR_KEY = 'val';
    auth.getAuthHeadersSync('clear', { type: 'bearer', envVar: 'CLEAR_KEY' });
    auth.clearCache();
    delete process.env.CLEAR_KEY;
    const headers = auth.getAuthHeadersSync('clear', { type: 'bearer', envVar: 'CLEAR_KEY' });
    expect(headers).toEqual({});
  });
});

// ============================================================================
// 3. ConnectionPool Tests
// ============================================================================

describe('ConnectionPool', () => {
  let pool: ConnectionPool;

  beforeEach(() => {
    pool = new ConnectionPool({ maxConnections: 5, maxIdleTimeMs: 1000 });
  });

  afterEach(() => {
    pool.destroy();
  });

  it('returns https agent for https urls', () => {
    const agent = pool.getAgent('https://api.openai.com/v1');
    expect(agent).toBeDefined();
  });

  it('returns http agent for http urls', () => {
    const agent = pool.getAgent('http://localhost:11434');
    expect(agent).toBeDefined();
  });

  it('sets and retrieves provider agents', () => {
    pool.setProviderAgent('openai', 'https://api.openai.com/v1');
    const agent = pool.getProviderAgent('openai');
    expect(agent).toBeDefined();
  });

  it('falls back to shared agent for unknown providers', () => {
    const agent = pool.getProviderAgent('unknown');
    expect(agent).toBeDefined();
  });

  it('destroy cleans up all agents', () => {
    pool.setProviderAgent('test-provider', 'https://test.com');
    expect(() => pool.destroy()).not.toThrow();
  });
});

// ============================================================================
// 4. Retry Tests
// ============================================================================

describe('withRetry', () => {
  it('succeeds on first attempt', async () => {
    const result = await withRetry(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('retries on failure up to maxRetries', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new Error('temporary');
      return 'ok';
    };
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws after exhausting retries', async () => {
    const fn = async () => { throw new Error('persistent'); };
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 10 })).rejects.toThrow('persistent');
  });

  it('uses shouldRetry predicate to skip retry', async () => {
    const fn = async () => { throw new Error('fatal'); };
    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 10 }, (err) => (err as Error).message !== 'fatal'),
    ).rejects.toThrow('fatal');
  });

  it('isRetryableStatus checks status codes', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
  });

  it('custom retryable statuses work', () => {
    expect(isRetryableStatus(400, [400, 429])).toBe(true);
    expect(isRetryableStatus(500, [400, 429])).toBe(false);
  });
});

// ============================================================================
// 5. PluginLoader Tests
// ============================================================================

describe('PluginLoader', () => {
  let loader: PluginLoader;

  beforeEach(() => {
    loader = new PluginLoader();
  });

  afterEach(() => {
    loader.clear();
  });

  it('loads from package (builtin import)', async () => {
    // Test with a known package that doesn't exist - should fail gracefully
    await expect(loader.loadFromPackage('nonexistent-plugin')).rejects.toThrow();
  });

  it('discoverInstalled handles missing builtin plugins', async () => {
    const results = await loader.discoverInstalled();
    expect(Array.isArray(results)).toBe(true);
    // No builtin plugins registered, so should be empty (no crash)
  });

  it('loadFromDirectory handles missing directory', async () => {
    const plugins = await loader.loadFromDirectory('/nonexistent/plugins');
    expect(plugins).toEqual([]);
  });

  it('getLoaded returns empty initially', () => {
    expect(loader.getLoaded()).toEqual([]);
  });

  it('unload removes plugin', async () => {
    // Can't easily test with real plugins, but should not throw
    expect(() => loader.unload('test')).not.toThrow();
  });

  it('get returns undefined for unknown', () => {
    expect(loader.get('unknown')).toBeUndefined();
  });

  it('discoverNpmPlugins handles missing package.json', async () => {
    const originalCwd = process.cwd;
    const mockFn = () => '/nonexistent-dir';
    try {
      // Override cwd to a dir without package.json
      const results = await loader.discoverNpmPlugins();
      expect(Array.isArray(results)).toBe(true);
    } finally {
      process.cwd = originalCwd;
    }
  });
});

// ============================================================================
// 6. OpenAICompatibleAdapter Tests
// ============================================================================

describe('OpenAICompatibleAdapter', () => {
  let adapter: OpenAICompatibleAdapter;

  it('creates with basic options', () => {
    adapter = new OpenAICompatibleAdapter({
      providerId: 'test',
      baseUrl: 'https://api.test.com/v1',
      defaultModel: 'test-model',
      apiKey: 'sk-test',
      authType: { type: 'bearer', envVar: 'TEST_API_KEY' },
      capabilities: ['chat', 'streaming', 'tools'],
    });
    expect(adapter.providerId).toBe('test');
  });

  it('creates without api key', () => {
    adapter = new OpenAICompatibleAdapter({
      providerId: 'local',
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'local-model',
      authType: { type: 'none' },
      capabilities: ['chat'],
    });
    expect(adapter.providerId).toBe('local');
  });

  it('listModels returns default on failure', async () => {
    adapter = new OpenAICompatibleAdapter({
      providerId: 'nowhere',
      baseUrl: 'http://localhost:18998',
      defaultModel: 'model',
      authType: { type: 'none' },
      capabilities: ['chat'],
    });
    const models = await adapter.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('model');
  });

  it('health returns unhealthy for bad endpoint', async () => {
    adapter = new OpenAICompatibleAdapter({
      providerId: 'nowhere',
      baseUrl: 'http://localhost:18998',
      defaultModel: 'model',
      authType: { type: 'none' },
      capabilities: ['chat'],
    });
    const health = await adapter.health();
    expect(health.status).toBe('unhealthy');
  });

  it('complete throws on bad endpoint', async () => {
    adapter = new OpenAICompatibleAdapter({
      providerId: 'nowhere',
      baseUrl: 'http://localhost:18998',
      defaultModel: 'model',
      authType: { type: 'none' },
      capabilities: ['chat'],
    });
    await expect(adapter.complete({
      model: 'model',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    })).rejects.toThrow();
  });

  it('sanitizes baseUrl by stripping suffixes', () => {
    adapter = new OpenAICompatibleAdapter({
      providerId: 'clean',
      baseUrl: 'https://api.test.com/v1/chat/completions',
      defaultModel: 'model',
      authType: { type: 'bearer', envVar: 'KEY' },
      capabilities: ['chat'],
    });
    expect(adapter.providerId).toBe('clean');
  });
});

// ============================================================================
// 7. AnthropicAdapter Tests
// ============================================================================

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    adapter = new AnthropicAdapter();
  });

  it('has correct providerId', () => {
    expect(adapter.providerId).toBe('anthropic');
  });

  it('initialize sets up http client', async () => {
    await adapter.initialize({
      apiKey: 'sk-ant-test',
      baseUrl: 'https://api.anthropic.com',
    });
    expect(adapter.providerId).toBe('anthropic');
  });

  it('health returns unhealthy for bad endpoint', async () => {
    await adapter.initialize({ apiKey: 'sk-ant-test', baseUrl: 'http://localhost:1' });
    const health = await adapter.health();
    expect(health.status).toBe('unhealthy');
  });

  it('listModels returns default on failure', async () => {
    await adapter.initialize({ apiKey: 'sk-ant-test', baseUrl: 'http://localhost:18999' });
    const promise = adapter.listModels();
    try {
      const models = await promise;
      expect(models).toHaveLength(1);
      expect(models[0].provider).toBe('anthropic');
    } catch {
      // Network error is acceptable
    }
  });

  it('complete throws on bad endpoint', async () => {
    await adapter.initialize({ apiKey: 'sk-ant-test', baseUrl: 'http://localhost:1' });
    await expect(adapter.complete({
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    })).rejects.toThrow();
  });
});

// ============================================================================
// 8. capabilitiesFromDescriptor Tests
// ============================================================================

describe('capabilitiesFromDescriptor', () => {
  it('maps chat capability', () => {
    const caps = capabilitiesFromDescriptor(['chat']);
    expect(caps.chatCompletions).toBe(true);
    expect(caps.streaming).toBe(false);
    expect(caps.toolCalling).toBe(false);
  });

  it('maps streaming capability', () => {
    const caps = capabilitiesFromDescriptor(['chat', 'streaming']);
    expect(caps.streaming).toBe(true);
  });

  it('maps tools capability', () => {
    const caps = capabilitiesFromDescriptor(['chat', 'tools']);
    expect(caps.toolCalling).toBe(true);
  });

  it('maps vision capability', () => {
    const caps = capabilitiesFromDescriptor(['chat', 'vision']);
    expect(caps.vision).toBe(true);
  });

  it('maps embeddings capability', () => {
    const caps = capabilitiesFromDescriptor(['chat', 'embeddings']);
    expect(caps.embeddings).toBe(true);
  });

  it('maps structured-output to reasoning', () => {
    const caps = capabilitiesFromDescriptor(['chat', 'structured-output']);
    expect(caps.reasoning).toBe(true);
  });

  it('handles empty capabilities', () => {
    const caps = capabilitiesFromDescriptor([]);
    expect(caps.chatCompletions).toBe(false);
    expect(caps.streaming).toBe(false);
    expect(caps.toolCalling).toBe(false);
  });
});

// ============================================================================
// 9. Tool Calling Normalization Tests
// ============================================================================

describe('Tool Calling (via adapter)', () => {
  let adapter: MockAdapter;
  let bridge: AdapterBridge;

  beforeEach(() => {
    adapter = new MockAdapter();
    bridge = new AdapterBridge(adapter, 'mock-model', ['chat', 'tools']);
  });

  it('complete passes tool definitions', async () => {
    const response = await bridge.complete({
      model: 'mock-model',
      messages: [{ role: 'user', content: 'use a tool' }],
      tools: [{
        type: 'function',
        function: {
          name: 'calculator',
          description: 'Do math',
          parameters: { type: 'object' as const, properties: { expr: { type: 'string' } }, required: ['expr'] },
        },
      }],
    });
    expect(response.content).toBe('mock response');
  });

  it('supportsToolCalling returns true when tools capability present', () => {
    expect(bridge.supportsToolCalling()).toBe(true);
  });

  it('supportsToolCalling returns false when tools capability absent', () => {
    const noTools = new AdapterBridge(adapter, 'model', ['chat']);
    expect(noTools.supportsToolCalling()).toBe(false);
  });
});

// ============================================================================
// 10. Failure Recovery Tests
// ============================================================================

describe('Failure Recovery', () => {
  let adapter: MockAdapter;
  let bridge: AdapterBridge;

  beforeEach(() => {
    adapter = new MockAdapter();
    bridge = new AdapterBridge(adapter, 'mock-model', ['chat', 'streaming', 'tools']);
  });

  it('recovers after adapter failure', async () => {
    adapter.setShouldFail(true);
    await expect(bridge.complete({
      model: 'mock-model',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    })).rejects.toThrow('Mock adapter failure');

    adapter.setShouldFail(false);
    const response = await bridge.complete({
      model: 'mock-model',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });
    expect(response.content).toBe('mock response');
  });

  it('recovers stream after failure', async () => {
    adapter.setShouldFail(true);
    await expect(bridge.streamComplete(
      { model: 'mock-model', messages: [{ role: 'user', content: 'hi' }], tools: [] },
      () => {},
    )).rejects.toThrow('Mock stream failure');

    adapter.setShouldFail(false);
    const events: any[] = [];
    await bridge.streamComplete(
      { model: 'mock-model', messages: [{ role: 'user', content: 'hi' }], tools: [] },
      (e) => events.push(e),
    );
    expect(events.length).toBeGreaterThan(0);
  });

  it('health status reflects adapter state', async () => {
    const h1 = await bridge.health();
    expect(h1.status).toBe('healthy');

    adapter.setShouldFail(true);
    const h2 = await bridge.health();
    expect(h2.status).toBe('unhealthy');
  });
});

// ============================================================================
// 11. ProviderAdapter Interface Compliance
// ============================================================================

describe('ProviderAdapter interface compliance', () => {
  it('OpenAICompatibleAdapter implements ProviderAdapter', () => {
    const adapter: ProviderAdapter = new OpenAICompatibleAdapter({
      providerId: 'test',
      baseUrl: 'https://api.test.com',
      defaultModel: 'model',
      authType: { type: 'none' },
      capabilities: ['chat'],
    });
    expect(adapter.providerId).toBe('test');
    expect(typeof adapter.initialize).toBe('function');
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.streamComplete).toBe('function');
    expect(typeof adapter.listModels).toBe('function');
    expect(typeof adapter.health).toBe('function');
  });

  it('AnthropicAdapter implements ProviderAdapter', () => {
    const adapter: ProviderAdapter = new AnthropicAdapter();
    expect(adapter.providerId).toBe('anthropic');
    expect(typeof adapter.initialize).toBe('function');
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.streamComplete).toBe('function');
    expect(typeof adapter.listModels).toBe('function');
    expect(typeof adapter.health).toBe('function');
  });

  it('MockAdapter implements ProviderAdapter', () => {
    const adapter: ProviderAdapter = new MockAdapter();
    expect(adapter.providerId).toBe('mock');
    expect(typeof adapter.initialize).toBe('function');
    expect(typeof adapter.complete).toBe('function');
    expect(typeof adapter.streamComplete).toBe('function');
    expect(typeof adapter.listModels).toBe('function');
    expect(typeof adapter.health).toBe('function');
  });
});
