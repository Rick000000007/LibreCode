import { describe, it, expect } from 'vitest';
import { SecurityManager } from '../security';

describe('SecurityManager', () => {
  it('allows safe commands by default', () => {
    const sm = new SecurityManager();
    const result = sm.checkCommand('ls -la');
    expect(result.allowed).toBe(true);
  });

  it('blocks dangerous command patterns', () => {
    const sm = new SecurityManager();
    const result = sm.checkCommand('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('denied');
  });

  it('blocks denied paths', () => {
    const sm = new SecurityManager();
    const result = sm.checkPath('/etc/passwd');
    expect(result.allowed).toBe(false);
  });

  it('allows safe paths', () => {
    const sm = new SecurityManager();
    const result = sm.checkPath('/home/user/project/file.ts');
    expect(result.allowed).toBe(true);
  });

  it('checks file size limits', () => {
    const sm = new SecurityManager({ maxFileSize: 100 });
    expect(sm.checkFileSize(50).allowed).toBe(true);
    expect(sm.checkFileSize(200).allowed).toBe(false);
  });

  it('detects dangerous operations', () => {
    const sm = new SecurityManager({ confirmDangerous: true });
    expect(sm.needsConfirmation('run_command', { command: 'rm -rf /' })).toBe(true);
    expect(sm.needsConfirmation('run_command', { command: 'ls' })).toBe(false);
  });

  it('generates confirmation prompt', () => {
    const sm = new SecurityManager();
    const prompt = sm.formatConfirmationPrompt('write_file', { path: '/etc/hosts', content: 'test' });
    expect(prompt).toContain('Dangerous');
    expect(prompt).toContain('write_file');
  });

  it('audits log entries', () => {
    const sm = new SecurityManager({ auditLog: true });
    sm.checkCommand('ls');
    sm.checkCommand('rm -rf /');
    expect(sm.getAuditLog().length).toBe(2);
  });

  it('returns current policy', () => {
    const sm = new SecurityManager({ allowNetwork: false });
    const policy = sm.getPolicy();
    expect(policy.allowNetwork).toBe(false);
  });

  it('updates policy', () => {
    const sm = new SecurityManager();
    sm.updatePolicy({ confirmDangerous: false });
    expect(sm.getPolicy().confirmDangerous).toBe(false);
  });

  it('respects allowed commands', () => {
    const sm = new SecurityManager({ allowedCommands: ['ls', 'cat'] });
    expect(sm.checkCommand('ls').allowed).toBe(true);
    expect(sm.checkCommand('rm').allowed).toBe(false);
  });

  it('blocks sudo commands', () => {
    const sm = new SecurityManager();
    expect(sm.checkCommand('sudo rm -rf /').allowed).toBe(false);
  });
});
