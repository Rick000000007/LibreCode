import { OpenAIProvider } from './openai.js';

interface ProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class OpenRouterProvider extends OpenAIProvider {
  constructor(options: ProviderOptions) {
    super({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? 'https://openrouter.ai/api/v1',
      defaultModel: options.defaultModel ?? 'openai/gpt-4o',
    });
  }

  override name(): string {
    return 'openrouter';
  }

  override maxContextWindow(): number {
    return 128_000;
  }
}
