import { beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { createHttpClient } from '../http-client.js';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

let cliProcess: ChildProcess | null = null;

export interface E2ETestContext {
  serverUrl: string;
  cliBinary: string;
}

let e2eContext: E2ETestContext | null = null;

export async function getE2EContext(): Promise<E2ETestContext> {
  if (e2eContext) return e2eContext;

  // First ensure we have a server
  const testClient = createHttpClient({ baseUrl: '', timeout: 2000 });
  const candidates = [
    { name: 'Ollama', url: 'http://localhost:11434/v1', check: '/v1/models' },
    { name: 'llama.cpp', url: 'http://localhost:8080/v1', check: '/v1/models' },
    { name: 'LocalAI', url: 'http://localhost:8080/v1', check: '/v1/models' },
    { name: 'LiteLLM', url: 'http://localhost:4000/v1', check: '/v1/models' },
  ];

  let serverUrl = '';
  for (const candidate of candidates) {
    try {
      const res = await testClient.request('GET', `${candidate.url}${candidate.check}`);
      if (res.status === 200) {
        serverUrl = candidate.url;
        console.log(`[E2E] Found ${candidate.name} at ${candidate.url}`);
        break;
      }
    } catch {
      // continue
    }
  }

  if (!serverUrl) {
    throw new Error('No OpenAI-compatible server found for E2E tests');
  }

  // Find CLI binary
  let cliBinary = 'librecode';
  try {
    // Check if built locally
    const { execSync } = await import('node:child_process');
    execSync('pnpm --filter librecode-cli build', { cwd: PROJECT_ROOT, stdio: 'ignore' });
    cliBinary = `node ${path.join(PROJECT_ROOT, 'packages', 'cli', 'dist', 'index.js')}`;
  } catch {
    // Use global binary
  }

  e2eContext = { serverUrl, cliBinary };
  return e2eContext;
}

export async function shutdownE2E(): Promise<void> {
  if (cliProcess) {
    cliProcess.kill();
    cliProcess = null;
  }
  e2eContext = null;
}

beforeAll(async () => {
  await getE2EContext();
}, 60000);

afterAll(async () => {
  await shutdownE2E();
}, 10000);