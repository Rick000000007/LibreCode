import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../provider-registry.js';
import { printProviderList, printProviderCurrent, restoreCustomProviders } from '../cli-commands.js';
import { ConfigurationManager } from '../configuration-manager.js';
import type { LibreConfig } from 'librecode-types';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

function makeConfigManager(config?: Partial<LibreConfig>): ConfigurationManager {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'librecode-test-'));
  const cm = new ConfigurationManager(dir);
  const full: LibreConfig = { defaultProvider: 'free', providers: {}, ...config };
  cm.save(full);
  return cm;
}

describe('printProviderList', () => {
  it('returns message when no providers configured', () => {
    const registry = new ProviderRegistry();
    const config = { defaultProvider: 'free', providers: {} };
    const output = printProviderList(config, registry);
    expect(output).toContain('No providers configured');
  });

  it('lists configured providers with status', () => {
    const registry = new ProviderRegistry();
    const config = {
      defaultProvider: 'openai',
      providers: {
        openai: { enabled: true, apiKey: 'sk-abc12345xyz78901', defaultModel: 'gpt-4o' },
      },
    };
    const output = printProviderList(config, registry);
    expect(output).toContain('OpenAI');
    expect(output).toContain('enabled');
    expect(output).toContain('default');
    expect(output).toContain('sk-abc12');
  });
});

describe('printProviderCurrent', () => {
  it('shows no active provider when no providers configured', () => {
    const registry = new ProviderRegistry();
    const config = { defaultProvider: 'free', providers: {} };
    const output = printProviderCurrent(config, registry);
    expect(output).toContain('No active provider');
  });

  it('shows free model routing when free providers are enabled', () => {
    const registry = new ProviderRegistry();
    const config = {
      defaultProvider: 'free',
      providers: {
        gemini: { enabled: true, apiKey: 'test-key' },
      },
    };
    const output = printProviderCurrent(config, registry);
    expect(output).toContain('Free Models');
    expect(output).toContain('Gemini');
  });

  it('shows provider details when configured', () => {
    const registry = new ProviderRegistry();
    const config = {
      defaultProvider: 'openai',
      providers: {
        openai: { enabled: true, apiKey: 'sk-test-key-12345678', defaultModel: 'gpt-4o' },
      },
    };
    const output = printProviderCurrent(config, registry);
    expect(output).toContain('OpenAI');
    expect(output).toContain('gpt-4o');
  });
});

describe('restoreCustomProviders', () => {
  it('restores custom providers from config on startup', () => {
    const registry = new ProviderRegistry();
    const cm = makeConfigManager({
      providers: {
        'my-custom': {
          enabled: true,
          endpoint: 'https://my-custom.example.com/v1',
          defaultModel: 'my-model',
          apiKey: 'sk-custom',
        },
      },
    });
    const count = restoreCustomProviders(registry, cm);
    expect(count).toBe(1);
    expect(registry.isCustom('my-custom')).toBe(true);
    expect(registry.getBaseUrl('my-custom')).toBe('https://my-custom.example.com/v1');
  });

  it('skips built-in provider IDs', () => {
    const registry = new ProviderRegistry();
    const cm = makeConfigManager({
      providers: {
        openai: { enabled: true, endpoint: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
      },
    });
    const count = restoreCustomProviders(registry, cm);
    expect(count).toBe(0);
    expect(registry.isCustom('openai')).toBe(false);
  });
});
