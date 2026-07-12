import { beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { createHttpClient } from '../http-client.js';
import type { HttpClient as HttpClientType } from '../http-client.js';

export interface TestServer {
  url: string;
  process: ChildProcess | null;
  shutdown(): Promise<void>;
}

let globalServer: TestServer | null = null;

export async function getOrStartTestServer(): Promise<TestServer> {
  if (globalServer) return globalServer;

  // Try to find existing server
  const candidates = [
    { name: 'Ollama', url: 'http://localhost:11434/v1', check: '/v1/models' },
    { name: 'llama.cpp', url: 'http://localhost:8080/v1', check: '/v1/models' },
    { name: 'LocalAI', url: 'http://localhost:8080/v1', check: '/v1/models' },
    { name: 'LiteLLM', url: 'http://localhost:4000/v1', check: '/v1/models' },
  ];

  const testClient = createHttpClient({ baseUrl: '', timeout: 2000 });

  for (const candidate of candidates) {
    try {
      const res = await testClient.request('GET', `${candidate.url}${candidate.check}`);
      if (res.status === 200) {
        console.log(`[Integration] Found ${candidate.name} at ${candidate.url}`);
        globalServer = {
          url: candidate.url,
          process: null,
          async shutdown() {},
        };
        return globalServer;
      }
    } catch {
      // continue
    }
  }

  // Try to start Ollama if available
  try {
    const ollamaCheck = await testClient.request('GET', 'http://localhost:11434/api/tags');
    if (ollamaCheck.status === 200) {
      console.log('[Integration] Ollama API detected, using Ollama');
      globalServer = {
        url: 'http://localhost:11434/v1',
        process: null,
        async shutdown() {},
      };
      return globalServer;
    }
  } catch {
    // Ollama not running
  }

  throw new Error(
    'No OpenAI-compatible server found. Please start one of:\n' +
    '  - Ollama: `ollama serve` (then `ollama pull llama3`) -> http://localhost:11434/v1\n' +
    '  - llama.cpp server: `llama-server -m model.gguf` -> http://localhost:8080/v1\n' +
    '  - LocalAI: `local-ai` -> http://localhost:8080/v1\n' +
    '  - LiteLLM: `litellm --model ollama/llama3` -> http://localhost:4000/v1'
  );
}

export async function shutdownTestServer(): Promise<void> {
  if (globalServer?.shutdown) {
    await globalServer.shutdown();
  }
  globalServer = null;
}

beforeAll(async () => {
  await getOrStartTestServer();
}, 60000);

afterAll(async () => {
  await shutdownTestServer();
}, 10000);