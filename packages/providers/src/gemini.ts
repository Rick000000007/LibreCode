/* eslint-disable no-constant-condition */
import { BaseProvider, LlmError, createUsage, type StreamCallback } from './base.js';
import type {
  CompletionRequest,
  CompletionResponse,
  ToolCall,
} from 'librecode-types';

interface ProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

interface GeminiContent {
  role: string;
  parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: Record<string, unknown> }>;
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

function convertMessages(
  request: CompletionRequest,
): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const msg of request.messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content ?? '' }],
      });
    } else if (msg.role === 'assistant') {
      const parts: GeminiContent['parts'] = [];
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
            },
          });
        }
      }
      contents.push({ role: 'model', parts });
    } else if (msg.role === 'tool') {
      let functionName = 'unknown';
      if (msg.tool_call_id) {
        for (let i = request.messages.indexOf(msg) - 1; i >= 0; i--) {
          const prevMsg = request.messages[i];
          if (prevMsg && prevMsg.role === 'assistant' && prevMsg.tool_calls) {
            const matchedCall = prevMsg.tool_calls.find((tc: ToolCall) => tc.id === msg.tool_call_id);
            if (matchedCall) {
              functionName = matchedCall.function.name;
              break;
            }
          }
        }
      }
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: functionName,
              response: { content: msg.content },
            } as unknown as Record<string, unknown>,
          },
        ],
      });
    }
  }

  return contents;
}

function convertTools(
  tools: CompletionRequest['tools'],
): Array<{ functionDeclarations: unknown[] }> {
  if (tools.length === 0) return [];
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    },
  ];
}

export class GeminiProvider extends BaseProvider {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(options: ProviderOptions) {
    super();
    this.apiKey = options.apiKey ?? '';
    this.baseUrl = options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.defaultModel = options.defaultModel ?? 'gemini-2.0-flash';
  }

  override name(): string {
    return 'gemini';
  }

  override maxContextWindow(): number {
    return 1_000_000;
  }

  override supportsStreaming(): boolean {
    return true;
  }

  override async complete(
    request: CompletionRequest,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<CompletionResponse> {
    if (!this.apiKey) {
      throw LlmError.authError('Gemini API key not set');
    }

    const systemInstruction = request.messages.find((m) => m.role === 'system');
    const contents = convertMessages(request);

    const bodyJson: Record<string, unknown> = {
      contents,
      tools: convertTools(request.tools),
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      },
    };
    if (systemInstruction) {
      bodyJson['system_instruction'] = { parts: [{ text: systemInstruction.content }] };
    }

    const url = `${this.baseUrl}/models/${request.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyJson),
      signal: options?.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw LlmError.apiError(`Gemini API error (${response.status}): ${text}`, response.status);
    }

    const resp = JSON.parse(text) as GeminiResponse;
    const candidate = resp.candidates?.[0];
    let contentText = '';
    const toolCalls: ToolCall[] = [];

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          contentText += part.text;
        } else if (part.functionCall) {
          toolCalls.push({
            id: `call_${Math.random().toString(36).slice(2, 11)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
          });
        }
      }
    }

    const usage = resp.usageMetadata
      ? createUsage({
          promptTokens: resp.usageMetadata.promptTokenCount,
          completionTokens: resp.usageMetadata.candidatesTokenCount,
          totalTokens: resp.usageMetadata.totalTokenCount,
        })
      : createUsage({});

    return {
      content: contentText || null,
      toolCalls,
      usage,
      finishReason: this.parseFinishReason(candidate?.finishReason),
    };
  }

  override async streamComplete(
    request: CompletionRequest,
    onEvent: StreamCallback,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<void> {
    if (!this.apiKey) {
      throw LlmError.authError('Gemini API key not set');
    }

    const systemInstruction = request.messages.find((m) => m.role === 'system');
    const contents = convertMessages(request);

    const bodyJson: Record<string, unknown> = {
      contents,
      tools: convertTools(request.tools),
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      },
    };
    if (systemInstruction) {
      bodyJson['system_instruction'] = { parts: [{ text: systemInstruction.content }] };
    }

    const url = `${this.baseUrl}/models/${request.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyJson),
      signal: options?.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw LlmError.apiError(`Gemini API error (${response.status}): ${text}`, response.status);
    }

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

          const dataPrefix = 'data: ';
          if (!line.startsWith(dataPrefix)) continue;

          const data = line.slice(dataPrefix.length).trim();
          if (data === '[DONE]') break;

          try {
            const chunk = JSON.parse(data) as GeminiResponse;
            const candidate = chunk.candidates?.[0];
            if (candidate?.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.text) {
                  onEvent({ type: 'text_delta', delta: part.text });
                }
                if (part.functionCall) {
                  onEvent({
                    type: 'tool_call_delta',
                    index: 0,
                    id: `call_${Math.random().toString(36).slice(2, 11)}`,
                    name: part.functionCall.name,
                    argumentsDelta: JSON.stringify(part.functionCall.args ?? {}),
                  });
                }
              }
            }
          } catch {
            // skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    onEvent({ type: 'done', usage: createUsage({}) });
  }

  private parseFinishReason(reason?: string): string {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'TOOL_CALLS':
      case 'FUNCTION_CALL':
        return 'tool_calls';
      case 'MAX_TOKENS':
        return 'length';
      default:
        return reason ?? 'stop';
    }
  }
}
