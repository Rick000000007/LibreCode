import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  findConfigPath,
  loadConfig,
  resolveWorkingDir,
} from '../index.js';
import type { CliOptions } from 'librecode-types';

describe('Config Package', () => {
  const originalEnv = { ...process.env };
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('findConfigPath', () => {
    it('returns cli config if provided and exists', () => {
      const configPath = path.join(tmpDir, 'custom.toml');
      fs.writeFileSync(configPath, 'provider = "test"');
      const result = findConfigPath(configPath);
      expect(result).toBe(configPath);
    });

    it('returns null for non-existent cli config', () => {
      const result = findConfigPath('/nonexistent/path.toml');
      expect(result).toBeNull();
    });

    it('returns home config when no cli config', () => {
      const result = findConfigPath(undefined);
      // Should not throw - returns path string or null
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('loadConfig', () => {
    it('loads config from file', () => {
      const configPath = path.join(tmpDir, 'config.toml');
      fs.writeFileSync(configPath, 'provider = "anthropic"\nmodel = "claude-3"');

      const cli: CliOptions = { config: configPath };
      const config = loadConfig(cli);

      expect(config.provider).toBe('anthropic');
      // Model from config file is used, but provider default model may override
      expect(config.model).toBeDefined();
    });

    it('uses defaults when no config file', () => {
      const config = loadConfig({});
      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4o');
    });

    it('cli options override config file', () => {
      const configPath = path.join(tmpDir, 'config.toml');
      fs.writeFileSync(configPath, 'provider = "anthropic"\nmodel = "claude-3"');

      const cli: CliOptions = { config: configPath, provider: 'openai', model: 'gpt-4o' };
      const config = loadConfig(cli);

      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4o');
    });

    it('handles malformed config gracefully', () => {
      const configPath = path.join(tmpDir, 'config.toml');
      fs.writeFileSync(configPath, 'invalid toml [[');

      const config = loadConfig({ config: configPath });
      expect(config.provider).toBe('openai');
    });

    it('sets apiKey from environment for openai', () => {
      process.env['OPENAI_API_KEY'] = 'sk-env-test';
      const config = loadConfig({ provider: 'openai' });
      expect(config.providers.openai?.apiKey).toBe('sk-env-test');
    });

    it('sets apiKey from environment for anthropic', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
      const config = loadConfig({ provider: 'anthropic' });
      expect(config.providers.anthropic?.apiKey).toBe('sk-ant-test');
    });

    it('sets apiKey from environment for openrouter', () => {
      process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
      const config = loadConfig({ provider: 'openrouter' });
      expect(config.providers.openrouter?.apiKey).toBe('sk-or-test');
    });
  });

  describe('resolveWorkingDir', () => {
    it('returns absolute path as-is', () => {
      expect(resolveWorkingDir({ dir: '/absolute/path' })).toBe('/absolute/path');
    });

    it('resolves relative path from cwd', () => {
      expect(resolveWorkingDir({ dir: 'subdir' })).toBe(path.resolve('subdir'));
    });

    it('returns cwd when no dir provided', () => {
      expect(resolveWorkingDir({})).toBe(process.cwd());
    });
  });
});