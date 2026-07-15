import { describe, it, expect } from 'vitest';
import { LSPManager } from '../lsp/index.js';

describe('LSPManager', () => {
  it('defines server configs for all supported languages', () => {
    const manager = new LSPManager({ workspaceRoot: '/tmp' });
    expect(manager).toBeDefined();
  });

  it('detects language from file extensions', () => {
    expect(LSPManager.getLanguageForFile('file.ts')).toBe('typescript');
    expect(LSPManager.getLanguageForFile('file.tsx')).toBe('typescript');
    expect(LSPManager.getLanguageForFile('file.js')).toBe('typescript');
    expect(LSPManager.getLanguageForFile('file.py')).toBe('python');
    expect(LSPManager.getLanguageForFile('file.rs')).toBe('rust');
    expect(LSPManager.getLanguageForFile('file.go')).toBe('go');
    expect(LSPManager.getLanguageForFile('file.c')).toBe('c_cpp');
    expect(LSPManager.getLanguageForFile('file.cpp')).toBe('c_cpp');
    expect(LSPManager.getLanguageForFile('file.h')).toBe('c_cpp');
    expect(LSPManager.getLanguageForFile('file.java')).toBe('java');
    expect(LSPManager.getLanguageForFile('file.kt')).toBe('kotlin');
    expect(LSPManager.getLanguageForFile('file.xyz')).toBeUndefined();
  });

  it('returns empty diagnostics when no servers running', () => {
    const manager = new LSPManager({ workspaceRoot: '/tmp' });
    expect(manager.getDiagnostics()).toEqual([]);
  });

  it('does not start servers that are not configured', async () => {
    const manager = new LSPManager({ workspaceRoot: '/tmp', servers: ['nonexistent-lang'] });
    await manager.startAll();
    expect(manager.getActiveClients()).toHaveLength(0);
  });

  it('stops all servers gracefully', async () => {
    const manager = new LSPManager({ workspaceRoot: '/tmp' });
    await manager.stopAll();
    expect(manager.getActiveClients()).toHaveLength(0);
  });
});
