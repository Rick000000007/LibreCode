import type { LLMProvider } from './base.js';

export type { BoxFuture, LLMProvider, LlmErrorCode } from './base.js';
export { BaseProvider, LlmError, createUsage } from './base.js';
export type { HealthStatus, ModelInfo } from './base.js';

import { OpenAICompatibleProvider } from './openai-compatible.js';
export { OpenAICompatibleProvider };
export { HttpClient, createHttpClient } from './http-client.js';
export { detectCapabilities, capabilitiesFromDescriptor } from './capabilities.js';

// Re-export individual providers for backward compatibility
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { OllamaProvider } from './ollama.js';
export { OpenRouterProvider } from './openrouter.js';
export { GeminiProvider } from './gemini.js';
export { ModelRouter } from './router.js';

export { ConfigurationManager } from './configuration-manager.js';
export { ProviderRegistry } from './provider-registry.js';
export { ProviderFactory } from './provider-factory.js';
export { ProviderRouter, ProviderRouterBuilder } from './provider-router.js';
export { FreeProvider } from './free-models.js';
export { ProviderManager } from './provider-manager.js';
export type { ActiveProviderInfo } from './provider-manager.js';
export { SetupWizard } from './setup-wizard.js';
export {
  printProviderList,
  printProviderCurrent,
} from './cli-commands.js';
export {
  handleProviderLogin,
  handleProviderLogout,
  handleProviderTest,
  handleProviderSwitch,
  handleProviderModels,
} from './cli-commands.js';
export { Doctor, formatDoctorReport } from './doctor.js';

// New architecture exports
export { KNOWN_MODELS, getKnownModel, findModels, scoreForIntent, isModelAlias } from './model-metadata.js';
export type { ModelMetadata, ModelCapabilities, ModelPricing, ModelScore, RoutingIntent, RoutingRequest, RoutingDecision, ProviderHealth } from './model-metadata.js';
export { ModelRegistry } from './model-registry.js';
export type { ModelRegistration } from './model-registry.js';
export { AutoRouter } from './auto-router.js';
export type { RouterOptions } from './auto-router.js';
export { HealthMonitor } from './health-monitor.js';
export type { HealthSnapshot } from './health-monitor.js';
export { StreamingEngine } from './streaming-engine.js';
export type { UnifiedStreamEvent, StreamCallback, StreamController } from './streaming-engine.js';
export { FallbackHandler } from './fallback-handler.js';
export type { FallbackOptions } from './fallback-handler.js';
export { ConversationStore } from './conversation-store.js';
export type { ConversationState } from './conversation-store.js';
export { ProviderDiscovery } from './provider-discovery.js';
export type { DiscoveredProvider } from './provider-discovery.js';
export { LayeredConfig } from './configuration.js';
export type { EnrichedConfig } from './configuration.js';

// Adapter architecture exports
export { AdapterBridge } from './adapter-bridge.js';
export { PluginLoader } from './plugin-loader.js';
export type { PluginDiscoveryResult } from './plugin-loader.js';
export { AuthManager } from './auth-manager.js';
export { ConnectionPool } from './connection-pool.js';
export { withRetry, isRetryableStatus } from './retry.js';
export type { RetryConfig } from './retry.js';
export { BUILTIN_PROVIDERS } from './provider-descriptors.js';

export type {
  ProviderAdapter,
  ProviderPlugin,
} from './types/adapter.js';
export type {
  ProviderDescriptor,
  ProviderConfig,
  ProviderCategory,
  Capability,
  Protocol,
  AuthType,
} from './types/provider-descriptor.js';

// Adapter implementations
export { OpenAICompatibleAdapter } from './adapters/openai-compatible-adapter.js';
export type { OpenAICompatibleAdapterOptions } from './adapters/openai-compatible-adapter.js';
export { AnthropicAdapter } from './adapters/anthropic-adapter.js';

export function createProvider(
  name: string,
  apiKey?: string,
  baseUrl?: string,
  defaultModel?: string,
): LLMProvider {
  return new OpenAICompatibleProvider({
    name,
    baseUrl: baseUrl ?? 'https://api.openai.com/v1',
    apiKey,
    defaultModel: defaultModel ?? 'gpt-4o',
  });
}
