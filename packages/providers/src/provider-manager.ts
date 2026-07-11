import type { LLMProvider } from './base.js';
import type { LibreConfig, ProviderEntry, HealthCheckResult } from 'librecode-types';
import { ConfigurationManager } from './configuration-manager.js';
import { ProviderRegistry } from './provider-registry.js';
import { ProviderFactory } from './provider-factory.js';
import { ProviderRouter } from './provider-router.js';
import { FreeModelsProvider } from './free-models.js';

export interface ActiveProviderInfo {
  id: string;
  model: string;
  type: 'single' | 'free';
}

export class ProviderManager {
  private configManager: ConfigurationManager;
  private registry: ProviderRegistry;
  private factory: ProviderFactory;
  private router: ProviderRouter;
  private freeModels: FreeModelsProvider;
  private currentProvider: ActiveProviderInfo | null;

  constructor() {
    this.configManager = new ConfigurationManager();
    this.registry = new ProviderRegistry();
    this.factory = new ProviderFactory(this.registry);
    this.router = new ProviderRouter();
    this.freeModels = new FreeModelsProvider();
    this.currentProvider = null;
  }

  configFilePath(): string {
    return this.configManager.configFilePath();
  }

  isConfigured(): boolean {
    const config = this.configManager.load();
    if (config.defaultProvider === 'free') {
      return Object.values(config.providers).some((p) => p.enabled);
    }
    return !!config.providers[config.defaultProvider]?.enabled;
  }

  isFirstRun(): boolean {
    return !this.configManager.isConfigured();
  }

  getConfig(): LibreConfig {
    return this.configManager.load();
  }

  saveConfig(config: LibreConfig): void {
    this.configManager.save(config);
  }

  getRegistry(): ProviderRegistry {
    return this.registry;
  }

  async initialize(): Promise<ActiveProviderInfo | null> {
    const config = this.configManager.load();
    const defaultProvider = config.defaultProvider ?? 'free';

    if (defaultProvider === 'free') {
      return this.initializeFree();
    }
    return this.initializeSingle(defaultProvider);
  }

  private async initializeSingle(id: string): Promise<ActiveProviderInfo | null> {
    const config = this.configManager.load();
    const entry = config.providers[id];
    if (!entry?.enabled) return null;

    try {
      const provider = this.factory.create(id, {
        ...entry,
        enabled: true,
      });

      this.router = new ProviderRouter();
      this.router.addProvider(id, provider, 10);
      this.currentProvider = {
        id,
        model: entry.defaultModel ?? this.registry.get(id)?.defaultModel ?? 'gpt-4o',
        type: 'single',
      };
      return this.currentProvider;
    } catch {
      return null;
    }
  }

  private async initializeFree(): Promise<ActiveProviderInfo | null> {
    const config = this.configManager.load();
    this.freeModels = new FreeModelsProvider();
    this.router = new ProviderRouter();

    const enabled = Object.entries(config.providers).filter(([, v]) => v.enabled);

    let freeCount = 0;
    for (const [name, entry] of enabled) {
      if (!this.registry.exists(name)) continue;

      try {
        const provider = this.factory.create(name, {
          ...entry,
          enabled: true,
        });

        if (this.registry.hasFreeTier(name) || !this.registry.requiresApiKey(name)) {
          this.freeModels.registerFreeProvider(name, provider);
          freeCount++;
        }

        const priority = this.registry.hasFreeTier(name) ? 10 : this.registry.requiresApiKey(name) ? 20 : 30;
        this.router.addProvider(name, provider, priority);
      } catch {
        continue;
      }
    }

    if (freeCount > 0) {
      this.currentProvider = {
        id: 'free',
        model: 'auto (free models)',
        type: 'free',
      };
      return this.currentProvider;
    }

    if (this.router.listProviders().length > 0) {
      const firstId = this.router.listProviders()[0]!;
      this.currentProvider = {
        id: firstId,
        model: config.providers[firstId]?.defaultModel ?? 'gpt-4o',
        type: 'single',
      };
      return this.currentProvider;
    }

    return null;
  }

  getActiveProvider(): ActiveProviderInfo | null {
    return this.currentProvider;
  }

  getProvider(): LLMProvider {
    if (this.currentProvider?.type === 'free' && this.freeModels.hasFreeProviders()) {
      return this.freeModels;
    }
    return this.router;
  }

  getRouter(): ProviderRouter {
    return this.router;
  }

  async checkHealth(): Promise<Map<string, HealthCheckResult>> {
    return this.router.checkAllHealth();
  }

  async switchProvider(id: string): Promise<boolean> {
    const config = this.configManager.load();

    if (id === 'free') {
      config.defaultProvider = 'free';
      this.configManager.save(config);
      await this.initialize();
      return true;
    }

    if (!this.registry.exists(id)) return false;

    const entry = config.providers[id];
    if (!entry) {
      config.providers[id] = { enabled: true };
    } else {
      config.providers[id] = { ...entry, enabled: true };
    }
    config.defaultProvider = id;
    this.configManager.save(config);
    return (await this.initializeSingle(id)) !== null;
  }

  async testProvider(id: string): Promise<HealthCheckResult> {
    const config = this.configManager.load();
    const entry = config.providers[id];
    if (!entry?.enabled) {
      return { available: false, error: `Provider '${id}' is not configured or not enabled` };
    }

    try {
      const provider = this.factory.create(id, { ...entry, enabled: true });
      const testRouter = new ProviderRouter();
      testRouter.addProvider(id, provider, 10);
      return testRouter.checkHealth(id);
    } catch (err) {
      return {
        available: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
