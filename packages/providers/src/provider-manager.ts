import type { LLMProvider, ModelInfo } from './base.js';
import type { LibreConfig, HealthCheckResult, CompletionRequest } from 'librecode-types';
import { ConfigurationManager } from './configuration-manager.js';
import { ProviderRegistry } from './provider-registry.js';
import { ProviderFactory } from './provider-factory.js';
import { ProviderRouter } from './provider-router.js';
import { FreeProvider } from './free-models.js';
import { ModelRegistry } from './model-registry.js';
import { AutoRouter } from './auto-router.js';
import { HealthMonitor } from './health-monitor.js';
import { StreamingEngine, StreamCallback } from './streaming-engine.js';
import { FallbackHandler } from './fallback-handler.js';
import { ConversationStore } from './conversation-store.js';
import { ProviderDiscovery, DiscoveredProvider } from './provider-discovery.js';
import { LayeredConfig } from './configuration.js';
import { RoutingIntent } from './model-metadata.js';

export interface ActiveProviderInfo {
  id: string;
  model: string;
  type: 'single' | 'free';
}

export class ProviderManager {
  private configManager: ConfigurationManager;
  private layeredConfig: LayeredConfig;
  private registry: ProviderRegistry;
  private factory: ProviderFactory;
  private router: ProviderRouter;
  private freeProvider: FreeProvider | null = null;
  private currentProvider: ActiveProviderInfo | null;

  // New architecture systems
  private modelRegistry: ModelRegistry;
  private autoRouter: AutoRouter;
  private healthMonitor: HealthMonitor;
  private streamingEngine: StreamingEngine;
  private fallbackHandler: FallbackHandler;
  private conversationStore: ConversationStore;
  private providerDiscovery: ProviderDiscovery;
  private _discoveredProviders: DiscoveredProvider[] = [];

  constructor() {
    this.configManager = new ConfigurationManager();
    this.layeredConfig = new LayeredConfig();
    this.registry = new ProviderRegistry();
    this.factory = new ProviderFactory(this.registry);
    this.router = new ProviderRouter();
    this.currentProvider = null;

    // Initialize new architecture
    this.modelRegistry = new ModelRegistry();
    this.healthMonitor = new HealthMonitor();
    this.streamingEngine = new StreamingEngine();
    this.conversationStore = new ConversationStore();
    this.autoRouter = new AutoRouter(this.modelRegistry, this.healthMonitor);
    this.fallbackHandler = new FallbackHandler(
      this.healthMonitor,
      this.modelRegistry,
      this.autoRouter,
      this.streamingEngine,
      this.conversationStore,
      this.factory,
    );
    this.providerDiscovery = new ProviderDiscovery(this.modelRegistry);
  }

  configFilePath(): string {
    return this.configManager.configFilePath();
  }

  isConfigured(): boolean {
    return true;
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

  getModelRegistry(): ModelRegistry {
    return this.modelRegistry;
  }

  getAutoRouter(): AutoRouter {
    return this.autoRouter;
  }

  getHealthMonitor(): HealthMonitor {
    return this.healthMonitor;
  }

  getStreamingEngine(): StreamingEngine {
    return this.streamingEngine;
  }

  getFallbackHandler(): FallbackHandler {
    return this.fallbackHandler;
  }

  getConversationStore(): ConversationStore {
    return this.conversationStore;
  }

  getDiscoveredProviders(): DiscoveredProvider[] {
    return [...this._discoveredProviders];
  }

  async discoverProviders(): Promise<DiscoveredProvider[]> {
    this._discoveredProviders = await this.providerDiscovery.discoverAll();
    return this._discoveredProviders;
  }

  async initialize(): Promise<ActiveProviderInfo | null> {
    const config = this.layeredConfig.merge();
    const defaultProvider = config.defaultProvider ?? 'free';

    // Run auto-discovery
    const discovered = await this.discoverProviders();

    // Register discovered providers with health monitor
    for (const dp of discovered) {
      this.healthMonitor.register(dp.id, dp.provider);
      this.modelRegistry.discoverFromProvider(dp.id, dp.provider).catch(() => {});
    }

    // Register built-in providers from config
    const configProviders = this.configManager.load().providers ?? {};
    for (const [name, entry] of Object.entries(configProviders)) {
      if (!entry.enabled) continue;
      if (!this.registry.exists(name)) continue;
      try {
        const provider = this.factory.create(name, { ...entry, enabled: true });
        this.healthMonitor.register(name, provider);
        this.modelRegistry.discoverFromProvider(name, provider).catch(() => {});
      } catch {
        continue;
      }
    }

    // Start health monitoring
    this.healthMonitor.start();

    // Initialize routing
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

      this.streamingEngine.setActiveProvider(id);
      return this.currentProvider;
    } catch {
      return null;
    }
  }

  async initializeFree(): Promise<ActiveProviderInfo | null> {
    const config = this.configManager.load();
    const enrichedConfig = this.layeredConfig.getConfig();

    const fp = new FreeProvider();
    await fp.autoDiscover();

    // Register configured providers as free endpoints
    for (const [name, entry] of Object.entries(config.providers)) {
      if (!entry.enabled) continue;
      if (!this.registry.exists(name)) continue;
      try {
        const provider = this.factory.create(name, { ...entry, enabled: true });
        fp.registerEndpoint(name, provider);
        this.healthMonitor.register(name, provider);
      } catch {
        continue;
      }
    }

    // Register discovered providers as free endpoints
    for (const dp of this._discoveredProviders) {
      if (!config.providers[dp.id]?.enabled) {
        fp.registerEndpoint(dp.id, dp.provider);
      }
    }

    if (fp.hasEndpoints()) {
      fp.setModel('best-free');
      this.freeProvider = fp;
      this.currentProvider = {
        id: 'free',
        model: 'best-free',
        type: 'free',
      };

      // Use auto-router for model routing within free provider
      const routingConfig = enrichedConfig.routing ?? {};
      this.autoRouter.setOptions({
        preferFree: true,
        defaultIntent: (routingConfig.intent as RoutingIntent) ?? 'best-free',
      });

      this.streamingEngine.setActiveProvider('free');
      return this.currentProvider;
    }

    return null;
  }

  async routeWithAutoRouter(request?: {
    intent?: RoutingIntent;
    requiresTools?: boolean;
    requiresVision?: boolean;
  }): Promise<{ model: string; provider: string }> {
    const decision = await this.autoRouter.route(request ?? {});
    return {
      model: decision.model.id,
      provider: decision.provider,
    };
  }

  getActiveProvider(): ActiveProviderInfo | null {
    return this.currentProvider;
  }

  getProvider(): LLMProvider {
    if (this.currentProvider?.type === 'free' && this.freeProvider) {
      return this.freeProvider;
    }
    return this.router;
  }

  getFreeProvider(): FreeProvider | null {
    return this.freeProvider;
  }

  getRouter(): ProviderRouter {
    return this.router;
  }

  async listFreeModels(): Promise<ModelInfo[]> {
    if (!this.freeProvider) return [];
    return this.freeProvider.listModels();
  }

  getFreeAliases(): Record<string, string> {
    if (!this.freeProvider) return {};
    return this.freeProvider.getAliases();
  }

  async checkHealth(): Promise<Map<string, HealthCheckResult>> {
    if (this.freeProvider && this.currentProvider?.type === 'free') {
      return this.freeProvider.checkHealth();
    }
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

  async streamWithFallback(
    request: CompletionRequest,
    onEvent: StreamCallback,
  ): Promise<void> {
    const provider = this.getProvider();
    const providerId = this.currentProvider?.id ?? 'unknown';

    this.conversationStore.begin(request, providerId);

    await this.fallbackHandler.executeWithFallback(
      providerId,
      provider,
      request,
      onEvent,
    );
  }

  // Delegate health checks
  getProviderHealthStatus(providerId: string): 'healthy' | 'degraded' | 'unhealthy' | 'unknown' {
    return this.healthMonitor.getStatus(providerId);
  }

  getHealthSnapshot(): Map<string, import('./health-monitor.js').HealthSnapshot> {
    return this.healthMonitor.getSnapshot();
  }

  destroy(): void {
    this.healthMonitor.stop();
    this.modelRegistry.stopPeriodicDiscovery();
  }
}
