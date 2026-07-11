import * as http from 'node:http';
import type { LLMProvider } from './base.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { ModelRegistry } from './model-registry.js';

export interface DiscoveredProvider {
  id: string;
  name: string;
  provider: LLMProvider;
  source: 'local' | 'env' | 'config';
  baseUrl: string;
}

export class ProviderDiscovery {
  private registry: ModelRegistry;

  constructor(registry: ModelRegistry) {
    this.registry = registry;
  }

  async discoverAll(): Promise<DiscoveredProvider[]> {
    const results: DiscoveredProvider[] = [];

    const localProviders = await this.discoverLocal();
    results.push(...localProviders);

    const envProviders = this.discoverFromEnv();
    results.push(...envProviders);

    return results;
  }

  private async discoverLocal(): Promise<DiscoveredProvider[]> {
    const results: DiscoveredProvider[] = [];

    // Ollama
    const ollamaEndpoint = process.env['OLLAMA_ENDPOINT'] ?? 'http://localhost:11434/v1';
    const ollamaAvailable = await this.checkEndpoint(ollamaEndpoint);
    if (ollamaAvailable) {
      const provider = this.createOllamaProvider(ollamaEndpoint);
      results.push({ id: 'ollama', name: 'Ollama (Local)', provider, source: 'local', baseUrl: ollamaEndpoint });
    }

    // LM Studio
    const lmStudioEndpoint = process.env['LM_STUDIO_ENDPOINT'] ?? 'http://localhost:1234/v1';
    const lmStudioAvailable = await this.checkEndpoint(lmStudioEndpoint);
    if (lmStudioAvailable) {
      const provider = this.createLocalProvider('lm-studio', lmStudioEndpoint);
      results.push({ id: 'lm-studio', name: 'LM Studio', provider, source: 'local', baseUrl: lmStudioEndpoint });
    }

    // Generic local OpenAI-compatible
    const customEndpoint = process.env['LOCAL_API_ENDPOINT'];
    if (customEndpoint) {
      const available = await this.checkEndpoint(customEndpoint);
      if (available) {
        const provider = this.createLocalProvider('local', customEndpoint);
        results.push({ id: 'local', name: 'Local API', provider, source: 'local', baseUrl: customEndpoint });
      }
    }

    return results;
  }

  private discoverFromEnv(): DiscoveredProvider[] {
    const results: DiscoveredProvider[] = [];

    const envMappings: Array<{ var: string; id: string; name: string; baseUrl: string; model: string }> = [
      { var: 'OPENAI_API_KEY', id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
      { var: 'ANTHROPIC_API_KEY', id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
      { var: 'GEMINI_API_KEY', id: 'gemini', name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
      { var: 'GROQ_API_KEY', id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
      { var: 'OPENROUTER_API_KEY', id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.0-flash:free' },
      { var: 'TOGETHER_API_KEY', id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
      { var: 'NVIDIA_API_KEY', id: 'nvidia', name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', model: 'meta/llama-3.1-8b-instruct' },
    ];

    for (const mapping of envMappings) {
      const key = process.env[mapping.var];
      if (key) {
        const provider = new OpenAICompatibleProvider({
          name: mapping.id,
          baseUrl: mapping.baseUrl,
          apiKey: key,
          defaultModel: mapping.model,
          timeout: 30000,
        });
        results.push({ id: mapping.id, name: mapping.name, provider, source: 'env', baseUrl: mapping.baseUrl });
      }
    }

    return results;
  }

  private createOllamaProvider(endpoint: string): LLMProvider {
    return new OpenAICompatibleProvider({
      name: 'ollama',
      baseUrl: endpoint,
      defaultModel: 'llama3.2',
      timeout: 60000,
    }) as unknown as LLMProvider;
  }

  private createLocalProvider(name: string, endpoint: string): LLMProvider {
    return new OpenAICompatibleProvider({
      name,
      baseUrl: endpoint,
      defaultModel: 'gpt-4o-mini',
      timeout: 30000,
    }) as unknown as LLMProvider;
  }

  private checkEndpoint(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(url);
        const req = http.request(
          {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: '/',
            method: 'GET',
            timeout: 2000,
          },
          (res) => {
            resolve(res.statusCode !== undefined);
            res.resume();
          },
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      } catch {
        resolve(false);
      }
    });
  }

  async discoverModels(providerId: string, provider: LLMProvider): Promise<void> {
    await this.registry.discoverFromProvider(providerId, provider);
  }
}
