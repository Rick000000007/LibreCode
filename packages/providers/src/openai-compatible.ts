import { BaseProvider, LlmError } from './base.js';
import type { ModelInfo } from './base.js';
import { HttpClient } from './http-client.js';
import { detectCapabilities } from './capabilities.js';
import { classifyError } from './error-classifier.js';
import type {
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  TokenUsage,
  ProviderCapabilities,
} from 'librecode-types';

export interface OpenAICompatibleOptions {
  name: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  organization?: string;
  project?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
  contextWindow?: number;
}

interface OpenAiMessage {
  role: string;
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

interface OpenAiChoice {
  message: OpenAiMessage;
  finish_reason?: string;
}

interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAiResponse {
  choices: OpenAiChoice[];
  usage?: OpenAiUsage;
}

interface OpenAiStreamDelta {
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface OpenAiStreamChoice {
  delta: OpenAiStreamDelta;
  finish_reason?: string;
}

interface OpenAiStreamChunk {
  choices: OpenAiStreamChoice[];
  usage?: OpenAiUsage;
}

function convertMessages(messages: CompletionRequest['messages']): OpenAiMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    tool_call_id: m.tool_call_id,
    tool_calls: m.tool_calls as OpenAiMessage['tool_calls'],
  }));
}

const DEFAULT_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
  'claude-sonnet-4-20250514': 200_000,
  'claude-haiku-3-5': 200_000,
  'gemini-2.0-flash': 1_048_576,
  'gemini-2.0-flash-lite': 1_048_576,
  'codellama': 32_768,
  'llama3.2': 128_000,
  'llama-3.1-8b': 128_000,
  'mistral': 32_768,
};

function estimateContextWindow(model: string): number {
  const lower = model.toLowerCase();
  for (const [key, value] of Object.entries(DEFAULT_CONTEXT_WINDOWS)) {
    if (lower.includes(key)) return value;
  }
  return 128_000;
}

export class OpenAICompatibleProvider extends BaseProvider {
  private providerName: string;
  private httpClient: HttpClient;
  private defaultModel: string;
  private contextWindow: number;
  private capabilities_: ProviderCapabilities | null = null;

  constructor(options: OpenAICompatibleOptions) {
    super();
    this.providerName = options.name;
    this.httpClient = new HttpClient({
      baseUrl: options.baseUrl.replace(/\/$/, ''),
      apiKey: options.apiKey,
      organization: options.organization,
      project: options.project,
      customHeaders: options.customHeaders,
      timeout: options.timeout ?? 30000,
      maxRetries: 3,
      retryDelay: 1000,
    });
    this.defaultModel = options.defaultModel ?? 'gpt-4o';
    this.contextWindow = options.contextWindow ?? estimateContextWindow(this.defaultModel);
  }

  override name(): string {
    return this.providerName;
  }

  override maxContextWindow(): number {
    return this.contextWindow;
  }

  override supportsStreaming(): boolean {
    return true;
  }

  override supportsToolCalling(): boolean {
    return true;
  }

  async detectCapabilities(): Promise<ProviderCapabilities> {
    if (!this.capabilities_) {
      this.capabilities_ = await detectCapabilities(this.httpClient, this.defaultModel);
    }
    return this.capabilities_;
  }

  getProviderCapabilities(): ProviderCapabilities | null {
    return this.capabilities_;
  }

  override async listModels(): Promise<ModelInfo[]> {
    try {
      const result = await this.httpClient.request('GET', '/models');
      if (result.status !== 200) return [this.getModel()];

      const parsed = JSON.parse(result.body as string) as {
        data?: Array<{ id: string }>;
      };
      return (parsed.data ?? []).map((m) => ({
        id: m.id,
        name: m.id,
        provider: this.providerName,
        contextWindow: this.contextWindow,
        supportsToolCalling: this.supportsToolCalling(),
        supportsStreaming: this.supportsStreaming(),
        isFree: false,
      }));
    } catch {
      return [this.getModel()];
    }
  }

  override supportsVision(): boolean {
    const model = this.defaultModel.toLowerCase();
    return model.includes('vision') || model.includes('gemini') || model.includes('claude-3');
  }

  override getModel(): ModelInfo {
    return {
      id: this.defaultModel,
      name: this.defaultModel,
      provider: this.providerName,
      contextWindow: this.contextWindow,
      supportsToolCalling: this.supportsToolCalling(),
      supportsStreaming: this.supportsStreaming(),
      isFree: false,
    };
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const result = await this.httpClient.request('POST', '/chat/completions', {
        model: this.defaultModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false,
      });
      return {
        ok: result.status === 200,
        latencyMs: Date.now() - start,
        error: result.status !== 200 ? `HTTP ${result.status}` : undefined,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private handleError(status: number, text: string): LlmError {
    const classified = classifyError(status, text);
    const msg = classified || text.slice(0, 200);

    switch (status) {
      case 401:
      case 403:
        return LlmError.authError(
          msg.includes('Invalid API key')
            ? msg
            : `Invalid API key for ${this.providerName}. Check your API key and try again.`,
        );
      case 404: {
        const lower = msg.toLowerCase();
        if (lower.includes('model not found')) {
          return LlmError.modelNotFound(
            `Model '${this.defaultModel}' not found for ${this.providerName}. ` +
            `Run \`librecode provider models ${this.providerName}\` to list available models.`,
          );
        }
        return LlmError.apiError(
          `Endpoint not found (HTTP 404). Check the base URL for ${this.providerName}.`,
          status,
        );
      }
      case 429:
        return LlmError.rateLimited();
      case 400:
        if (msg.includes('context_length') || msg.includes('context window')) {
          return LlmError.contextExceeded(0);
        }
        return LlmError.apiError(`${this.providerName}: ${msg}`, status);
      default:
        return LlmError.apiError(`${this.providerName}: ${msg}`, status);
    }
  }

  override async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const apiKey = this.httpClient.getApiKey();
    if (!apiKey && !this.providerName.includes('ollama')) {
      const envKey = process.env[`${this.providerName.toUpperCase()}_API_KEY`] ||
        process.env[`${this.providerName.replace(/-/g, '_').toUpperCase()}_API_KEY`];
      if (!envKey) {
        throw LlmError.authError(
          `No API key configured for ${this.providerName}.\n` +
          `  Set ${this.providerName.toUpperCase()}_API_KEY environment variable or\n` +
          `  run \`librecode provider login ${this.providerName}\` to configure.`,
        );
      }
    }

    const body: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      messages: convertMessages(request.messages),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: false,
    };

    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools;
    }

    const result = await this.httpClient.request('POST', '/chat/completions', body);

    if (result.status !== 200) {
      throw this.handleError(result.status, result.body as string);
    }

    const resp = JSON.parse(result.body as string) as OpenAiResponse;
    const choice = resp.choices[0];
    if (!choice) {
      throw LlmError.apiError(`${this.providerName}: No choices in response`);
    }

    const finishReason = this.parseFinishReason(choice.finish_reason);
    const toolCalls = choice.message.tool_calls ?? [];
    const usage = resp.usage
      ? {
          promptTokens: resp.usage.prompt_tokens,
          completionTokens: resp.usage.completion_tokens,
          totalTokens: resp.usage.total_tokens,
        }
      : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    return {
      content: choice.message.content ?? null,
      toolCalls: toolCalls as CompletionResponse['toolCalls'],
      usage,
      finishReason,
    };
  }

  override async streamComplete(request: CompletionRequest): Promise<StreamEvent[]> {
    const apiKey = this.httpClient.getApiKey();
    if (!apiKey && !this.providerName.includes('ollama')) {
      const envKey = this.providerName.toUpperCase() + '_API_KEY';
      if (!process.env[envKey.replace(/-/g, '_')] && !process.env[envKey]) {
        throw LlmError.authError(
          `No API key configured for ${this.providerName}.\n` +
          `  Set ${envKey} environment variable or\n` +
          `  run \`librecode provider login ${this.providerName}\` to configure.`,
        );
      }
    }

    const body: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      messages: convertMessages(request.messages),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true,
    };

    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools;
    }

    const result = await this.httpClient.request('POST', '/chat/completions', body);

    if (result.status !== 200) {
      throw this.handleError(result.status, result.body as string);
    }

    const events: StreamEvent[] = [];
    let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    const responseBody = result.body;
    const lines = (responseBody as string).split('\n');
    let hasContent = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;

      const dataPrefix = 'data: ';
      if (!trimmed.startsWith(dataPrefix)) continue;

      const data = trimmed.slice(dataPrefix.length).trim();
      if (data === '[DONE]') break;

      try {
        const chunk = JSON.parse(data) as OpenAiStreamChunk;

        if ('error' in chunk) {
          const errChunk = chunk as unknown as { error: { message?: string; type?: string; code?: string } };
          throw LlmError.apiError(
            `${this.providerName}: streaming error - ${errChunk.error?.message ?? JSON.stringify(errChunk.error)}`,
          );
        }

        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }

        const choice = chunk.choices?.[0];
        if (choice) {
          if (choice.delta.content) {
            hasContent = true;
            events.push({ type: 'text_delta', delta: choice.delta.content });
          }

          if (choice.delta.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              events.push({
                type: 'tool_call_delta',
                index: tc.index,
                id: tc.id,
                name: tc.function?.name,
                argumentsDelta: tc.function?.arguments ?? '',
              });
            }
          }

          if (choice.finish_reason === 'content_filter') {
            events.push({ type: 'error', message: 'Content filtered by provider safety system.' });
          }
        }
      } catch (err) {
        if (err instanceof LlmError) throw err;
      }
    }

    if (!hasContent && events.length === 0) {
      throw LlmError.apiError(`${this.providerName}: Empty streaming response received`);
    }

    events.push({ type: 'done', usage });
    return events;
  }

  private parseFinishReason(reason?: string): string {
    switch (reason) {
      case 'stop': return 'stop';
      case 'tool_calls':
      case 'function_call': return 'tool_calls';
      case 'length': return 'length';
      case 'content_filter': return 'content_filter';
      default: return reason ?? 'stop';
    }
  }
}
