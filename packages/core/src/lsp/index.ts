import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LSPDiagnostic {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string | number;
}

export interface LSPCompletion {
  label: string;
  kind?: string;
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export interface LSPSymbol {
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
  containerName?: string;
}

export interface LSPHover {
  contents: string;
  range?: { start: { line: number; column: number }; end: { line: number; column: number } };
}

export interface LSPLocation {
  file: string;
  line: number;
  column: number;
}

export interface LSPServerConfig {
  language: string;
  command: string;
  args: string[];
  extensions: string[];
  env?: Record<string, string>;
}

const LSP_SERVER_CONFIGS: Record<string, LSPServerConfig> = {
  typescript: {
    language: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  },
  python: {
    language: 'python',
    command: 'pyright-langserver',
    args: ['--stdio'],
    extensions: ['.py', '.pyi'],
  },
  rust: {
    language: 'rust',
    command: 'rust-analyzer',
    args: [],
    extensions: ['.rs'],
  },
  go: {
    language: 'go',
    command: 'gopls',
    args: [],
    extensions: ['.go'],
  },
  c_cpp: {
    language: 'c_cpp',
    command: 'clangd',
    args: ['--background-index'],
    extensions: ['.c', '.cpp', '.h', '.hpp', '.cxx', '.hxx'],
  },
  java: {
    language: 'java',
    command: 'java',
    args: ['-jar', 'eclipse.jdt.ls', '-configuration', 'config_linux', '-data', 'data'],
    extensions: ['.java'],
  },
  kotlin: {
    language: 'kotlin',
    command: 'kotlin-language-server',
    args: [],
    extensions: ['.kt', '.kts'],
  },
};

export interface LSPManagerOptions {
  workspaceRoot: string;
  servers?: string[];
}

export class LSPManager extends EventEmitter {
  private servers = new Map<string, LSPClient>();
  private workspaceRoot: string;
  private options: LSPManagerOptions;

  constructor(options: LSPManagerOptions) {
    super();
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.options = options;
  }

  async startAll(): Promise<void> {
    const languages = this.options.servers ?? Object.keys(LSP_SERVER_CONFIGS);
    for (const lang of languages) {
      await this.start(lang);
    }
  }

  async start(language: string): Promise<LSPClient | null> {
    const config = LSP_SERVER_CONFIGS[language];
    if (!config) return null;
    if (this.servers.has(language)) return this.servers.get(language)!;

    try {
      const client = new LSPClient(config, this.workspaceRoot);
      await client.initialize();
      this.servers.set(language, client);
      client.on('diagnostics', (diags) => this.emit('diagnostics', diags));
      client.on('error', (err) => this.emit('error', err));
      return client;
    } catch {
      return null;
    }
  }

  async stop(language: string): Promise<void> {
    const client = this.servers.get(language);
    if (client) {
      await client.shutdown();
      this.servers.delete(language);
    }
  }

  async stopAll(): Promise<void> {
    for (const [lang] of this.servers) {
      await this.stop(lang);
    }
  }

  getClient(language: string): LSPClient | undefined {
    return this.servers.get(language);
  }

  getClientForFile(filePath: string): LSPClient | undefined {
    const ext = path.extname(filePath).toLowerCase();
    for (const [, client] of this.servers) {
      if (client.config.extensions.includes(ext)) return client;
    }
    return undefined;
  }

  getActiveClients(): LSPClient[] {
    return Array.from(this.servers.values());
  }

  getDiagnostics(): LSPDiagnostic[] {
    const all: LSPDiagnostic[] = [];
    for (const [, client] of this.servers) {
      all.push(...client.getDiagnostics());
    }
    return all;
  }

  static getLanguageForFile(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase();
    for (const [lang, config] of Object.entries(LSP_SERVER_CONFIGS)) {
      if (config.extensions.includes(ext)) return lang;
    }
    return undefined;
  }

  static getAvailableServers(): string[] {
    return Object.keys(LSP_SERVER_CONFIGS).filter((lang) => {
      const config = LSP_SERVER_CONFIGS[lang]!;
      try {
        const result = spawn(config.command, ['--version'], { stdio: 'ignore' });
        result.unref();
        return true;
      } catch {
        return false;
      }
    });
  }

  static isServerAvailable(language: string): boolean {
    const config = LSP_SERVER_CONFIGS[language];
    if (!config) return false;
    try {
      const result = spawn(config.command, ['--version'], { stdio: 'ignore' });
      result.unref();
      return true;
    } catch {
      return false;
    }
  }
}

type JSONRPCRequest = {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
};

type JSONRPCNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

type JSONRPCMessage = JSONRPCRequest | JSONRPCNotification | { jsonrpc: '2.0'; id: number | null; result?: unknown; error?: { code: number; message: string } };

function encodeMessage(msg: JSONRPCMessage): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n${body}`;
}

export class LSPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageId = 1;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  private diagnostics = new Map<string, LSPDiagnostic[]>();
  private initialized = false;
  private buffer = '';
  private capabilities: Record<string, unknown> = {};
  private openFiles = new Set<string>();
  config: LSPServerConfig;

  constructor(config: LSPServerConfig, private workspaceRoot: string) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.config.command, this.config.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.config.env },
        });

        const timeout = setTimeout(() => reject(new Error(`LSP ${this.config.language} startup timed out`)), 15000);

        this.process.stdout!.on('data', (data: Buffer) => this.handleData(data));
        this.process.stderr!.on('data', (data: Buffer) => {
          this.emit('stderr', data.toString());
        });
        this.process.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        this.process.on('exit', (code) => {
          this.emit('exit', code);
          if (!this.initialized) reject(new Error(`LSP exited with code ${code}`));
        });

        const initMsg = encodeMessage({
          jsonrpc: '2.0',
          id: this.messageId++,
          method: 'initialize',
          params: {
            processId: process.pid,
            rootUri: `file://${this.workspaceRoot}`,
            rootPath: this.workspaceRoot,
            capabilities: {
              textDocument: {
                synchronization: { didSave: true, willSave: true, willSaveWaitUntil: false },
                completion: { completionItem: { snippetSupport: true } },
                hover: { contentFormat: ['markdown', 'plaintext'] },
                signatureHelp: {},
                declaration: { linkSupport: true },
                definition: { linkSupport: true },
                typeDefinition: { linkSupport: true },
                implementation: { linkSupport: true },
                references: {},
                documentHighlight: {},
                documentSymbol: { hierarchicalDocumentSymbolSupport: true },
                codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix', 'refactor', 'source'] } } },
                codeLens: {},
                formatting: {},
                rename: { prepareSupport: true },
                semanticTokens: { requests: { full: { delta: true } }, formats: ['relative'] },
              },
              workspace: {
                symbol: {},
                didChangeConfiguration: {},
                didChangeWatchedFiles: { dynamicRegistration: true },
              },
            },
            initializationOptions: null,
            trace: 'off',
          },
        });
        this.process.stdin!.write(initMsg);

        this.pendingRequests.set(this.messageId - 1, {
          resolve: (result: unknown) => {
            clearTimeout(timeout);
            this.capabilities = (result as { capabilities: Record<string, unknown> }).capabilities ?? {};
            this.initialized = true;
            this.sendNotification('initialized', {});
            resolve();
          },
          reject: (err) => {
            clearTimeout(timeout);
            reject(err);
          },
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async shutdown(): Promise<void> {
    if (!this.process) return;

    try {
      await this.request('shutdown', null);
      this.sendNotification('exit', {});
    } catch { }

    for (const file of this.openFiles) {
      this.sendNotification('textDocument/didClose', {
        textDocument: { uri: `file://${file}` },
      });
    }

    this.process.kill();
    this.process = null;
    this.initialized = false;
    this.diagnostics.clear();
    this.openFiles.clear();
  }

  async openDocument(filePath: string, content?: string): Promise<void> {
    const uri = `file://${filePath}`;
    if (this.openFiles.has(filePath)) return;

    let text = content;
    if (!text) {
      try { text = fs.readFileSync(filePath, 'utf-8'); } catch { text = ''; }
    }

    this.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: this.config.language, version: 1, text },
    });
    this.openFiles.add(filePath);
  }

  async changeDocument(filePath: string, content: string, version = 2): Promise<void> {
    if (!this.openFiles.has(filePath)) await this.openDocument(filePath, content);
    this.sendNotification('textDocument/didChange', {
      textDocument: { uri: `file://${filePath}`, version },
      contentChanges: [{ text: content }],
    });
  }

  async closeDocument(filePath: string): Promise<void> {
    if (!this.openFiles.has(filePath)) return;
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri: `file://${filePath}` },
    });
    this.openFiles.delete(filePath);
  }

  async getCompletion(filePath: string, line: number, column: number): Promise<LSPCompletion[]> {
    try {
      const result = await this.request('textDocument/completion', {
        textDocument: { uri: `file://${filePath}` },
        position: { line, character: column },
        context: { triggerKind: 1 },
      }) as { items?: LSPCompletion[] };
      return result?.items ?? [];
    } catch { return []; }
  }

  async getHover(filePath: string, line: number, column: number): Promise<LSPHover | null> {
    try {
      const result = await this.request('textDocument/hover', {
        textDocument: { uri: `file://${filePath}` },
        position: { line, character: column },
      }) as LSPHover | null;
      return result;
    } catch { return null; }
  }

  async gotoDefinition(filePath: string, line: number, column: number): Promise<LSPLocation[]> {
    try {
      const result = await this.request('textDocument/definition', {
        textDocument: { uri: `file://${filePath}` },
        position: { line, character: column },
      }) as LSPLocation | LSPLocation[] | null;
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    } catch { return []; }
  }

  async findReferences(filePath: string, line: number, column: number): Promise<LSPLocation[]> {
    try {
      const result = await this.request('textDocument/references', {
        textDocument: { uri: `file://${filePath}` },
        position: { line, character: column },
        context: { includeDeclaration: true },
      }) as LSPLocation[] | null;
      return result ?? [];
    } catch { return []; }
  }

  async getDocumentSymbols(filePath: string): Promise<LSPSymbol[]> {
    try {
      const result = await this.request('textDocument/documentSymbol', {
        textDocument: { uri: `file://${filePath}` },
      }) as Array<{ name: string; kind: number; location: { range: { start: { line: number; character: number } }; uri: string }; containerName?: string }> | null;
      if (!result) return [];
      return result.map((s) => ({
        name: s.name,
        kind: symbolKindToString(s.kind),
        file: s.location.uri.replace('file://', ''),
        line: s.location.range.start.line,
        column: s.location.range.start.character,
        containerName: s.containerName,
      }));
    } catch { return []; }
  }

  async getWorkspaceSymbols(query: string): Promise<LSPSymbol[]> {
    try {
      const result = await this.request('workspace/symbol', {
        query,
      }) as Array<{ name: string; kind: number; location: { range: { start: { line: number; character: number } }; uri: string }; containerName?: string }> | null;
      if (!result) return [];
      return result.map((s) => ({
        name: s.name,
        kind: symbolKindToString(s.kind),
        file: s.location.uri.replace('file://', ''),
        line: s.location.range.start.line,
        column: s.location.range.start.character,
        containerName: s.containerName,
      }));
    } catch { return []; }
  }

  async rename(filePath: string, line: number, column: number, newName: string): Promise<{ [uri: string]: { [line: number]: string } } | null> {
    try {
      const result = await this.request('textDocument/rename', {
        textDocument: { uri: `file://${filePath}` },
        position: { line, character: column },
        newName,
      }) as { changes?: Record<string, { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }[]> } | null;
      if (!result?.changes) return null;
      const formatted: { [uri: string]: { [line: number]: string } } = {};
      for (const [uri, edits] of Object.entries(result.changes)) {
        formatted[uri] = {};
        for (const edit of edits) {
          formatted[uri]![edit.range.start.line] = edit.newText;
        }
      }
      return formatted;
    } catch { return null; }
  }

  async getCodeActions(filePath: string, line: number, column: number): Promise<Array<{ title: string; kind?: string }>> {
    try {
      const result = await this.request('textDocument/codeAction', {
        textDocument: { uri: `file://${filePath}` },
        range: { start: { line, character: column }, end: { line: line + 1, character: 0 } },
        context: { diagnostics: this.diagnostics.get(filePath) ?? [] },
      }) as Array<{ title: string; kind?: string }> | null;
      return result ?? [];
    } catch { return []; }
  }

  async formatDocument(filePath: string): Promise<string | null> {
    try {
      const result = await this.request('textDocument/formatting', {
        textDocument: { uri: `file://${filePath}` },
        options: { tabSize: 2, insertSpaces: true },
      }) as Array<{ newText: string }> | null;
      if (!result || result.length === 0) return null;
      return result.map((e) => e.newText).join('');
    } catch { return null; }
  }

  async getSignatureHelp(filePath: string, line: number, column: number): Promise<{ signatures: Array<{ label: string; documentation?: string }>; activeSignature?: number; activeParameter?: number } | null> {
    try {
      return await this.request('textDocument/signatureHelp', {
        textDocument: { uri: `file://${filePath}` },
        position: { line, character: column },
      }) as { signatures: Array<{ label: string; documentation?: string }>; activeSignature?: number; activeParameter?: number } | null;
    } catch { return null; }
  }

  getDiagnostics(): LSPDiagnostic[] {
    const all: LSPDiagnostic[] = [];
    for (const [, diags] of this.diagnostics) {
      all.push(...diags);
    }
    return all;
  }

  getDiagnosticsForFile(filePath: string): LSPDiagnostic[] {
    return this.diagnostics.get(filePath) ?? [];
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      const msg = encodeMessage({ jsonrpc: '2.0', id, method, params });
      this.pendingRequests.set(id, { resolve, reject });
      this.process?.stdin?.write(msg);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    const msg = encodeMessage({ jsonrpc: '2.0', method, params });
    this.process?.stdin?.write(msg);
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString('utf-8');
    this.processMessages();
  }

  private processMessages(): void {
    const headerEnd = '\r\n\r\n';
    while (true) {
      const idx = this.buffer.indexOf(headerEnd);
      if (idx === -1) break;

      const header = this.buffer.slice(0, idx);
      const contentLengthMatch = header.match(/Content-Length: (\d+)/i);
      if (!contentLengthMatch) { this.buffer = this.buffer.slice(idx + 4); continue; }

      const contentLength = parseInt(contentLengthMatch[1]!, 10);
      const bodyStart = idx + 4;
      if (this.buffer.length < bodyStart + contentLength) break;

      const body = this.buffer.slice(bodyStart, bodyStart + contentLength);
      this.buffer = this.buffer.slice(bodyStart + contentLength);

      try {
        const msg = JSON.parse(body) as JSONRPCMessage;
        this.handleMessage(msg);
      } catch { /* skip malformed */ }
    }
  }

  private handleMessage(msg: JSONRPCMessage): void {
    if ('id' in msg && msg.id !== null && msg.id !== undefined) {
      const pending = this.pendingRequests.get(msg.id as number);
      if (pending) {
        this.pendingRequests.delete(msg.id as number);
        if ('error' in msg && msg.error) {
          pending.reject(new Error(`LSP ${this.config.language}: ${(msg as { error: { message: string } }).error.message}`));
        } else {
          pending.resolve((msg as { result: unknown }).result);
        }
      }
    } else if ('method' in msg && msg.method) {
      this.handleNotification(msg.method, (msg as JSONRPCNotification).params);
    }
  }

  private handleNotification(method: string, params: unknown): void {
    switch (method) {
      case 'textDocument/publishDiagnostics': {
        const p = params as { uri: string; diagnostics: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; message: string; severity?: number; source?: string; code?: string | number }> };
        const filePath = p.uri.replace('file://', '');
        const diags: LSPDiagnostic[] = p.diagnostics.map((d) => ({
          file: filePath,
          line: d.range.start.line,
          column: d.range.start.character,
          endLine: d.range.end.line,
          endColumn: d.range.end.character,
          message: d.message,
          severity: severityToString(d.severity ?? 1),
          source: d.source,
          code: d.code,
        }));
        this.diagnostics.set(filePath, diags);
        this.emit('diagnostics', diags);
        break;
      }
    }
  }
}

function severityToString(severity: number): 'error' | 'warning' | 'info' | 'hint' {
  switch (severity) {
    case 1: return 'error';
    case 2: return 'warning';
    case 3: return 'info';
    case 4: return 'hint';
    default: return 'info';
  }
}

function symbolKindToString(kind: number): string {
  const names: Record<number, string> = {
    1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
    6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum',
    11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant', 15: 'String',
    16: 'Number', 17: 'Boolean', 18: 'Array', 19: 'Object', 20: 'Key',
    21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event', 25: 'Operator',
    26: 'TypeParameter',
  };
  return names[kind] ?? 'Unknown';
}
