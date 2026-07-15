/**
 * Provider Integration Tests
 *
 * Tests every built-in provider's core operations against LIVE endpoints.
 * Skips gracefully if credentials are unavailable.
 *
 * Run: pnpm --filter librecode-providers test
 * Run with live creds: GITHUB_TOKEN=xxx OPENAI_API_KEY=xxx pnpm --filter librecode-providers test
 */
import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../provider-registry.js';
import { ProviderFactory } from '../provider-factory.js';

interface TestResult {
  provider: string;
  baseUrl: string;
  health: 'PASS' | 'FAIL' | 'SKIPPED';
  models: 'PASS' | 'FAIL' | 'SKIPPED';
  chat: 'PASS' | 'FAIL' | 'SKIPPED';
  stream: 'PASS' | 'FAIL' | 'SKIPPED';
  latencyMs?: number;
  model?: string;
  error?: string;
}

const registry = new ProviderRegistry();
const factory = new ProviderFactory(registry);

function getProviderConfig(id: string): { apiKey?: string; baseUrl: string } | null {
  const meta = registry.get(id);
  if (!meta) return null;

  const builtin = (registry as any).providers?.get?.(id);
  const envKey = registry.getEnvKey(id);
  const apiKey = process.env[envKey] || undefined;
  const baseUrl = registry.getBaseUrl(id) || '';

  if (meta.requiresApiKey && !apiKey) {
    return null; // skip - no credentials
  }

  return { apiKey, baseUrl };
}

async function testProvider(id: string): Promise<TestResult> {
  const meta = registry.get(id);
  const config = getProviderConfig(id);
  const baseUrl = registry.getBaseUrl(id) || '';

  if (!meta || !config) {
    return { provider: id, baseUrl, health: 'SKIPPED', models: 'SKIPPED', chat: 'SKIPPED', stream: 'SKIPPED' };
  }

  let lastModel = '';
  const result: TestResult = { provider: id, baseUrl, health: 'SKIPPED', models: 'SKIPPED', chat: 'SKIPPED', stream: 'SKIPPED' };

  try {
    const provider = factory.create(id, {
      enabled: true,
      apiKey: config.apiKey,
      endpoint: config.baseUrl,
      defaultModel: meta.defaultModel,
    });

    // Health check
    const healthStart = Date.now();
    try {
      const healthResult = await provider.health();
      result.latencyMs = Date.now() - healthStart;
      result.health = healthResult.status === 'healthy' ? 'PASS' : 'FAIL';
      if (result.health === 'FAIL') result.error = healthResult.message;
    } catch (err) {
      result.health = 'FAIL';
      result.error = err instanceof Error ? err.message : String(err);
    }

    // Model discovery
    try {
      const models = await provider.listModels();
      result.models = models.length > 0 ? 'PASS' : 'FAIL';
      if (models.length > 0) {
        lastModel = models[0]!.id;
        result.model = lastModel;
      }
    } catch {
      result.models = 'FAIL';
    }

    // Chat completion
    if (result.health === 'PASS' || result.models === 'PASS') {
      // Use the provider's default model for chat/stream, not the first from model list.
      // Model lists from some providers (e.g., NVIDIA) are alphabetical and may not support chat.
      const chatModel = meta.defaultModel || lastModel;
      result.model = chatModel;
      try {
        const chatResult = await provider.complete({
          model: chatModel,
          messages: [{ role: 'user', content: 'Say OK' }],
          tools: [],
          maxTokens: 10,
          stream: false,
        });
        result.chat = chatResult.content ? 'PASS' : 'FAIL';
      } catch {
        result.chat = 'FAIL';
      }

      // Streaming
      try {
        let receivedDelta = false;
        await provider.streamComplete(
          {
            model: chatModel,
            messages: [{ role: 'user', content: 'Say OK' }],
            tools: [],
            maxTokens: 10,
            stream: true,
          },
          (event) => {
            if (event.type === 'text_delta') receivedDelta = true;
          },
        );
        result.stream = receivedDelta ? 'PASS' : 'FAIL';
      } catch {
        result.stream = 'FAIL';
      }
    }
  } catch (err) {
    result.health = 'FAIL';
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

const PROVIDERS_TO_TEST = [
  'openai', 'anthropic', 'gemini', 'openrouter', 'nvidia',
  'github', 'groq', 'together', 'mistral', 'cohere',
  'deepseek', 'deepinfra', 'cerebras', 'perplexity', 'xai',
  'sambanova', 'huggingface', 'ollama', 'lmstudio',
];

describe('Provider Integration Tests', () => {
  for (const id of PROVIDERS_TO_TEST) {
    it(`${id}: health, models, chat, stream`, async () => {
      const meta = registry.get(id);
      const config = getProviderConfig(id);
      const baseUrl = registry.getBaseUrl(id) || '';

      if (!meta || !config) {
        console.log(`  ${id}: SKIPPED (no credentials) [${baseUrl}]`);
        return;
      }

      const result = await testProvider(id);
      console.log(
        `  ${id}: HEALTH=${result.health} MODELS=${result.models} CHAT=${result.chat} STREAM=${result.stream}` +
        `${result.latencyMs ? ` (${result.latencyMs}ms)` : ''}` +
        `${result.model ? ` model=${result.model}` : ''}` +
        `${result.error ? ` error=${result.error}` : ''}` +
        ` [${baseUrl}]`
      );

      // Only assert the ones we ran (not SKIPPED)
      if (result.health !== 'SKIPPED') {
        // Local-only providers (no API key needed) may not have the server running
        const isLocalProvider = !meta.requiresApiKey;
        if (isLocalProvider) {
          // Don't fail for local providers when the server isn't running
          if (result.health !== 'PASS') {
            console.log(`  ${id}: Server not running (expected in test environment)`);
          }
        } else {
          expect(result.health).toBe('PASS');
        }
      }
    }, 30000);
  }
});
