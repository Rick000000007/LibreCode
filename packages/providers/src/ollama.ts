/* eslint-disable no-constant-condition */
import { BaseProvider, LlmError, createUsage, type StreamCallback } from './base.js';
import type {
  CompletionRequest,
  CompletionResponse,
  Message,
} from 'librecode-types';

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

  override supportsStreaming(): boolean {
    return true;
  }

  override async complete(
    request: CompletionRequest,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<CompletionResponse> {
    const body = {
      model: request.model,
      messages: convertMessages(request.messages),
      tools: request.tools.length > 0 ? request.tools : undefined,
      stream: false,
    };

    const url = `${this.baseUrl}/api/chat`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: options?.signal,
      });
    } catch (err) {
      const hostname = this.extractHostname();
      const port = this.extractPort();
      const cause = (err as any)?.cause;
      const msg = `${(err as Error).message} ${cause instanceof Error ? cause.message : String(cause || '')}`.toLowerCase();
      const baseMsg = `Ollama: ${msg.includes('econnrefused') ? 'Connection refused' : msg.includes('etimedout') ? 'Connection timed out' : msg.includes('enotfound') ? 'Host unreachable' : 'Connection failed'} at ${this.baseUrl}`;

      let detail = `  Configured URL: ${this.baseUrl}\n  Endpoint: /api/chat`;
      if (msg.includes('econnrefused')) {
        detail += `\n  The Ollama server appears to be stopped or unreachable on port ${port}.`;
        detail += `\n  Suggestion: Run \`ollama serve\` to start the server, or verify it is listening on ${hostname}:${port}.`;
      } else if (msg.includes('etimedout')) {
        detail += `\n  Connection to ${hostname}:${port} timed out.`;
        detail += `\n  Suggestion: Check firewall rules or increase the timeout. Verify Ollama is running with \`ollama ps\`.`;
      } else if (msg.includes('enotfound')) {
        detail += `\n  Host '${hostname}' could not be resolved.`;
        detail += `\n  Suggestion: Verify the configured URL is correct. For local installs, use \`http://localhost:11434\`.`;
      } else {
        detail += `\n  Suggestion: Verify the Ollama server is running (\`ollama serve\`) and accessible at ${this.baseUrl}.`;
      }

      throw LlmError.networkError(`${baseMsg}\n${detail}`);
    }

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

  private extractHostname(): string {
    try {
      return new URL(this.baseUrl).hostname;
    } catch {
      return this.baseUrl;
    }
  }

  private extractPort(): string {
    try {
      const url = new URL(this.baseUrl);
      return url.port || (url.protocol === 'https:' ? '443' : '80');
    } catch {
      return '?';
    }
  }

  override async streamComplete(
    request: CompletionRequest,
    onEvent: StreamCallback,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<void> {
    const body = {
      model: request.model,
      messages: convertMessages(request.messages),
      tools: request.tools.length > 0 ? request.tools : undefined,
      stream: true,
    };

    const url = `${this.baseUrl}/api/chat`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: options?.signal,
      });
    } catch (err) {
      const hostname = this.extractHostname();
      const port = this.extractPort();
      const cause = (err as any)?.cause;
      const msg = `${(err as Error).message} ${cause instanceof Error ? cause.message : String(cause || '')}`.toLowerCase();
      const baseMsg = `Ollama: ${msg.includes('econnrefused') ? 'Connection refused' : msg.includes('etimedout') ? 'Connection timed out' : msg.includes('enotfound') ? 'Host unreachable' : 'Connection failed'} at ${this.baseUrl}`;

      let detail = `  Configured URL: ${this.baseUrl}\n  Endpoint: /api/chat`;
      if (msg.includes('econnrefused')) {
        detail += `\n  The Ollama server appears to be stopped or unreachable on port ${port}.`;
        detail += `\n  Suggestion: Run \`ollama serve\` to start the server, or verify it is listening on ${hostname}:${port}.`;
      } else if (msg.includes('etimedout')) {
        detail += `\n  Connection to ${hostname}:${port} timed out.`;
        detail += `\n  Suggestion: Check firewall rules or increase the timeout. Verify Ollama is running with \`ollama ps\`.`;
      } else if (msg.includes('enotfound')) {
        detail += `\n  Host '${hostname}' could not be resolved.`;
        detail += `\n  Suggestion: Verify the configured URL is correct. For local installs, use \`http://localhost:11434\`.`;
      } else {
        detail += `\n  Suggestion: Verify the Ollama server is running (\`ollama serve\`) and accessible at ${this.baseUrl}.`;
      }

      throw LlmError.networkError(`${baseMsg}\n${detail}`);
    }

    if (!response.ok) {
      const text = await response.text();
      try {
        const err = JSON.parse(text) as { error?: string };
        throw LlmError.apiError(err.error ?? text, response.status);
      } catch {
        throw LlmError.apiError(`HTTP ${response.status}: ${text}`, response.status);
      }
    }

    let usage = createUsage({});

    if (!response.body) {
      throw LlmError.networkError('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (options?.signal?.aborted) {
          throw new Error('Streaming aborted');
        }

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
              onEvent({ type: 'text_delta', delta: chunk.message.content });
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

    onEvent({ type: 'done', usage });
  }
}
