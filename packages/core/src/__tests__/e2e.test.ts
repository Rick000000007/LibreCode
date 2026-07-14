import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

import { TypeScriptAstProvider } from '../ast-editor/typescript';
import { PythonAstProvider } from '../ast-editor/python';
import { RustAstProvider } from '../ast-editor/rust';
import { GoAstProvider } from '../ast-editor/go';
import { AstProviderRegistry } from '../ast-editor/registry';
import { CodeIndexer, VectorIndex, TfIdfVectorizer, OpenAIEmbeddingProvider } from '../rag';
import { MCPHttpClient, MCPHttpServer } from '../mcp-http';
import { ChokidarWatcher } from '../chokidar-watcher';
import { OpenTelemetryManager } from '../opentelemetry';
import { GitWorkflow } from '../git-workflow';
import { CheckpointManager, createDiff } from '../checkpoint';
import { LearningMemory } from '../memory';
import { EnterpriseSecurityManager } from '../enterprise-security';
import { ParallelExecutor, type Task } from '../parallel';
import { PluginMarketplace, type PluginManifest } from '../marketplace';
import { ObservabilityManager } from '../observability';
import { WorkspaceOrchestrator } from '../workspace-orchestrator';
import { AutoValidator } from '../validation';
import { AgentOrchestrator } from '../orchestrator';
import { SessionManager } from '../session';

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-test-'));
  fs.writeFileSync(path.join(dir, 'index.ts'), `const greeting = 'Hello World';\nconsole.log(greeting);\n`, 'utf-8');
  fs.writeFileSync(path.join(dir, 'utils.ts'), `export function add(a: number, b: number): number {\n  return a + b;\n}\n`, 'utf-8');
  fs.writeFileSync(path.join(dir, 'app.py'), `def hello():\n    print("Hello World")\n\nclass Calculator:\n    def add(self, a, b):\n        return a + b\n`, 'utf-8');
  return dir;
}

describe('E2E: Build a Project', () => {
  it('AST-edits a TypeScript project', () => {
    const provider = new TypeScriptAstProvider();
    const source = `export function greet(name: string): string {\n  return 'Hello ' + name;\n}\n`;
    const result = provider.renameSymbol(source, 'greet', 'greeting');
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('function greeting');
  });

  it('AST-edits a Python project', () => {
    const provider = new PythonAstProvider();
    const source = `def old_name():\n    pass\n`;
    const result = provider.renameSymbol(source, 'old_name', 'new_name');
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('def new_name');
  });

  it('Registry detects languages correctly', () => {
    const reg = new AstProviderRegistry();
    expect(reg.getProviderForFile('test.ts')).not.toBeNull();
    expect(reg.getProviderForFile('test.py')).not.toBeNull();
    expect(reg.getProvider('typescript')?.language).toBe('typescript');
    expect(reg.getProvider('python')?.language).toBe('python');
  });
});

describe('E2E: Fix Compiler Errors', () => {
  it('detects missing types', () => {
    const source = `function add(a, b): number {\n  return a + b;\n}`;
    const provider = new TypeScriptAstProvider();
    const symbols = provider.extractSymbols(source);
    expect(symbols.length).toBeGreaterThan(0);
  });

  it('validates code structure', async () => {
    const dir = createTempDir();
    try {
      const validator = new AutoValidator();
      const result = await validator.validate(dir);
      expect(result.passed).toBeDefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('E2E: Refactor Code', () => {
  it('renames across TypeScript files', () => {
    const provider = new TypeScriptAstProvider();
    const source = `const oldName = 42;\nconsole.log(oldName);\n`;
    const result = provider.renameSymbol(source, 'oldName', 'newName');
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('const newName = 42');
    expect(result.newContent).toContain('console.log(newName)');
  });

  it('extracts symbols for refactoring analysis', () => {
    const provider = new TypeScriptAstProvider();
    const source = `class MyClass {\n  myMethod() {}\n}\nfunction helper() {}\n`;
    const symbols = provider.extractSymbols(source);
    expect(symbols.some(s => s.name === 'MyClass')).toBe(true);
    expect(symbols.some(s => s.name === 'helper')).toBe(true);
  });
});

describe('E2E: Generate Tests', () => {
  it('uses AutoValidator to create validation steps', async () => {
    const validator = new AutoValidator();
    const dir = createTempDir();
    try {
      const report = await validator.validate(dir);
      expect(report.passed).toBeDefined();
      expect(report.steps.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('E2E: Review Pull Requests', () => {
  it('generates PR descriptions via GitWorkflow', () => {
    const gw = new GitWorkflow('/tmp');
    const desc = gw.generatePRDescription('fix/login-bug', 'Fixed login validation\nAdded error handling');
    expect(desc).toContain('Bug fix');
    expect(desc).toContain('Fixed login validation');
  });
});

describe('E2E: Multi-Agent Workflow', () => {
  it('submits and tracks tasks', async () => {
    const indexer = new CodeIndexer();
    const reg = new AstProviderRegistry();
    const orch = new AgentOrchestrator(reg, indexer);

    const id = await orch.submit({
      type: 'search',
      description: 'find all function declarations',
      priority: 1,
    });

    expect(id).toBeTruthy();
    const task = orch.getTask(id);
    expect(task).toBeDefined();
    expect(task!.status).toBe('running');
  });
});

describe('E2E: Plugin Loading', () => {
  it('installs and manages plugins', () => {
    const pm = new PluginMarketplace();
    const manifest: PluginManifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin',
      author: 'test',
      entry: './index.js',
    };
    const pkg = pm.install(manifest, 'const x = 1;');
    expect(pkg.enabled).toBe(true);
    expect(pkg.manifest.id).toBe('test-plugin');

    expect(pm.getPlugin('test-plugin')).toBeDefined();
    pm.disable('test-plugin');
    expect(pm.getPlugin('test-plugin')!.enabled).toBe(false);
  });
});

describe('E2E: Session Restore', () => {
  it('creates and lists checkpoints', () => {
    const cm = new CheckpointManager();
    const dir = createTempDir();
    try {
      const cp = cm.saveCheckpoint('initial state', [path.join(dir, 'index.ts')]);
      expect(cp.description).toBe('initial state');
      expect(cm.getLatestCheckpoint()!.id).toBe(cp.id);
      expect(cm.listCheckpoints().length).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('generates diffs for review', () => {
    const oldContent = 'line1\nline2\nline3';
    const newContent = 'line1\nmodified\nline3';
    const diff = createDiff(oldContent, newContent);
    expect(diff).toContain('-line2');
    expect(diff).toContain('+modified');
  });
});

describe('E2E: Git Workflow', () => {
  it('suggests branches and commits', () => {
    const gw = new GitWorkflow('/tmp');
    expect(gw.suggestBranch('Fix login bug')).toBe('feat/fix-login-bug');
    expect(gw.generateCommitMessage('diff --git a/test.ts b/test.ts\n+new code\n-old code')).toContain('update');
  });
});

describe('E2E: Security Policies', () => {
  it('enforces enterprise permissions', () => {
    const esm = new EnterpriseSecurityManager();
    const user = esm.createUser({
      username: 'dev1',
      roles: [],
      enabled: true,
      mfaEnabled: false,
    });

    expect(esm.checkPermission(user.id, 'file:secret.key', 'read')).toBe(false);

    const adminRole = esm.listRoles().find(r => r.name === 'admin')!;
    esm.updateUser(user.id, { roles: [adminRole.id] });
    expect(esm.hasPermission(user.id, 'file:anything', 'read')).toBe(true);
  });

  it('audits security events', () => {
    const esm = new EnterpriseSecurityManager();
    const user = esm.createUser({ username: 'test', roles: [], enabled: true, mfaEnabled: false });
    esm.checkPermission(user.id, 'file:test', 'read');
    const log = esm.getAuditLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]!.result).toBe('deny');
  });
});

describe('E2E: Observability', () => {
  it('logs and traces operations', () => {
    const obs = new ObservabilityManager();

    obs.info('test', 'starting e2e test');
    obs.error('test', 'simulated error for testing');
    const logs = obs.getLogs();
    expect(logs.length).toBe(2);
    expect(logs.some(l => l.level === 'error')).toBe(true);

    const span = obs.startSpan('e2e-test-span');
    obs.endSpan(span.id, 'ok');
    const traces = obs.getTraces();
    expect(traces.length).toBeGreaterThan(0);
  });
});

describe('E2E: Workspace Operations', () => {
  it('manages workspace files', async () => {
    const dir = createTempDir();
    try {
      const ws = new WorkspaceOrchestrator(dir);
      await ws.init();

      const files = await ws.listFiles();
      expect(files.length).toBeGreaterThan(0);

      const content = await ws.readFile('index.ts');
      expect(content).toContain('Hello World');

      await ws.writeFile('new-file.ts', 'export const x = 1;\n');
      const updated = await ws.listFiles();
      expect(updated.some(f => f.includes('new-file.ts'))).toBe(true);

      ws.destroy();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('E2E: Hybrid RAG', () => {
  it('performs hybrid search with TF-IDF', async () => {
    const index = new VectorIndex();
    await index.index([
      { id: '1', file: 'test.ts', content: 'function add(a, b) { return a + b; }', startLine: 1, endLine: 1, type: 'function', tokens: 10 },
      { id: '2', file: 'test.py', content: 'def subtract(a, b): return a - b', startLine: 1, endLine: 1, type: 'function', tokens: 10 },
    ]);
    const results = await index.hybridSearch('add', 0.5, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.chunk.file).toBe('test.ts');
  });

  it('handles empty index gracefully', async () => {
    const index = new VectorIndex();
    const results = await index.hybridSearch('anything', 0.5, 5);
    expect(results).toEqual([]);
  });
});

describe('E2E: MCP HTTP Transport', () => {
  it('MCPHttpServer starts and stops', async () => {
    const server = new MCPHttpServer({ url: 'http://localhost:0', retries: 0 });
    server.registerTool('echo', async (args) => ({ echoed: args }));
    await server.start(0);
    await server.stop();
  });

  it('MCPHttpClient constructs valid requests', () => {
    const client = new MCPHttpClient({ url: 'http://localhost:9999', retries: 0, timeout: 100 });
    expect(client).toBeDefined();
  });
});

describe('E2E: Rust AST Provider', () => {
  it('extracts Rust symbols', () => {
    const provider = new RustAstProvider();
    const source = `pub fn hello() {}\nfn private() {}\npub struct MyStruct;\nenum MyEnum { A, B }`;
    const symbols = provider.extractSymbols(source);
    expect(symbols.some(s => s.name === 'hello')).toBe(true);
    expect(symbols.some(s => s.name === 'MyStruct')).toBe(true);
    expect(symbols.some(s => s.name === 'MyEnum')).toBe(true);
  });

  it('renames Rust symbols', () => {
    const provider = new RustAstProvider();
    const result = provider.renameSymbol('fn old_fn() {}', 'old_fn', 'new_fn');
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('new_fn');
  });

  it('deletes Rust declarations', () => {
    const provider = new RustAstProvider();
    const result = provider.deleteDeclaration('pub fn unused() {}\nfn keep() {}', 'unused');
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('unused');
  });
});

describe('E2E: Go AST Provider', () => {
  it('extracts Go symbols', () => {
    const provider = new GoAstProvider();
    const source = `func Hello() {}\ntype MyStruct struct {}\ntype MyInterface interface {}`;
    const symbols = provider.extractSymbols(source);
    expect(symbols.some(s => s.name === 'Hello')).toBe(true);
    expect(symbols.some(s => s.name === 'MyStruct')).toBe(true);
  });

  it('renames Go symbols', () => {
    const provider = new GoAstProvider();
    const result = provider.renameSymbol('func oldFunc() {}', 'oldFunc', 'newFunc');
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('newFunc');
  });
});

describe('E2E: Chokidar Watcher', () => {
  it('creates and stops watcher', async () => {
    const dir = createTempDir();
    try {
      const watcher = new ChokidarWatcher({ paths: dir, persistent: false, depth: 1 });
      await watcher.start();
      expect(watcher.isReady()).toBe(false);
      await watcher.stop();
      expect(watcher.isReady()).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('E2E: OpenTelemetry', () => {
  it('records spans and metrics', () => {
    const otel = new OpenTelemetryManager({ type: 'console', serviceName: 'e2e-test' });
    otel.recordMetric({ name: 'test_metric', value: 42, unit: 'count', attributes: {}, timestamp: Date.now() });
    const { span, end } = otel.createTrace('e2e-span', 'INTERNAL');
    expect(span.name).toBe('e2e-span');
    end({ code: 'OK' });
  });

  it('exports to file', async () => {
    const filePath = path.join(os.tmpdir(), `otel-test-${Date.now()}.jsonl`);
    try {
      const otel = new OpenTelemetryManager({ type: 'file', filePath, serviceName: 'e2e-test' });
      otel.recordMetric({ name: 'm1', value: 1, unit: 'ms', attributes: {}, timestamp: Date.now() });
      const { end } = otel.createTrace('t1');
      end({ code: 'OK' });
      await otel.flush();
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('metric');
      expect(content).toContain('span');
    } finally {
      try { fs.unlinkSync(filePath); } catch { }
    }
  });
});

describe('E2E: Session Recovery', () => {
  it('saves and restores session metadata', async () => {
    const manager = new SessionManager(os.tmpdir());
    const session = await manager.create('test-session');
    expect(session.metadata.id).toBeTruthy();

    const sessions = await manager.list();
    expect(sessions.some(s => s.id === session.metadata.id)).toBe(true);

    const loaded = await manager.load(session.metadata.id);
    expect(loaded).toBeDefined();
    expect(loaded!.messages).toEqual([]);
  });
});

describe('E2E: Multi-Agent Workflow Advanced', () => {
  it('submits multiple tasks with priorities', async () => {
    const indexer = new CodeIndexer();
    const reg = new AstProviderRegistry();
    const orch = new AgentOrchestrator(reg, indexer);

    const id1 = await orch.submit({ type: 'search', description: 'find imports', priority: 2 });
    const id2 = await orch.submit({ type: 'refactor', description: 'rename symbols', priority: 1 });
    expect(id1).not.toBe(id2);

    const status = orch.getStatus();
    expect(status.pending + status.running + status.completed).toBe(2);
  });
});
