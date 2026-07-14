import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionManager } from '../session';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'librecode-session-test-'));
}

describe('SessionManager', () => {
  let dir: string;
  let manager: SessionManager;

  beforeEach(() => {
    dir = tmpDir();
    manager = new SessionManager(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates a new session', async () => {
    const session = await manager.create('test session');
    expect(session.metadata.id).toBeTruthy();
    expect(session.metadata.name).toBe('test session');
    expect(session.messages).toEqual([]);
  });

  it('saves and loads a session', async () => {
    const created = await manager.create('save test');
    created.messages.push({ role: 'user', content: 'hello' });
    created.messages.push({ role: 'assistant', content: 'hi' });
    await manager.save(created);

    const loaded = await manager.load(created.metadata.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.messages.length).toBe(2);
    expect(loaded!.messages[0]!.content).toBe('hello');
    expect(loaded!.metadata.messageCount).toBe(2);
  });

  it('lists sessions in order of update time', async () => {
    const s1 = await manager.create('first');
    await new Promise(r => setTimeout(r, 10));
    const s2 = await manager.create('second');

    const list = await manager.list();
    expect(list.length).toBe(2);
    expect(list[0]!.name).toBe('second');
  });

  it('renames a session', async () => {
    const session = await manager.create('old name');
    const ok = await manager.rename(session.metadata.id, 'new name');
    expect(ok).toBe(true);

    const loaded = await manager.load(session.metadata.id);
    expect(loaded!.metadata.name).toBe('new name');
  });

  it('deletes a session', async () => {
    const session = await manager.create('to delete');
    const ok = await manager.delete(session.metadata.id);
    expect(ok).toBe(true);

    const loaded = await manager.load(session.metadata.id);
    expect(loaded).toBeNull();
  });

  it('exports and imports a session', async () => {
    const original = await manager.create('export test');
    original.messages.push({ role: 'user', content: 'test' });
    await manager.save(original);

    const exported = await manager.exportSession(original.metadata.id);
    expect(exported).not.toBeNull();

    const imported = await manager.importSession(exported!);
    expect(imported).not.toBeNull();
    expect(imported!.metadata.id).not.toBe(original.metadata.id);
    expect(imported!.messages[0]!.content).toBe('test');
  });

  it('returns null for missing session', async () => {
    const loaded = await manager.load('nonexistent');
    expect(loaded).toBeNull();
  });

  it('tracks current session id', async () => {
    expect(manager.getCurrentSessionId()).toBeNull();

    const session = await manager.create('current');
    expect(manager.getCurrentSessionId()).toBe(session.metadata.id);

    await manager.load(session.metadata.id);
    expect(manager.getCurrentSessionId()).toBe(session.metadata.id);
  });
});
