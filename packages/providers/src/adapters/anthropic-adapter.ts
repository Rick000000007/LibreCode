import type { CompletionRequest, CompletionResponse, TokenUsage, StreamEvent } from 'librecode-types';
import type { StreamCallback, HealthStatus, ModelInfo } from '../base.js';
import { LlmError } from '../base.js';
import { HttpClient } from '../http-client.js';
import type { ProviderAdapter } from '../types/adapter.js';
import type { ProviderConfig } from '../types/provider-descriptor.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  tools?: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>;
  stream?: boolean;
  temperature?: number;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerId = 'anthropic';
  private httpClient!: HttpClient;
  private defaultModel = 'claude-sonnet-4-20250514';

  async initialize(config: ProviderConfig): Promise<void> {
    this.defaultModel = (config.defaultModel as string) ?? this.defaultModel;
    this.httpClient = new HttpClient({
      baseUrl: (config.baseUrl as string) ?? 'https://api.anthropic.com',
      apiKey: config.apiKey,
      customHeaders: {
        'anthropic-version': '2023-06-01',
        ...(config.customHeaders as Record<string, string> | undefined),
      },
      name: 'anthropic',
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    const result = await this.httpClient.request('GET', '/v1/models', undefined, false, { timeout: 30000 });
    if (result.status !== 200) return [this.getDefaultModel()];
    const raw = JSON.parse(result.body as string);
    const models = raw.data ?? [];
    return models.map((m: { id: string }) => ({
      id: m.id,
      name: m.id,
      provider: this.providerId,
      contextWindow: 200_000,
      supportsToolCalling: true,
      supportsStreaming: true,
      isFree: false,
    }));
  }

  async health(): Promise<HealthStatus> {
    try {
      const result = await this.httpClient.request('GET', '/v1/models', undefined, false, { timeout: 15000 });
      return {
        status: result.status === 200 ? 'healthy' : 'unhealthy',
        message: result.status === 200 ? 'Anthropic available' : `HTTP ${result.status}`,
      };
    } catch (err) {
      return { status: 'unhealthy', message: err instanceof Error ? err.message : String(err) };
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body = this.buildRequest(request, false);
    const result = await this.httpClient.request('POST', '/v1/messages', body);
    if (result.status !== 200) {
      throw this.handleError(result.status, result.body as string);
    }
    const resp = JSON.parse(result.body as string) as AnthropicResponse;
    return this.parseResponse(resp);
  }

  async streamComplete(request: CompletionRequest, onEvent: StreamCallback): Promise<void> {
    const body = this.buildRequest(request, true);
    const result = await this.httpClient.request('POST', '/v1/messages', body, true);
    if (result.status !== 200) {
      throw this.handleError(result.status, result.body as string);
    }

    const reader = (result.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) {
          streamDone = true;
          break;
        }

        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            if (event.type === 'content_block_delta' && event.delta?.text) {
              const ev: StreamEvent = { type: 'text_delta', delta: event.delta.text };
              onEvent(ev);
            } else if (event.type === 'message_start' && event.message?.usage) {
              usage = {
                promptTokens: event.message.usage.input_tokens ?? 0,
                completionTokens: event.message.usage.output_tokens ?? 0,
                totalTokens: (event.message.usage.input_tokens ?? 0) + (event.message.usage.output_tokens ?? 0),
              };
            } else if (event.type === 'message_delta' && event.delta?.usage) {
              usage.completionTokens += event.delta.usage.output_tokens ?? 0;
              usage.totalTokens = usage.promptTokens + usage.completionTokens;
            } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
              const ev: StreamEvent = {
                type: 'tool_call_delta',
                index: 0,
                id: event.content_block.id,
                name: event.content_block.name,
                argumentsDelta: '',
              };
              onEvent(ev);
            } else if (event.type === 'content_block_delta' && event.delta?.partial_json) {
              const ev: StreamEvent = {
                type: 'tool_call_delta',
                index: 0,
                argumentsDelta: event.delta.partial_json,
              };
              onEvent(ev);
            } else if (event.type === 'error') {
              const ev: StreamEvent = {
                type: 'error',
                message: event.error?.message ?? 'Unknown Anthropic stream error',
              };
              onEvent(ev);
            }
          } catch {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const ev: StreamEvent = { type: 'done', usage };
    onEvent(ev);
  }

  private buildRequest(request: CompletionRequest, stream: boolean): AnthropicRequest {
    const systemMsg = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    const body: AnthropicRequest = {
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      messages: otherMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content ?? '',
      })),
      stream,
      temperature: request.temperature,
    };

    if (systemMsg?.content) {
      body.system = systemMsg.content;
    }

    if (request.tools?.length) {
      body.tools = request.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters as Record<string, unknown>,
      }));
    }

    return body;
  }

  private parseResponse(resp: AnthropicResponse): CompletionResponse {
    const textBlocks = resp.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
    const toolBlocks = resp.content.filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use');

    return {
      content: textBlocks.map((b) => b.text).join('') || null,
      toolCalls: toolBlocks.map((b) => ({
        id: b.id,
        type: 'function' as const,
        function: { name: b.name, arguments: JSON.stringify(b.input) },
      })),
      usage: {
        promptTokens: resp.usage.input_tokens,
        completionTokens: resp.usage.output_tokens,
        totalTokens: resp.usage.input_tokens + resp.usage.output_tokens,
      },
      finishReason: this.mapStopReason(resp.stop_reason),
    };
  }

  private mapStopReason(reason: string): string {
    switch (reason) {
      case 'end_turn': return 'stop';
      case 'tool_use': return 'tool_calls';
      case 'max_tokens': return 'length';
      case 'stop_sequence': return 'stop';
      default: return reason;
    }
  }

  private handleError(status: number, text: string): LlmError {
    const msg = text.slice(0, 200);
    switch (status) {
      case 401: case 403:
        return LlmError.authError('Invalid API key for Anthropic. Check your API key.');
      case 429:
        return LlmError.rateLimited();
      case 400:
        if (msg.includes('context_length') || msg.includes('too long')) {
          return LlmError.contextExceeded(0);
        }
        return LlmError.apiError(`Anthropic: ${msg}`, status);
      default:
        return LlmError.apiError(`Anthropic: ${msg}`, status);
    }
  }

  private getDefaultModel(): ModelInfo {
    return {
      id: this.defaultModel,
      name: this.defaultModel,
      provider: this.providerId,
      contextWindow: 200_000,
      supportsToolCalling: true,
      supportsStreaming: true,
      isFree: false,
    };
  }
}
