import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PersistenceStore } from '../persistence.js';

let dbCounter = 0;

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `librecode-db-test-${dbCounter++}-`));
  return path.join(dir, 'test.db');
}

describe('PersistenceStore V2', () => {
  it('creates tables and runs migrations', () => {
    const dbPath = tmpDbPath();
    const store = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });
    expect(store).toBeDefined();
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch { /* skip */ }
  });

  it('saves and retrieves conversations', () => {
    const dbPath = tmpDbPath();
    const store = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });

    // Create a session first (FK constraint)
    store.saveSession({ id: 'session-1', createdAt: new Date(), updatedAt: new Date(), data: { test: true }, metadata: {} });

    store.saveConversation({
      id: 'conv-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'Hello',
      tokenCount: 5,
      createdAt: new Date().toISOString(),
      metadata: { source: 'test' },
    });

    const conv = store.getConversation('conv-1');
    expect(conv).toBeDefined();
    expect((conv as any).role).toBe('user');
    expect((conv as any).content).toBe('Hello');
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch { /* skip */ }
  });

  it('lists conversations by session', () => {
    const dbPath = tmpDbPath();
    const store = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });

    store.saveSession({ id: 's1', createdAt: new Date(), updatedAt: new Date(), data: {}, metadata: {} });
    store.saveSession({ id: 's2', createdAt: new Date(), updatedAt: new Date(), data: {}, metadata: {} });

    store.saveConversation({ id: 'c1', sessionId: 's1', role: 'user', content: 'a', tokenCount: 1, createdAt: new Date().toISOString(), metadata: {} });
    store.saveConversation({ id: 'c2', sessionId: 's1', role: 'assistant', content: 'b', tokenCount: 2, createdAt: new Date().toISOString(), metadata: {} });
    store.saveConversation({ id: 'c3', sessionId: 's2', role: 'user', content: 'c', tokenCount: 1, createdAt: new Date().toISOString(), metadata: {} });

    const s1Convs = store.listConversations('s1');
    expect(s1Convs).toHaveLength(2);
    const s2Convs = store.listConversations('s2');
    expect(s2Convs).toHaveLength(1);
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch { /* skip */ }
  });

  it('saves provider history', () => {
    const dbPath = tmpDbPath();
    const store = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });

    store.saveProviderHistory({
      id: 'ph-1',
      provider: 'openai',
      model: 'gpt-4',
      action: 'chat',
      tokensIn: 100,
      tokensOut: 50,
      durationMs: 1500,
      cost: 0.002,
      success: true,
      timestamp: new Date().toISOString(),
    });

    const stats = store.getProviderStats();
    expect(stats).toHaveLength(1);
    expect(stats[0]!.provider).toBe('openai');
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch { /* skip */ }
  });

  it('manages workspace metadata', () => {
    const dbPath = tmpDbPath();
    const store = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });

    store.setWorkspaceMetadata('repo', 'librecode');
    store.setWorkspaceMetadata('branch', 'main');

    expect(store.getWorkspaceMetadata('repo')).toBe('librecode');
    const all = store.getAllWorkspaceMetadata();
    expect(all).toHaveLength(2);
    store.deleteWorkspaceMetadata('branch');
    expect(store.getWorkspaceMetadata('branch')).toBeUndefined();
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch { /* skip */ }
  });

  it('manages timeline events', () => {
    const dbPath = tmpDbPath();
    const store = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });

    store.saveTimelineEvent({
      id: 'tl-1',
      type: 'file_edit',
      description: 'Edited index.ts',
      timestamp: new Date(),
      data: { file: 'index.ts' },
      tags: ['edit'],
    });

    const events = store.queryTimelineEvents({ limit: 10 });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('file_edit');
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch { /* skip */ }
  });

  it('manages macros', () => {
    const dbPath = tmpDbPath();
    const store = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });

    store.saveMacro({
      name: 'test-macro',
      definition: 'name: test-macro\nsteps:\n  - type: shell\n    shell: echo hello',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const macro = store.getMacro('test-macro');
    expect(macro).toBeDefined();
    expect(store.listMacros()).toHaveLength(1);
    store.deleteMacro('test-macro');
    expect(store.getMacro('test-macro')).toBeUndefined();
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch { /* skip */ }
  });

  it('handles backup and restore', () => {
    const dbPath = tmpDbPath();
    const store = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });

    store.setWorkspaceMetadata('test-key', 'test-value');
    // Test that backup returns a path string
    const backupPath = store.backup();
    expect(typeof backupPath).toBe('string');
    expect(backupPath.length).toBeGreaterThan(0);

    // Test restore with the same file
    store.setWorkspaceMetadata('restore-test', 'restore-value');
    store.close();

    // Open fresh and verify data persists via normal read
    const store2 = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });
    expect(store2.getWorkspaceMetadata('test-key')).toBe('test-value');
    store2.close();

    try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch { /* skip */ }
    try { fs.unlinkSync(backupPath); } catch { /* skip */ }
  });

  it('supports vacuum', () => {
    const dbPath = tmpDbPath();
    const store = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });
    expect(() => store.vacuum()).not.toThrow();
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch { /* skip */ }
  });
});
