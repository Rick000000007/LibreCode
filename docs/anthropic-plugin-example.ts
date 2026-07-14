/**
 * Example: librecode-provider-anthropic
 * 
 * This is a reference implementation of a LibreCode provider plugin
 * using the Plugin SDK. Published as an npm package, users install with:
 *   librecode provider plugin install librecode-provider-anthropic
 * 
 * Package name convention: librecode-provider-{id}
 */

import { createProviderPlugin } from 'librecode-plugin-sdk';
import type { ProviderAdapter, StreamCallback, HealthStatus, ModelInfo } from 'librecode-plugin-sdk';
import type { CompletionRequest, CompletionResponse } from 'librecode-types';

class AnthropicAdapter implements ProviderAdapter {
  readonly providerId = 'anthropic';
  private baseUrl = 'https://api.anthropic.com';
  private apiKey = '';
  private defaultModel = 'claude-sonnet-4-20250514';

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.apiKey = (config.apiKey as string) ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.baseUrl = (config.baseUrl as string) ?? this.baseUrl;
    this.defaultModel = (config.defaultModel as string) ?? this.defaultModel;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    /* ... Anthropic-specific mapping ... */
    throw new Error('Implement');
  }

  async streamComplete(request: CompletionRequest, onEvent: StreamCallback): Promise<void> {
    /* ... Anthropic SSE streaming ... */
    throw new Error('Implement');
  }

  async listModels(): Promise<ModelInfo[]> {
    /* ... GET /v1/models ... */
    return [{ id: this.defaultModel, name: this.defaultModel, provider: this.providerId, contextWindow: 200000, supportsToolCalling: true, supportsStreaming: true, isFree: false }];
  }

  async health(): Promise<HealthStatus> {
    return { status: 'healthy' };
  }
}

export default createProviderPlugin({
  id: 'anthropic',
  name: 'Anthropic Claude',
  version: '1.0.0',
  createAdapter: (config) => new AnthropicAdapter(),
  validateConfig: (config) => {
    const errors: string[] = [];
    if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) {
      errors.push('ANTHROPIC_API_KEY is required');
    }
    return { valid: errors.length === 0, errors };
  },
  getCapabilities: () => ['chat', 'streaming', 'tools', 'structured-output', 'vision'],
});
