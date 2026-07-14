import { describe, it, expect } from 'vitest';
import { GitWorkflow, type GitStatus, type CommitSuggestion } from '../git-workflow';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

function createGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-workflow-test-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name Test', { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, 'initial.txt'), 'initial', 'utf-8');
  execSync('git add . && git commit -m "initial"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

describe('GitWorkflow', () => {
  it('suggests branch names from feature descriptions', () => {
    const gw = new GitWorkflow('/tmp');
    const branch = gw.suggestBranch('Add user authentication');
    expect(branch).toBe('feat/add-user-authentication');
  });

  it('generates commit messages from diff', () => {
    const gw = new GitWorkflow('/tmp');
    const msg = gw.generateCommitMessage('diff --git a/test.ts b/test.ts\n+ new code\n-old code');
    expect(msg).toContain('update');
  });

  it('generates PR descriptions', () => {
    const gw = new GitWorkflow('/tmp');
    const desc = gw.generatePRDescription('feat/new-feature', 'commit1\ncommit2');
    expect(desc).toContain('Feature');
    expect(desc).toContain('commit1');
  });

  it('gets repo status', () => {
    const dir = createGitRepo();
    try {
      const gw = new GitWorkflow(dir);
      const status = gw.getStatus();
      expect(status.branch).toBe('master');
      expect(status.modified).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects modified files', () => {
    const dir = createGitRepo();
    try {
      fs.writeFileSync(path.join(dir, 'initial.txt'), 'modified', 'utf-8');
      const gw = new GitWorkflow(dir);
      const status = gw.getStatus();
      expect(status.modified.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates branches', () => {
    const dir = createGitRepo();
    try {
      const gw = new GitWorkflow(dir);
      const created = gw.createBranch('test-branch');
      expect(created).toBe(true);

      const status = gw.getStatus();
      expect(status.branch).toBe('test-branch');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('performs safe rollback', () => {
    const dir = createGitRepo();
    try {
      fs.writeFileSync(path.join(dir, 'new.txt'), 'content', 'utf-8');
      execSync('git add . && git commit -m "to undo"', { cwd: dir, stdio: 'pipe' });

      const gw = new GitWorkflow(dir);
      const rolled = gw.safeRollback(1);
      expect(rolled).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
