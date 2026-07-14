import type { ProviderCapabilities } from 'librecode-types';
import { createDefaultCapabilities } from 'librecode-types';
import type { Capability } from './types/provider-descriptor.js';

export function capabilitiesFromDescriptor(caps: Capability[]): ProviderCapabilities {
  const set = new Set(caps);
  return {
    chatCompletions: set.has('chat'),
    responsesApi: false,
    streaming: set.has('streaming'),
    vision: set.has('vision'),
    toolCalling: set.has('tools') || set.has('function-calling'),
    reasoning: set.has('structured-output'),
    jsonMode: false,
    embeddings: set.has('embeddings'),
    modelDiscovery: false,
    browserLogin: false,
    deviceFlow: false,
    apiKeys: true,
    localServer: false,
  };
}

export function detectCapabilities(
  _httpClient: import('./http-client.js').HttpClient,
  _model: string,
  _chatPath?: string,
  _modelsPath?: string,
): Promise<ProviderCapabilities> {
  return Promise.resolve(createDefaultCapabilities());
}

async function testStreamging(_httpClient: import('./http-client.js').HttpClient, _model: string, _chatPath: string): Promise<boolean> {
  return false;
}

async function testToolCalling(_httpClient: import('./http-client.js').HttpClient, _model: string, _chatPath: string): Promise<boolean> {
  return false;
}

async function testVision(_httpClient: import('./http-client.js').HttpClient, _model: string, _chatPath: string): Promise<boolean> {
  return false;
}
