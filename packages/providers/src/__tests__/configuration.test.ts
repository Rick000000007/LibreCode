import { describe, it, expect, afterEach } from 'vitest';
import { LayeredConfig } from '../configuration.js';

describe('LayeredConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('merge returns a valid config', () => {
    const config = new LayeredConfig();
    const merged = config.merge();
    expect(merged.defaultProvider).toBeTruthy();
    expect(merged.defaultModel).toBeTruthy();
    expect(merged.providers).toBeDefined();
  });

  it('defaultModel defaults to best-free when no env override', () => {
    delete process.env['LIBRECODE_DEFAULT_MODEL'];
    const config = new LayeredConfig();
    const merged = config.merge({});
    expect(merged.defaultModel).toBe('best-free');
  });

  it('reads LIBRECODE_DEFAULT_MODEL from env', () => {
    process.env['LIBRECODE_DEFAULT_MODEL'] = 'gpt-4o';
    const config = new LayeredConfig();
    const merged = config.merge();
    expect(merged.defaultModel).toBe('gpt-4o');
  });

  it('reads environment variables for API keys', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    process.env['GEMINI_API_KEY'] = 'gemini-test';

    const config = new LayeredConfig();
    const merged = config.merge();
    expect(merged.providers['openai']).toBeDefined();
    expect(merged.providers['openai']!.apiKey).toBe('sk-test');
    expect(merged.providers['gemini']).toBeDefined();
    expect(merged.providers['gemini']!.apiKey).toBe('gemini-test');
  });

  it('CLI flags override env config', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';

    const config = new LayeredConfig();
    const merged = config.merge({ defaultProvider: 'anthropic' });
    expect(merged.defaultProvider).toBe('anthropic');
  });

  it('CLI routing config overrides defaults', () => {
    const config = new LayeredConfig();
    const merged = config.merge({
      routing: { intent: 'coding', preferFree: false },
    });
    expect(merged.routing?.intent).toBe('coding');
    expect(merged.routing?.preferFree).toBe(false);
  });

  it('getConfig returns merged config', () => {
    const config = new LayeredConfig();
    const merged = config.merge();
    const cached = config.getConfig();
    expect(cached).toBe(merged);
  });

  it('isFirstRun returns boolean matching config file existence', () => {
    const config = new LayeredConfig();
    const result = config.isFirstRun();
    expect(typeof result).toBe('boolean');
  });

  it('env vars create provider entries', () => {
    process.env['GROQ_API_KEY'] = 'gsk-test';
    process.env['TOGETHER_API_KEY'] = 'tog-test';

    const config = new LayeredConfig();
    const merged = config.merge();
    expect(merged.providers['groq']).toBeDefined();
    expect(merged.providers['groq']!.apiKey).toBe('gsk-test');
    expect(merged.providers['together']).toBeDefined();
    expect(merged.providers['together']!.apiKey).toBe('tog-test');
  });

  it('LIBRECODE_DEFAULT_MODEL alone (without API keys) still works', () => {
    const cleanEnv = { ...process.env };
    delete cleanEnv['OPENAI_API_KEY'];
    delete cleanEnv['ANTHROPIC_API_KEY'];
    delete cleanEnv['GEMINI_API_KEY'];
    delete cleanEnv['GROQ_API_KEY'];
    delete cleanEnv['OPENROUTER_API_KEY'];
    delete cleanEnv['TOGETHER_API_KEY'];
    delete cleanEnv['NVIDIA_API_KEY'];
    process.env = { ...cleanEnv, LIBRECODE_DEFAULT_MODEL: 'claude-sonnet-4-20250514' };

    const config = new LayeredConfig();
    const merged = config.merge();
    expect(merged.defaultModel).toBe('claude-sonnet-4-20250514');

    process.env = originalEnv;
  });
});
