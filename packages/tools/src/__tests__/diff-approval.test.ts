import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DiffApprovalManager } from '../diff-approval';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'diff-approval-test-'));
}

describe('DiffApprovalManager', () => {
  let dir: string;
  let manager: DiffApprovalManager;

  beforeEach(() => {
    dir = tmpDir();
    manager = new DiffApprovalManager({ autoApprove: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('prepares a write for a new file', async () => {
    const filePath = path.join(dir, 'new-file.txt');
    const result = await manager.prepareWrite(filePath, 'hello world', dir);
    expect(result).toContain('Changes pending');
    expect(result).toContain('new-file.txt');
    expect(manager.hasPendingChanges()).toBe(true);
  });

  it('prepares a write for an existing file', async () => {
    const filePath = path.join(dir, 'existing.txt');
    fs.writeFileSync(filePath, 'old content', 'utf-8');

    const result = await manager.prepareWrite(filePath, 'new content', dir);
    expect(result).toContain('Changes pending');
    expect(manager.getPendingDiffs().length).toBe(1);
  });

  it('prepares an edit', async () => {
    const filePath = path.join(dir, 'edit-me.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3', 'utf-8');

    const result = await manager.prepareEdit(filePath, [['line2', 'modified']], dir);
    expect(result).toContain('Changes pending');
    expect(manager.hasPendingChanges()).toBe(true);
  });

  it('returns pending diffs', async () => {
    const f1 = path.join(dir, 'a.txt');
    const f2 = path.join(dir, 'b.txt');
    await manager.prepareWrite(f1, 'content a', dir);
    await manager.prepareWrite(f2, 'content b', dir);

    const diffs = manager.getPendingDiffs();
    expect(diffs.length).toBe(2);
  });

  it('applies all pending changes with autoApprove', async () => {
    const filePath = path.join(dir, 'apply.txt');
    fs.writeFileSync(filePath, 'old', 'utf-8');

    await manager.prepareWrite(filePath, 'new content', dir);
    const approved = await manager.requestApproval();

    expect(approved).toBe(true);
    expect(manager.hasPendingChanges()).toBe(false);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toBe('new content');
  });

  it('cancels all pending changes', async () => {
    const filePath = path.join(dir, 'cancel.txt');
    await manager.prepareWrite(filePath, 'content', dir);

    expect(manager.hasPendingChanges()).toBe(true);
    manager.cancelAll();
    expect(manager.hasPendingChanges()).toBe(false);
  });

  it('handles empty pending changes', async () => {
    expect(manager.hasPendingChanges()).toBe(false);
    const approved = await manager.requestApproval();
    expect(approved).toBe(true);
  });

  it('prepares edit with content preview', async () => {
    const filePath = path.join(dir, 'preview.txt');
    fs.writeFileSync(filePath, 'original line', 'utf-8');

    const result = await manager.prepareEdit(filePath, [['original line', 'updated line']], dir);
    expect(result).toContain('original line');
    expect(result).toContain('Changes pending');
  });

  it('uses custom prompt function', async () => {
    const filePath = path.join(dir, 'custom.txt');
    let promptCalled = false;

    const customManager = new DiffApprovalManager({
      promptFn: async () => {
        promptCalled = true;
        return ['approve_all'];
      },
    });

    await customManager.prepareWrite(filePath, 'content', dir);
    await customManager.requestApproval();

    expect(promptCalled).toBe(true);
    expect(customManager.hasPendingChanges()).toBe(false);
  });
});
