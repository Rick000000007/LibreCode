import { describe, it, expect, vi } from 'vitest';
import { ProviderRegistry } from '../provider-registry.js';
import { printProviderList, printProviderCurrent, restoreCustomProviders, handleProviderLogout } from '../cli-commands.js';
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

describe('cli-commands', () => {
  // ... (existing printProviderList and printProviderCurrent tests)

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

  describe('handleProviderLogout', () => {
    it('removes configured provider', async () => {
      const registry = new ProviderRegistry();
      const cm = makeConfigManager({
        providers: {
          openai: { enabled: true, apiKey: 'sk-test' },
        },
      });
      const config = cm.load();
      
      // Mock output
      const originalWrite = process.stdout.write;
      process.stdout.write = vi.fn();
      
      await handleProviderLogout('openai', registry, cm);
      
      expect(cm.load().providers['openai']).toBeUndefined();
      process.stdout.write = originalWrite;
    });

    it('rejects provider that is in registry but not in config', async () => {
      const registry = new ProviderRegistry();
      const cm = makeConfigManager({ providers: {} });
      
      const originalWrite = process.stdout.write;
      process.stdout.write = vi.fn();
      
      await handleProviderLogout('openai', registry, cm);
      
      expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('is not configured'));
      process.stdout.write = originalWrite;
    });
  });
});
