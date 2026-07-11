/* eslint-disable no-constant-condition */
import { BaseProvider, LlmError, createUsage } from './index.js';
import type {
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  Message,
} from '@rcode/types';

interface ProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

interface OllamaMessage {
  role: string;
  content: string;
  tool_calls?: unknown[];
}

interface OllamaResponse {
  message: OllamaMessage;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

function convertMessages(messages: Message[]): OllamaMessage[] {
  return messages.map((m) => ({
    role: m.role === 'tool' ? 'user' : m.role,
    content: m.content ?? '',
    tool_calls: m.tool_calls as unknown[] | undefined,
  }));
}

export class OllamaProvider extends BaseProvider {
  private baseUrl: string;
  private defaultModel: string;

  constructor(options: ProviderOptions) {
    super();
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434';
    this.defaultModel = options.defaultModel ?? 'codellama';
  }

  override name(): string {
    return 'ollama';
  }

  override maxContextWindow(): number {
    return 32_768;
  }

  override async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body = {
      model: request.model,
      messages: convertMessages(request.messages),
      tools: request.tools.length > 0 ? request.tools : undefined,
      stream: false,
    };

    const url = `${this.baseUrl}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await response.text();

    if (!response.ok) {
      try {
        const err = JSON.parse(text) as { error?: string };
        if (response.status === 404) {
          throw LlmError.modelNotFound(err.error ?? text);
        }
        throw LlmError.apiError(err.error ?? text, response.status);
      } catch {
        throw LlmError.apiError(`HTTP ${response.status}: ${text}`, response.status);
      }
    }

    const resp = JSON.parse(text) as OllamaResponse;
    const toolCalls = (resp.message.tool_calls ?? []) as never[];
    const promptTokens = resp.prompt_eval_count ?? 0;
    const completionTokens = resp.eval_count ?? 0;

    return {
      content: resp.message.content || null,
      toolCalls: toolCalls as never[],
      usage: createUsage({
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      }),
      finishReason: resp.done ? 'stop' : 'incomplete',
    };
  }

  override async streamComplete(request: CompletionRequest): Promise<StreamEvent[]> {
    const body = {
      model: request.model,
      messages: convertMessages(request.messages),
      tools: request.tools.length > 0 ? request.tools : undefined,
      stream: true,
    };

    const url = `${this.baseUrl}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      try {
        const err = JSON.parse(text) as { error?: string };
        throw LlmError.apiError(err.error ?? text, response.status);
      } catch {
        throw LlmError.apiError(`HTTP ${response.status}: ${text}`, response.status);
      }
    }

    const events: StreamEvent[] = [];
    let usage = createUsage({});

    if (!response.body) {
      throw LlmError.networkError('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const newlinePos = buffer.indexOf('\n');
          if (newlinePos === -1) break;

          const line = buffer.slice(0, newlinePos).trim();
          buffer = buffer.slice(newlinePos + 1);
          if (!line) continue;

          try {
            const chunk = JSON.parse(line) as OllamaResponse;
            if (chunk.message?.content) {
              events.push({ type: 'text_delta', delta: chunk.message.content });
            }
            if (chunk.done) {
              const promptTokens = chunk.prompt_eval_count ?? 0;
              const completionTokens = chunk.eval_count ?? 0;
              usage = createUsage({
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
              });
            }
          } catch {
            // skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    events.push({ type: 'done', usage });
    return events;
  }
}
