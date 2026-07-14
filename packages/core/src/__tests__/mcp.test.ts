import { describe, it, expect } from 'vitest';
import { MCPClient, MCPServerManager } from '../mcp';

describe('MCPClient', () => {
  it('is not connected initially', () => {
    const client = new MCPClient({ command: 'test', transport: 'stdio' });
    expect(client.isConnected()).toBe(false);
  });

  it('disconnect is safe when not connected', async () => {
    const client = new MCPClient({ command: 'test', transport: 'stdio' });
    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('returns empty tools when disconnected', async () => {
    const client = new MCPClient({ command: 'test', transport: 'stdio' });
    const tools = await client.listTools();
    expect(tools).toEqual([]);
  });
});

describe('MCPServerManager', () => {
  it('creates with default config path', () => {
    const manager = new MCPServerManager();
    expect(manager.getConnectedCount()).toBe(0);
  });

  it('loads config from nonexistent file', async () => {
    const manager = new MCPServerManager('/nonexistent/mcp.json');
    const configs = await manager.loadConfig();
    expect(configs).toEqual([]);
  });

  it('discovers no tools when not connected', async () => {
    const manager = new MCPServerManager();
    const tools = await manager.discoverTools();
    expect(tools).toEqual([]);
  });

  it('disconnectAll is safe when empty', async () => {
    const manager = new MCPServerManager();
    await manager.disconnectAll();
    expect(manager.getConnectedCount()).toBe(0);
  });
});
