import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderRegistry, ConfigurationManager, ProviderFactory, ProviderDiscovery, ProviderManager, AutoRouter, ModelRegistry, StreamingEngine, ConversationStore } from 'librecode-providers';
import { Agent } from 'librecode-core';
import { ToolRegistry, PermissionChecker } from 'librecode-tools';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('LibreCode Smoke Test (No Credentials)', () => {
  const testConfigDir = path.join(os.tmpdir(), '.librecode-smoke-test');
  const testConfigPath = path.join(testConfigDir, 'config.json');
  
  beforeEach(() => {
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  it('Verifies startup, setup, configuration, and provider detection', async () => {
    // 1. Startup & Setup
    const registry = new ProviderRegistry();
    const configManager = new ConfigurationManager(testConfigDir);
    
    expect(configManager.isConfigured()).toBe(false);
    let config = configManager.load();
    expect(config.defaultProvider).toBe('free');
    
    config = { defaultProvider: 'free', providers: {} };
    configManager.save(config);
    expect(fs.existsSync(testConfigPath)).toBe(true);

    const modelRegistry = new ModelRegistry();
    const autoRouter = new AutoRouter(modelRegistry, {} as any);
    const factory = new ProviderFactory(registry);
    const streamingEngine = new StreamingEngine();
    const store = new ConversationStore(':memory:');

    const providerManager = new ProviderManager(
      configManager, registry, modelRegistry, autoRouter, streamingEngine, store, factory
    );

    await providerManager.initialize();

    // 2. Provider Detection
    const discovery = new ProviderDiscovery(providerManager.getModelRegistry());
    const discovered = await discovery.discoverAll(registry.all());
    expect(Array.isArray(discovered)).toBe(true);
    
    // 3. Command Routing (mock check)
    const agent = new Agent(
      providerManager,
      new ToolRegistry(),
      new PermissionChecker(configManager),
      store
    );
    expect(agent).toBeDefined();

    // 4. Graceful termination
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });
});
