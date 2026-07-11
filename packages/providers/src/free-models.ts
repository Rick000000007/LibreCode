import { BaseProvider, LlmError } from './base.js';
import type { LLMProvider } from './base.js';
import type {
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  HealthCheckResult,
} from 'librecode-types';
import { ProviderRouter } from './provider-router.js';

interface FreeProviderEntry {
  id: string;
  provider: LLMProvider;
  priority: number;
  models: string[];
}

const FREE_MODELS: Record<string, { models: string[]; priority: number }> = {
  gemini: {
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    priority: 10,
  },
  openrouter: {
    models: [
      'google/gemini-2.0-flash:free',
      'meta-llama/llama-3.2-3b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
    ],
    priority: 20,
  },
  nvidia: {
    models: ['meta/llama-3.1-8b-instruct', 'mistralai/mistral-7b-instruct-v0.3'],
    priority: 30,
  },
  ollama: {
    models: ['codellama', 'llama3.2', 'mistral'],
    priority: 5,
  },
};

export class FreeModelsProvider extends BaseProvider {
  private router: ProviderRouter;
  private registered: Map<string, FreeProviderEntry>;

  constructor() {
    super();
    this.router = new ProviderRouter();
    this.registered = new Map();
  }

  registerFreeProvider(id: string, provider: LLMProvider): void {
    const config = FREE_MODELS[id];
    if (!config) return;

    const entry: FreeProviderEntry = {
      id,
      provider,
      priority: config.priority,
      models: config.models,
    };
    this.registered.set(id, entry);
    this.router.addProvider(`${id}-free`, provider, config.priority);
  }

  hasFreeProviders(): boolean {
    return this.registered.size > 0;
  }

  registeredProviders(): string[] {
    return Array.from(this.registered.keys());
  }

  async checkAvailability(): Promise<Map<string, HealthCheckResult>> {
    return this.router.checkAllHealth();
  }

  private inferModel(request: CompletionRequest): CompletionRequest {
    const requestForModel = this.registered.values().next().value;
    const fallbackModel = requestForModel?.models[0] ?? 'gpt-4o-mini';
    return {
      ...request,
      model: fallbackModel,
    };
  }

  override name(): string {
    return 'free';
  }

  override maxContextWindow(): number {
    return this.router.maxContextWindow();
  }

  override supportsStreaming(): boolean {
    return this.router.supportsStreaming();
  }

  override async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (!this.hasFreeProviders()) {
      throw LlmError.unavailable(
        'No free providers configured. Run `librecode provider login` to set up a provider, or start Ollama locally.',
      );
    }
    return this.router.complete(this.inferModel(request));
  }

  override async streamComplete(request: CompletionRequest): Promise<StreamEvent[]> {
    if (!this.hasFreeProviders()) {
      throw LlmError.unavailable(
        'No free providers configured. Run `librecode provider login` to set up a provider, or start Ollama locally.',
      );
    }
    return this.router.streamComplete(this.inferModel(request));
  }
}
