import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderFactory } from '../provider-factory.js';
import { ProviderRegistry } from '../provider-registry.js';

describe('ProviderFactory', () => {
  let registry: ProviderRegistry;
  let factory: ProviderFactory;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    registry = new ProviderRegistry();
    factory = new ProviderFactory(registry);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates OpenAI provider with API key from entry', () => {
    const provider = factory.create('openai', {
      enabled: true,
      apiKey: 'sk-test-key',
      defaultModel: 'gpt-4o',
    });
    expect(provider).toBeDefined();
    expect(provider.name()).toBe('openai');
  });

  it('creates Ollama provider without API key', () => {
    const provider = factory.create('ollama', {
      enabled: true,
    });
    expect(provider).toBeDefined();
    expect(provider.name()).toBe('ollama');
  });

  it('creates free provider', () => {
    const provider = factory.create('free', {
      enabled: true,
    });
    expect(provider).toBeDefined();
    expect(provider.name()).toBe('free');
  });

  it('throws for unknown provider', () => {
    expect(() =>
      factory.create('nonexistent', {
        enabled: true,
      }),
    ).toThrow('Unknown provider');
  });

  it('throws with actionable message listing available providers', () => {
    try {
      factory.create('not-a-provider', { enabled: true });
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('Available providers');
      expect(msg).toContain('openai');
      expect(msg).toContain('ollama');
    }
  });

  it('throws specific auth error when provider requires API key but none provided', () => {
    expect(() =>
      factory.create('openai', {
        enabled: true,
      }),
    ).toThrow(/No API key found for provider 'openai'/);
  });

  it('reads API key from environment variable as fallback', () => {
    process.env['OPENAI_API_KEY'] = 'sk-env-test';
    const provider = factory.create('openai', { enabled: true });
    expect(provider).toBeDefined();
    expect(provider.name()).toBe('openai');
  });

  it('entry API key takes precedence over environment variable', () => {
    process.env['OPENAI_API_KEY'] = 'sk-env-test';
    const provider = factory.create('openai', {
      enabled: true,
      apiKey: 'sk-entry-test',
    });
    expect(provider).toBeDefined();
  });

  it('throws on invalid endpoint URL', () => {
    expect(() =>
      factory.create('openai', {
        enabled: true,
        apiKey: 'sk-test',
        endpoint: 'not-a-url',
      }),
    ).toThrow('Endpoint must start with http:// or https://');
  });

  it('preserves custom headers in created provider', () => {
    const provider = factory.create('openrouter', {
      enabled: true,
      apiKey: 'sk-test',
    });
    expect(provider).toBeDefined();
    expect(provider.name()).toBe('openrouter');
  });

  it('trims provider name', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    const provider = factory.create('  openai  ', {
      enabled: true,
      apiKey: 'sk-test',
    });
    expect(provider.name()).toBe('openai');
  });
});
