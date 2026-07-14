import * as http from 'node:http';
import type { MCPToolDefinition } from './mcp.js';

export interface MCPHttpTransportConfig {
  url: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  tls?: {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export class MCPHttpClient {
  private readonly config: MCPHttpTransportConfig;
  private readonly baseHeaders: Record<string, string>;
  private requestId = 0;

  constructor(config: MCPHttpTransportConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config,
    };
    this.baseHeaders = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      this.baseHeaders['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    const result = await this.call('tools/list');
    if (result && typeof result === 'object' && 'tools' in result) {
      return (result as { tools: MCPToolDefinition[] }).tools;
    }
    return [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.call('tools/call', { name, arguments: args });
  }

  async ping(): Promise<boolean> {
    try {
      await this.call('ping');
      return true;
    } catch {
      return false;
    }
  }

  private async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = `mcp-${++this.requestId}-${Date.now()}`;
    const body: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= (this.config.retries ?? 3); attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        const res = await fetch(this.config.url, {
          method: 'POST',
          headers: this.baseHeaders,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const json = await res.json() as JsonRpcResponse;
        if (json.error) {
          throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
        }
        return json.result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < (this.config.retries ?? 3)) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 100));
        }
      }
    }
    throw lastError ?? new Error('MCP HTTP call failed');
  }
}

export class MCPHttpServer {
  private readonly config: MCPHttpTransportConfig;
  private running = false;
  private server: http.Server | null = null;
  private tools = new Map<string, ToolHandler>();

  constructor(config: MCPHttpTransportConfig) {
    this.config = config;
  }

  registerTool(name: string, handler: ToolHandler): void {
    this.tools.set(name, handler);
  }

  getToolDefinitions(): MCPToolDefinition[] {
    return Array.from(this.tools.keys()).map(name => ({
      name,
      description: `MCP tool: ${name}`,
      inputSchema: { type: 'object', properties: {} as Record<string, unknown>, required: [] },
    }));
  }

  async start(port: number = 3100): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.server = http.createServer(async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      if (this.config.apiKey) {
        const auth = req.headers['authorization']?.replace('Bearer ', '');
        if (auth !== this.config.apiKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      let bodyStr = '';
      for await (const chunk of req) bodyStr += chunk;

      try {
        const body = JSON.parse(bodyStr) as JsonRpcRequest;
        const id = body.id;
        let response: JsonRpcResponse;

        switch (body.method) {
          case 'ping':
            response = { jsonrpc: '2.0', id, result: { status: 'ok' } };
            break;
          case 'tools/list':
            response = { jsonrpc: '2.0', id, result: { tools: this.getToolDefinitions() } };
            break;
          case 'tools/call': {
            const name = body.params?.['name'] as string;
            const args = body.params?.['arguments'] as Record<string, unknown> ?? {};
            const handler = this.tools.get(name);
            if (!handler) {
              response = { jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${name}` } };
            } else {
              try {
                const result = await handler(args);
                response = { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } };
              } catch (err) {
                response = { jsonrpc: '2.0', id, error: { code: -32000, message: err instanceof Error ? err.message : String(err) } };
              }
            }
            break;
          }
          default:
            response = { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${body.method}` } };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });

    return new Promise<void>((resolve) => {
      this.server!.listen(port, () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise<void>((resolve) => {
        this.server!.close(() => {
          this.server = null;
          this.running = false;
          resolve();
        });
      });
    }
    this.running = false;
  }
}
