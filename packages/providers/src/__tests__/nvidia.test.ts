import { ProviderRegistry } from '../provider-registry.js';
import { ProviderFactory } from '../provider-factory.js';
import { LlmError } from '../base.js';

describe('NVIDIA provider', () => {
  const registry = new ProviderRegistry();
  const factory = new ProviderFactory(registry);

  test('creates provider instance', () => {
    const provider = factory.create('nvidia', {
      enabled: true,
      apiKey: 'nvapi-abcdef123456',
      defaultModel: 'meta/llama-3.1-8b-instruct',
    });
    expect(provider.name()).toBe('nvidia');
    expect(provider.supportsStreaming()).toBe(true);
    // default model should be set
    expect(provider.getModel?.().id).toBe('meta/llama-3.1-8b-instruct');
  });

  test('missing API key throws auth error', () => {
    expect(() => {
      factory.create('nvidia', { enabled: true });
    }).toThrow(LlmError);
  });
});
