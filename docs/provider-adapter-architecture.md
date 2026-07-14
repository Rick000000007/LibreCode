# Universal ProviderAdapter Architecture for LibreCode

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LibreCode Core                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │   Agent   │  │   CLI    │  │   TUI    │  │  Workflow Engine   │  │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └─────────┬──────────┘  │
│        │             │             │                   │             │
│  ┌─────┴─────────────┴─────────────┴───────────────────┴──────────┐  │
│  │                   ProviderManager (Facade)                      │  │
│  │  - initialize()    - switchProvider()    - streamWithFallback() │  │
│  │  - getProvider()   - routeWithAutoRouter()                      │  │
│  └─────────────────────────┬───────────────────────────────────────┘  │
└────────────────────────────┼──────────────────────────────────────────┘
                             │
    ┌────────────────────────┼────────────────────────────┐
    │                        │                            │
    ▼                        ▼                            ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────────────┐
│  ProviderRouter  │  │ AutoRouter   │  │   FallbackHandler    │
│  - failover      │  │ - intent     │  │   - retry            │
│  - cooldown      │  │   routing    │  │   - fallback         │
│  - health-aware  │  │ - cost       │  │   - provider switch  │
│                  │  │   optimization│  │   - health recording │
└────────┬─────────┘  └──────┬───────┘  └──────────┬───────────┘
         │                   │                      │
         └───────────────────┼──────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │    Provider Factory      │
              │  - create(id, config)    │
              │  - createFromPlugin()    │
              └────────────┬─────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ OpenAICompat │ │  Custom     │ │   Plugin     │
   │  Adapter     │ │  Adapters   │ │   Adapters   │
   └──────────────┘ └──────────────┘ └──────────────┘
            │              │              │
            ▼              ▼              ▼
   ┌─────────────────────────────────────────────┐
   │           HTTP Client (shared)              │
   │  - unified timeout, retry, backoff          │
   │  - error classification                     │
   └─────────────────────────────────────────────┘
```

## Component Design

### 1. ProviderManager (Facade)

```typescript
class ProviderManager {
  async initialize(): Promise<ActiveProviderInfo | null>
  async switchProvider(id: string): Promise<boolean>
  getProvider(): LLMProvider
  async streamWithFallback(request: CompletionRequest, onEvent: StreamCallback): Promise<void>
  async complete(request: CompletionRequest): Promise<CompletionResponse>
  getActiveProvider(): ActiveProviderInfo | null
}
```

### 2. Provider Registry

Central registry of all known providers — both built-in and dynamically loaded:

```typescript
class ProviderRegistry {
  register(descriptor: ProviderDescriptor): void
  get(id: string): ProviderDescriptor | undefined
  getAll(): ProviderDescriptor[]
  getByCategory(category: ProviderCategory): ProviderDescriptor[]
  registerPlugin(plugin: ProviderPlugin): void
  unregister(id: string): void
}
```

### 3. Provider Descriptor

```typescript
interface ProviderDescriptor {
  id: string;
  name: string;
  category: ProviderCategory;
  protocols: Protocol[];
  baseUrl: string;
  defaultModel: string;
  capabilities: Capability[];
  authType: AuthType;
  adapterType: 'openai-compatible' | 'custom' | 'plugin';
  adapterModule?: string; // npm package for plugin adapters
  website?: string;
  docsUrl?: string;
  pricingUrl?: string;
  isFree: boolean;
  isSelfHostable: boolean;
  isOpenSource: boolean;
}
```

### 4. OpenAI-Compatible Adapter

For the ~36 providers that support the OpenAI chat completions format:

```typescript
class OpenAICompatibleAdapter extends BaseProvider {
  constructor(config: ProviderConfig)
  async complete(request: CompletionRequest): Promise<CompletionResponse>
  async streamComplete(request: CompletionRequest, onEvent: StreamCallback): Promise<void>
  async listModels(): Promise<ModelInfo[]>
  async health(): Promise<HealthStatus>
}
```

Single configuration entry for any OpenAI-compatible provider:

```json
{
  "providers": {
    "groq": {
      "baseUrl": "https://api.groq.com/openai/v1",
      "apiKey": "...",
      "models": ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"]
    },
    "together": {
      "baseUrl": "https://api.together.xyz/v1",
      "apiKey": "...",
      "models": ["Qwen/Qwen3.5-9B", "meta-llama/Llama-3.3-70B-Instruct-Turbo"]
    }
  }
}
```

### 5. Custom Adapter Interface

For non-OpenAI providers (Anthropic, Baidu, IBM, OCI, Replicate):

```typescript
interface CustomAdapter {
  readonly providerId: string;
  initialize(config: ProviderConfig): Promise<void>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete(request: CompletionRequest, onEvent: StreamCallback): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  health(): Promise<HealthStatus>;
  supports(protocol: Protocol): boolean;
}
```

### 6. Plugin System

```typescript
interface ProviderPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly providerDescriptor: ProviderDescriptor;
  
  createAdapter(config: ProviderConfig): CustomAdapter;
  validateConfig(config: Record<string, unknown>): ValidationResult;
  getCapabilities(): Capability[];
}

class PluginLoader {
  async loadFromPackage(packageName: string): Promise<ProviderPlugin>;
  async loadFromDirectory(dir: string): Promise<ProviderPlugin[]>;
  unload(pluginId: string): void;
}
```

### 7. Authentication Manager

Handles diverse auth mechanisms:

```typescript
type AuthMethod = 
  | { type: 'bearer'; apiKey: string }
  | { type: 'header'; header: string; value: string }
  | { type: 'oauth'; clientId: string; clientSecret: string; scopes: string[] }
  | { type: 'aws-signature-v4'; region: string; accessKey: string; secretKey: string }
  | { type: 'api-key-header'; headerName: string; apiKey: string }
  | { type: 'none' };

class AuthManager {
  getAuthHeaders(providerId: string, config: ProviderConfig): Promise<Record<string, string>>
  refreshToken(providerId: string): Promise<void>
}
```

### 8. Health Monitor

```typescript
class HealthMonitor {
  register(providerId: string, provider: LLMProvider): void
  unregister(providerId: string): void
  getStatus(providerId: string): 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  recordSuccess(providerId: string, latencyMs: number): void
  recordFailure(providerId: string): void
  start(): void
  stop(): void
}
```

### 9. Provider Router

```typescript
interface RouteConfig {
  strategy: 'priority' | 'cost' | 'latency' | 'random' | 'auto';
  priority?: Record<string, number>;
  maxRetries: number;
  cooldownPeriodMs: number;
}

class ProviderRouter {
  addProvider(id: string, provider: LLMProvider, priority: number): void
  removeProvider(id: string): void
  async route(intent?: RoutingIntent): Promise<RoutedProvider>
  async getHealth(): Promise<HealthMap>
}
```

### 10. Model Registry

```typescript
class ModelRegistry {
  register(model: ModelInfo): void
  registerFromProvider(providerId: string, models: ModelInfo[]): void
  get(id: string): ModelInfo | undefined
  findByProvider(providerId: string): ModelInfo[]
  findByCapability(capability: Capability): ModelInfo[]
  async discoverFromProvider(providerId: string, provider: LLMProvider): Promise<void>
}
```

### 11. Auto Router (Intent-Based)

```typescript
class AutoRouter {
  async route(options: RoutingOptions): Promise<RoutingDecision>
  getAvailableForIntent(intent: RoutingIntent): ModelInfo[]
  setOptions(options: AutoRouterOptions): void
}
```

### 12. Streaming Engine

```typescript
class StreamingEngine {
  async streamComplete(provider: LLMProvider, request: CompletionRequest, onEvent: StreamCallback): Promise<StreamController>
  waitForCompletion(controller: StreamController): Promise<void>
  cancelAll(): void
}
```

### 13. Discovery Service

```typescript
class ProviderDiscovery {
  async discoverLocal(): Promise<DiscoveredProvider[]>
  async discoverOllama(): Promise<DiscoveredProvider | null>
  async discoverLMStudio(): Promise<DiscoveredProvider | null>
  async discoverFromEnv(): Promise<DiscoveredProvider[]>
  async discoverPluginProviders(): Promise<DiscoveredProvider[]>
}
```

### 14. Connection Pool

```typescript
class ConnectionPool {
  private pools: Map<string, Pool<ProviderConnection>>;
  
  acquire(providerId: string): Promise<ProviderConnection>
  release(connection: ProviderConnection): void
  getStats(providerId: string): PoolStats
}
```

### 15. Retry & Backoff

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  strategy: 'exponential' | 'linear' | 'fixed';
  retryableStatuses: number[];
  retryableErrors: string[];
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  shouldRetry?: (error: unknown) => boolean
): Promise<T>
```

## Plugin Lifecycle

```
Install → Load → Validate → Register → Initialize → Ready
                                                 ↓
                                            Provider Unhealthy
                                                 ↓
                                            Unregister → Cleanup
```

### Dynamic Plugin Loading

```typescript
// Install from npm
await pluginManager.install('librecode-provider-anthropic');

// Load from local directory  
await pluginManager.loadFrom('./custom-providers/my-provider');

// Auto-discover from node_modules
await pluginManager.discoverInstalled();
```

### npm Package Convention

```
librecode-provider-{id}/
├── package.json       # "librecode-provider": true in keywords
├── dist/
│   └── index.js      # exports default ProviderPlugin
├── src/
│   └── index.ts
└── README.md
```

## Multi-Layer Routing

```
User Request
    │
    ▼
AutoRouter (intent-based)
    │  - Determines best model for task
    │  - Considers cost, latency, capability
    ▼
ProviderRouter (health-aware)
    │  - Routes to specific provider
    │  - Checks cooldown, health status
    ▼
FallbackHandler (resilience)
    │  - Retries with backoff
    │  - Switches providers on failure
    │  - Records health metrics
    ▼
ProviderAdapter (translation)
    │  - Translates to provider-native format
    ▼
HTTP Client (transport)
    │  - Unified connection pool
    │  - Auth injection
    ▼
Provider API
```
