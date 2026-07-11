import type { LLMProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';
import { OpenRouterProvider } from './openrouter.js';
import { GeminiProvider } from './gemini.js';

export type { BoxFuture, LLMProvider, LlmErrorCode } from './base.js';
export { BaseProvider, LlmError, createUsage } from './base.js';

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
export { FreeModelsProvider } from './free-models.js';
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

export function createProvider(
  name: string,
  apiKey?: string,
  baseUrl?: string,
  defaultModel?: string,
): LLMProvider {
  switch (name) {
    case 'openai':
      return new OpenAIProvider({
        apiKey,
        baseUrl,
        defaultModel: defaultModel ?? 'gpt-4o',
      });
    case 'anthropic':
      return new AnthropicProvider({
        apiKey,
        baseUrl,
        defaultModel: defaultModel ?? 'claude-sonnet-4-20250514',
      });
    case 'ollama':
      return new OllamaProvider({
        apiKey,
        baseUrl: baseUrl ?? 'http://localhost:11434',
        defaultModel: defaultModel ?? 'codellama',
      });
    case 'openrouter':
      return new OpenRouterProvider({
        apiKey,
        defaultModel: defaultModel ?? 'openai/gpt-4o',
      });
    case 'gemini':
      return new GeminiProvider({
        apiKey,
        baseUrl,
        defaultModel: defaultModel ?? 'gemini-2.0-flash',
      });
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}
