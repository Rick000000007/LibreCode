import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http';
  url?: string;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPCallResult {
  success: boolean;
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
}

export class MCPClient {
  private config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private buffer = '';
  private pendingRequests = new Map<string, { resolve: (v: MCPCallResult) => void; reject: (e: Error) => void }>();
  private initialized = false;
  private requestId = 0;
  private readonly requestTimeout: number;

  constructor(config: MCPServerConfig, requestTimeout?: number) {
    this.config = config;
    this.requestTimeout = requestTimeout ?? 30_000;
  }

  async connect(): Promise<boolean> {
    if (this.config.transport === 'http' && this.config.url) {
      return this.connectHttp();
    }
    return this.connectStdio();
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.initialized = false;
    this.buffer = '';
    const pending = Array.from(this.pendingRequests.values());
    this.pendingRequests.clear();
    for (const p of pending) {
      p.reject(new Error('Client disconnected'));
    }
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    try {
      const result = await this.sendRequest('tools/list', {});
      if (!result.success) return [];
      const tools = (result as unknown as { result?: { tools?: MCPToolDefinition[] } }).result?.tools;
      return tools ?? [];
    } catch {
      return [];
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPCallResult> {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  isConnected(): boolean {
    return this.initialized && this.process !== null && !this.process.killed;
  }

  private async connectStdio(): Promise<boolean> {
    try {
      const spawnOpts: SpawnOptions = {
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.requestTimeout,
      };
      if (process.platform === 'win32') {
        spawnOpts.shell = true;
      }
      this.process = spawn(this.config.command, this.config.args ?? [], spawnOpts);

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      this.process.on('exit', (code, signal) => {
        this.initialized = false;
        this.process = null;
        const pending = Array.from(this.pendingRequests.values());
        this.pendingRequests.clear();
        for (const p of pending) {
          p.reject(new Error(`MCP process exited (code: ${code}, signal: ${signal})`));
        }
      });

      this.process.on('error', (err) => {
        this.initialized = false;
        this.process = null;
        const pending = Array.from(this.pendingRequests.values());
        this.pendingRequests.clear();
        for (const p of pending) {
          p.reject(err);
        }
      });

      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'librecode', version: '1.0.0' },
      });

      if (initResult.success) {
        await this.sendRequest('notifications/initialized', {});
        this.initialized = true;
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  private async connectHttp(): Promise<boolean> {
    return false;
  }

  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]!.trim();
      if (!line) continue;

      try {
        const msg = JSON.parse(line);
        const id = String(msg.id);
        const pending = this.pendingRequests.get(id);
        if (pending) {
          if (msg.error) {
            pending.resolve({
              success: false,
              content: [],
              isError: true,
            });
          } else {
            pending.resolve({
              success: true,
              content: msg.result ? [{ type: 'text', text: JSON.stringify(msg.result) }] : [],
              ...msg.result,
            });
          }
          this.pendingRequests.delete(id);
        }
      } catch {
      }
    }

    this.buffer = lines[lines.length - 1] ?? '';
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<MCPCallResult> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      const request = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });

      this.pendingRequests.set(String(id), { resolve, reject });

      if (this.process?.stdin?.writable && !this.process.killed) {
        this.process.stdin.write(request + '\n');
      } else {
        reject(new Error('Not connected'));
        this.pendingRequests.delete(String(id));
        return;
      }

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(String(id))) {
          this.pendingRequests.delete(String(id));
          reject(new Error(`Request timed out: ${method} (after ${this.requestTimeout}ms)`));
        }
      }, this.requestTimeout);

      const originalResolve = resolve;
      const originalReject = reject;
      this.pendingRequests.set(String(id), {
        resolve: (v) => { clearTimeout(timer); originalResolve(v); },
        reject: (e) => { clearTimeout(timer); originalReject(e); },
      });
    });
  }
}

export class MCPServerManager {
  private clients: Map<string, MCPClient> = new Map();
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? this.defaultConfigPath();
  }

  async loadConfig(): Promise<{ name: string; config: MCPServerConfig }[]> {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        const configs = JSON.parse(content) as Record<string, MCPServerConfig>;
        return Object.entries(configs).map(([name, config]) => ({ name, config }));
      }
    } catch {
    }
    return [];
  }

  async connectAll(): Promise<number> {
    const entries = await this.loadConfig();
    let connected = 0;

    for (const { name, config } of entries) {
      const client = new MCPClient(config);
      try {
        const ok = await client.connect();
        if (ok) {
          this.clients.set(name, client);
          connected++;
        }
      } catch {
      }
    }

    return connected;
  }

  async disconnectAll(): Promise<void> {
    for (const [, client] of this.clients) {
      await client.disconnect();
    }
    this.clients.clear();
  }

  async discoverTools(): Promise<MCPToolDefinition[]> {
    const all: MCPToolDefinition[] = [];
    for (const [, client] of this.clients) {
      try {
        const tools = await client.listTools();
        all.push(...tools);
      } catch {
      }
    }
    return all;
  }

  getClient(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }

  getConnectedCount(): number {
    return this.clients.size;
  }

  private defaultConfigPath(): string {
    const xdg = process.env['XDG_CONFIG_HOME'];
    const base = xdg ? path.join(xdg, 'librecode') : path.join(os.homedir(), '.config', 'librecode');
    return path.join(base, 'mcp-servers.json');
  }
}
