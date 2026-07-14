import type { ProviderCapabilities } from 'librecode-types';
import { createDefaultCapabilities } from 'librecode-types';
import { HttpClient } from './http-client.js';

export async function detectCapabilities(
  httpClient: HttpClient,
  model: string,
  chatPath = '/chat/completions',
  modelsPath = '/models',
): Promise<ProviderCapabilities> {
  const caps = createDefaultCapabilities();

  try {
    const modelResult = await httpClient.request('GET', modelsPath);
    if (modelResult.status === 200) {
      caps.modelDiscovery = true;
    }
  } catch {
    caps.modelDiscovery = false;
  }

  try {
    const testBody = {
      model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
      stream: false,
    };

    const result = await httpClient.request('POST', chatPath, testBody);
    caps.chatCompletions = result.status === 200;

    if (caps.chatCompletions && result.status === 200) {
      try {
        const parsed = JSON.parse(result.body as string) as Record<string, unknown>;
        const usage = parsed['usage'] as Record<string, unknown> | undefined;
        if (usage && typeof usage === 'object') {
          caps.chatCompletions = true;
        }
      } catch {
        caps.chatCompletions = false;
      }
    }
  } catch {
    caps.chatCompletions = false;
  }

  if (caps.chatCompletions) {
    caps.streaming = await testStreaming(httpClient, model, chatPath);
    caps.toolCalling = await testToolCalling(httpClient, model, chatPath);
    caps.jsonMode = await testJsonMode(httpClient, model, chatPath);
    caps.vision = await testVision(httpClient, model, chatPath);
  }

  return caps;
}

async function testStreaming(httpClient: HttpClient, model: string, chatPath: string): Promise<boolean> {
  try {
    const result = await httpClient.request('POST', chatPath, {
      model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
      stream: true,
    });
    return result.status === 200;
  } catch {
    return false;
  }
}

async function testToolCalling(httpClient: HttpClient, model: string, chatPath: string): Promise<boolean> {
  try {
    const result = await httpClient.request('POST', chatPath, {
      model,
      messages: [{ role: 'user', content: 'what is 2+2' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'calculator',
            description: 'Calculate',
            parameters: {
              type: 'object',
              properties: {
                expr: { type: 'string' },
              },
              required: ['expr'],
            },
          },
        },
      ],
      max_tokens: 50,
      stream: false,
    });
    if (result.status !== 200) return false;
    const parsed = JSON.parse(result.body as string) as Record<string, unknown>;
    const choices = parsed['choices'] as Array<Record<string, unknown>> | undefined;
    if (!choices || choices.length === 0) return false;
    const message = choices[0]?.['message'] as Record<string, unknown> | undefined;
    return !!(message?.['tool_calls'] || message?.['content']);
  } catch {
    return false;
  }
}

async function testJsonMode(httpClient: HttpClient, model: string, chatPath: string): Promise<boolean> {
  try {
    const result = await httpClient.request('POST', chatPath, {
      model,
      messages: [{ role: 'user', content: 'say {"ok": true}' }],
      response_format: { type: 'json_object' },
      max_tokens: 10,
      stream: false,
    });
    return result.status === 200;
  } catch {
    return false;
  }
}

async function testVision(httpClient: HttpClient, model: string, chatPath: string): Promise<boolean> {
  try {
    const result = await httpClient.request('POST', chatPath, {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe this image' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
          ],
        },
      ],
      max_tokens: 10,
      stream: false,
    });
    return result.status !== 400;
  } catch {
    return false;
  }
}
