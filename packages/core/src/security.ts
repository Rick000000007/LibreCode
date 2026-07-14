import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface SecurityPolicy {
  allowedCommands: string[];
  deniedCommands: string[];
  allowedPaths: string[];
  deniedPaths: string[];
  allowNetwork: boolean;
  maxFileSize: number;
  confirmDangerous: boolean;
  auditLog: boolean;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  toolName: string;
  args: string;
  result: 'allowed' | 'denied' | 'error';
  user: string;
}

export class SecurityManager {
  private policy: SecurityPolicy;
  private auditLog: AuditEntry[] = [];
  private auditLogPath: string;

  constructor(policy?: Partial<SecurityPolicy>) {
    this.policy = {
      allowedCommands: [],
      deniedCommands: ['rm -rf', 'sudo', 'chmod -R', 'dd', 'mkfs', '> /dev', ':(){ :|:& };:'],
      allowedPaths: [],
      deniedPaths: ['/etc', '/usr', '/boot', '/sys', '/proc', '/dev', 'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\System32'],
      allowNetwork: true,
      maxFileSize: 10 * 1024 * 1024,
      confirmDangerous: true,
      auditLog: true,
      ...policy,
    };

    const xdg = process.env['XDG_DATA_HOME'];
    const base = xdg ? path.join(xdg, 'librecode') : path.join(os.homedir(), '.local', 'share', 'librecode');
    this.auditLogPath = path.join(base, 'audit.log');
  }

  checkCommand(command: string): { allowed: boolean; reason?: string } {
    for (const denied of this.policy.deniedCommands) {
      if (command.includes(denied)) {
        this.log('run_command', command, 'denied');
        return { allowed: false, reason: `Command pattern denied: ${denied}` };
      }
    }

    if (this.policy.allowedCommands.length > 0) {
      const cmdName = command.split(/\s+/)[0] ?? '';
      if (!this.policy.allowedCommands.includes(cmdName)) {
        this.log('run_command', command, 'denied');
        return { allowed: false, reason: `Command not in allowed list: ${cmdName}` };
      }
    }

    this.log('run_command', command, 'allowed');
    return { allowed: true };
  }

  checkPath(filePath: string): { allowed: boolean; reason?: string } {
    const resolved = path.resolve(filePath);

    for (const denied of this.policy.deniedPaths) {
      if (resolved.startsWith(denied) || resolved.startsWith(path.resolve(denied))) {
        return { allowed: false, reason: `Path denied: ${denied}` };
      }
    }

    if (this.policy.allowedPaths.length > 0) {
      const inAllowed = this.policy.allowedPaths.some(allowed =>
        resolved.startsWith(path.resolve(allowed)),
      );
      if (!inAllowed) {
        return { allowed: false, reason: `Path not in allowed list: ${resolved}` };
      }
    }

    return { allowed: true };
  }

  checkFileSize(size: number): { allowed: boolean; reason?: string } {
    if (size > this.policy.maxFileSize) {
      return {
        allowed: false,
        reason: `File size ${(size / 1024 / 1024).toFixed(1)}MB exceeds limit of ${(this.policy.maxFileSize / 1024 / 1024).toFixed(1)}MB`,
      };
    }
    return { allowed: true };
  }

  needsConfirmation(toolName: string, args: Record<string, unknown>): boolean {
    if (!this.policy.confirmDangerous) return false;

    const dangerousPatterns: Array<{ tool: string; check: (args: Record<string, unknown>) => boolean }> = [
      {
        tool: 'run_command',
        check: (a) => {
          const cmd = (a['command'] as string) ?? '';
          return cmd.includes('rm -rf') || cmd.includes('sudo') || cmd.includes('dd');
        },
      },
      {
        tool: 'write_file',
        check: (a) => {
          const content = (a['content'] as string) ?? '';
          return content.includes('process.env') || content.includes('token') || content.includes('secret');
        },
      },
      {
        tool: 'git',
        check: (a) => {
          const cmd = (a['command'] as string) ?? '';
          return cmd.includes('push --force') || cmd.includes('reset --hard') || cmd.includes('rebase');
        },
      },
    ];

    const rule = dangerousPatterns.find(p => p.tool === toolName);
    return rule ? rule.check(args) : false;
  }

  formatConfirmationPrompt(toolName: string, args: Record<string, unknown>): string {
    const lines: string[] = [];
    lines.push(`\x1b[1;33m⚠ Dangerous Operation\x1b[0m`);
    lines.push(`  Tool: ${toolName}`);
    for (const [key, value] of Object.entries(args)) {
      const str = String(value);
      lines.push(`  ${key}: ${str.length > 100 ? str.slice(0, 100) + '...' : str}`);
    }
    lines.push(`  \x1b[1;31mAre you sure? (y/N):\x1b[0m`);
    return lines.join('\n');
  }

  private log(toolName: string, args: string, result: AuditEntry['result']): void {
    if (!this.policy.auditLog) return;

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action: `tool_execution`,
      toolName,
      args: args.slice(0, 200),
      result,
      user: process.env['USER'] ?? 'unknown',
    };

    this.auditLog.push(entry);

    try {
      const dir = path.dirname(this.auditLogPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.auditLogPath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch {
    }
  }

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }

  updatePolicy(updates: Partial<SecurityPolicy>): void {
    Object.assign(this.policy, updates);
  }
}
