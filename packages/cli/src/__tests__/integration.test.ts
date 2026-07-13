import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { ProviderRegistry, ConfigurationManager, ProviderFactory, ProviderDiscovery, ProviderManager, AutoRouter, ModelRegistry, StreamingEngine, ConversationStore } from 'librecode-providers';
import { Agent } from 'librecode-core';
import { ToolRegistry, PermissionChecker } from 'librecode-tools';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let hasCredentials = false;
let targetProviderId: string | null = null;
const registry = new ProviderRegistry();

beforeAll(async () => {
  const modelRegistry = new ModelRegistry();
  const discovery = new ProviderDiscovery(modelRegistry);
  const discovered = await discovery.discoverAll(registry.all());
  
  for (const p of discovered) {
    if (p.id === 'ollama' || p.id === 'lm-studio') {
      targetProviderId = p.id;
      hasCredentials = true;
      break;
    }
  }

  if (!hasCredentials) {
    for (const meta of registry.all()) {
      if (meta.requiresApiKey && process.env[meta.envKey!]) {
         targetProviderId = meta.id;
         hasCredentials = true;
         break;
      }
    }
  }
});

describe('LibreCode Provider Integration Test', () => {
  const testConfigDir = path.join(os.tmpdir(), '.librecode-integration-test');
  const testConfigPath = path.join(testConfigDir, 'config.json');
  
  beforeEach(() => {
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  it.skipIf(!hasCredentials)('Verifies health, models, chat, streaming, and persistence', async () => {
    if (!targetProviderId) return; // type guard
    
    const configManager = new ConfigurationManager(testConfigDir);
    const config = { defaultProvider: targetProviderId, providers: { [targetProviderId]: { enabled: true } } };
    configManager.save(config);

    const modelRegistry = new ModelRegistry();
    const autoRouter = new AutoRouter(modelRegistry, {} as any);
    const factory = new ProviderFactory(registry);
    const streamingEngine = new StreamingEngine();
    const store = new ConversationStore(':memory:');

    const providerManager = new ProviderManager(
      configManager, registry, modelRegistry, autoRouter, streamingEngine, store, factory
    );

    await providerManager.initialize();
    const providerInstance = providerManager.getProvider();
    expect(providerInstance).toBeDefined();

    // Health
    const health = await providerInstance.checkHealth();
    expect(health.status).toBe('ok');

    // Model Discovery & Selection
    let targetModel = registry.get(targetProviderId)!.defaultModel;
    try {
      const models = await providerInstance.listModels();
      if (models.length > 0) {
        targetModel = models[0].id;
      }
    } catch (e) {
      // ignore
    }
    providerInstance.setModel(targetModel);

    // Chat Request & Streaming
    const agent = new Agent(
      providerManager,
      new ToolRegistry(),
      new PermissionChecker(configManager),
      store
    );

    const iter = await agent.chat("Respond with the exact word: SUCCESS");
    let chunks = 0;
    for await (const chunk of iter) {
      if (chunk.content) chunks++;
    }
    expect(chunks).toBeGreaterThan(0);

    // Conversation persistence
    const usage = agent.contextUsage();
    expect(usage[0]).toBeGreaterThan(0);

    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  }, 30000); // 30s timeout for network requests
});
