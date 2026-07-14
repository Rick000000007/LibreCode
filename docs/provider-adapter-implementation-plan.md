# ProviderAdapter Implementation Plan

## Phase 1: Core Framework (Week 1-2)

### Step 1.1: Define Core Interfaces
- **Files**: `packages/providers/src/types/provider-descriptor.ts`, `packages/providers/src/types/adapter.ts`
- Define `ProviderDescriptor`, `ProviderConfig`, `Capability`, `Protocol`, `AuthMethod`
- Define `CustomAdapter` interface extending `LLMProvider`
- Define `ProviderPlugin` interface for plugin system

### Step 1.2: Enhance ProviderRegistry
- **Files**: `packages/providers/src/provider-registry.ts`
- Add methods: `registerFromPlugin()`, `getByCategory()`, `unregister()`
- Support runtime registration/unregistration
- Add built-in provider descriptors for all 50 known providers

### Step 1.3: Universal OpenAI-Compatible Adapter
- **Files**: `packages/providers/src/openai-compatible.ts` (existing, needs enhancement)
- Make `OpenAICompatibleProvider` configurable with any base URL
- Support custom headers, different auth methods
- Add automatic model discovery from `/v1/models`
- Add health check endpoint detection

### Step 1.4: Authentication Manager
- **Files**: `packages/providers/src/auth-manager.ts`
- Support bearer token, API key header, custom header, OAuth, AWS SigV4
- Environment variable resolution
- Secure credential storage

### Step 1.5: Plugin Loader
- **Files**: `packages/providers/src/plugin-loader.ts`
- Load from npm packages (`librecode-provider-*`)
- Load from local directories
- Validate plugin interface
- Hot-reload support

**Deliverable**: Core framework with 5 OpenAI-compatible providers working (OpenAI, DeepSeek, Mistral, Groq, Together)

---

## Phase 2: Global Provider Coverage (Week 3-4)

### Step 2.1: Register All OpenAI-Compatible Providers
- Pre-configure all 36 providers with their base URLs, default models, auth methods
- Add to `ProviderRegistry` as built-in descriptors
- Test with mock/fetch-based health checks

### Step 2.2: Anthropic Custom Adapter
- **Files**: `packages/providers/src/adapters/anthropic-adapter.ts`
- Translate OpenAI request format → Anthropic Messages API
- Handle `x-api-key` auth header
- Map streaming events (Anthropic SSE → unified event format)
- Support tool use, vision, extended thinking

### Step 2.3: Chinese Provider Adapters
- **Files**: `packages/providers/src/adapters/baidu-adapter.ts`, `packages/providers/src/adapters/oci-adapter.ts`, `packages/providers/src/adapters/watsonx-adapter.ts`
- Baidu ERNIE: OAuth token acquisition, native protocol mapping
- OCI GenAI: AWS Signature V4, native protocol mapping
- IBM watsonx: IAM token acquisition, native protocol mapping

### Step 2.4: Inference Platform Adapters (Baseten, RunPod, Replicate, Fal)
- **Files**: `packages/providers/src/adapters/replicate-adapter.ts`, `packages/providers/src/adapters/baseten-adapter.ts`
- Minimal adapters: chat completion modeled as prediction endpoint calls
- Support custom model IDs per deployment

**Deliverable**: All 50+ providers registered, at least 40 functional with basic chat

---

## Phase 3: Plugin Ecosystem (Week 5)

### Step 3.1: Plugin SDK
- **Files**: `packages/plugin-sdk/`
- `createProviderPlugin()` helper
- TypeScript types for plugin development
- Documentation and examples

### Step 3.2: Reference Plugins
- `librecode-provider-anthropic` — npm package
- `librecode-provider-baidu` — npm package
- `librecode-provider-replicate` — npm package

### Step 3.3: Plugin Manager CLI
- `librecode provider plugin install <name>`
- `librecode provider plugin list`
- `librecode provider plugin remove <name>`

**Deliverable**: Plugin SDK published, 3 reference plugins, CLI commands

---

## Phase 4: Advanced Routing & Intelligence (Week 6-7)

### Step 4.1: Intent-Based AutoRouter Enhancements
- Cost-aware routing (cheapest capable provider)
- Latency-aware routing (fastest provider for model)
- Geographic routing (prefer EU/US/Asia endpoints)

### Step 4.2: Model Registry Completion
- Automatic model discovery from all providers
- Model capability tagging (coding, reasoning, vision, tools, JSON)
- Model pricing database
- Context window registry

### Step 4.3: Advanced Fallback Strategies
- Cascading fallback (primary → secondary → tertiary)
- Circuit breaker pattern
- Degraded mode (fall back to weaker but available models)

**Deliverable**: Intelligent routing choosing optimal provider per request

---

## Phase 5: Testing & Hardening (Week 8)

### Step 5.1: Integration Test Suite
- Test each provider's health endpoint
- Test chat completion for each protocol type
- Test streaming for each provider
- Test error handling for each auth type
- Mock server for offline testing

### Step 5.2: Rate Limit Handling
- Provider-specific rate limit detection
- Token bucket rate limiting
- Automatic request queuing

### Step 5.3: Documentation
- Provider contribution guide
- Plugin development guide
- Each provider's configuration reference

**Deliverable**: Full test coverage, production-hardened, documented

---

## Migration Path

### Phase 1 → Current Codebase
- `ProviderRegistry` extends existing registry
- `OpenAICompatibleProvider` enhanced but backwards compatible
- `ProviderManager` facade unchanged API

### Phase 2 → New Files
- Custom adapters in new `adapters/` directory
- `AuthManager` replaces inline auth logic
- Plugin loader is opt-in

### Breaking Changes
- None expected — all additions are additive
- Deprecate `setProvider()` in Agent in Phase 4
- Old `LLMProvider` interface remains valid until Phase 5

## Provider Registration (Built-in)

The ~36 OpenAI-compatible providers will be registered automatically:

```typescript
const BUILTIN_PROVIDERS: ProviderDescriptor[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
    adapterType: 'openai-compatible', defaultModel: 'gpt-4o', ... },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',
    adapterType: 'openai-compatible', defaultModel: 'deepseek-v4-flash', ... },
  { id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1',
    adapterType: 'openai-compatible', defaultModel: 'mistral-large-latest', ... },
  // ...36 total
];
```

Custom adapters require explicit installation (npm package or local file).
