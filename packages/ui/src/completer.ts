import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Completion {
  text: string;
  label: string;
  description: string;
  icon?: string;
}

export type CompletionTrigger = '/' | '@' | '#' | '$' | '!';

export interface CompletionContext {
  workingDir: string;
  providerId?: string;
  providerModels?: string[];
  configuredProviders?: string[];
  gitBranches?: string[];
  envVars?: string[];
}

export class Completer {
  private context: CompletionContext;

  constructor(context: CompletionContext) {
    this.context = context;
  }

  updateContext(ctx: Partial<CompletionContext>): void {
    Object.assign(this.context, ctx);
  }

  getCompletions(input: string, cursorPos: number): Completion[] {
    if (cursorPos === 0) return [];

    const beforeCursor = input.slice(0, cursorPos);

    // Check for trigger characters
    for (let i = cursorPos - 1; i >= 0; i--) {
      const ch = beforeCursor[i]!;

      if (ch === '/') {
        const prefix = beforeCursor.slice(i + 1);
        return this.getCommandCompletions(prefix);
      }

      if (ch === '@' && (i === 0 || beforeCursor[i - 1] === ' ')) {
        const prefix = beforeCursor.slice(i + 1);
        return this.getFileCompletions(prefix);
      }

      if (ch === '#' && (i === 0 || beforeCursor[i - 1] === ' ')) {
        const prefix = beforeCursor.slice(i + 1);
        return this.getSymbolCompletions(prefix);
      }

      if (ch === '$' && (i === 0 || beforeCursor[i - 1] === ' ')) {
        const prefix = beforeCursor.slice(i + 1);
        return this.getEnvCompletions(prefix);
      }

      if (ch === '!' && (i === 0 || beforeCursor[i - 1] === ' ')) {
        const prefix = beforeCursor.slice(i + 1);
        return this.getShellCompletions(prefix);
      }
    }

    return [];
  }

  private getCommandCompletions(prefix: string): Completion[] {
    const commands: Completion[] = [
      { text: '/help', label: 'help', description: 'Show help message', icon: '?' },
      { text: '/exit', label: 'exit', description: 'Exit librecode', icon: '✕' },
      { text: '/clear', label: 'clear', description: 'Clear conversation', icon: '□' },
      { text: '/status', label: 'status', description: 'Show session status', icon: 'ℹ' },
      { text: '/setup', label: 'setup', description: 'Run setup wizard', icon: '⚙' },
      { text: '/doctor', label: 'doctor', description: 'Run diagnostics', icon: '♥' },
      { text: '/provider', label: 'provider', description: 'Manage providers', icon: '⇄' },
      { text: '/model', label: 'model', description: 'Switch model', icon: '☰' },
      { text: '/models', label: 'models', description: 'List provider models', icon: '☰' },
      { text: '/tokens', label: 'tokens', description: 'Show token usage', icon: 'Σ' },
      { text: '/cost', label: 'cost', description: 'Show cost', icon: '$' },
      { text: '/compact', label: 'compact', description: 'Compact context', icon: '⊞' },
      { text: '/workspace', label: 'workspace', description: 'Show workspace info', icon: '◫' },
      { text: '/session', label: 'session', description: 'Session details', icon: '◎' },
      { text: '/git', label: 'git', description: 'Git operations', icon: '⎇' },
      { text: '/config', label: 'config', description: 'Configuration', icon: '⚙' },
      { text: '/tools', label: 'tools', description: 'List tools', icon: '🔧' },
      { text: '/logs', label: 'logs', description: 'Log file location', icon: '📋' },
      { text: '/permissions', label: 'permissions', description: 'Manage permissions', icon: '🔒' },
      { text: '/history', label: 'history', description: 'View history', icon: '🕐' },
    ];

    if (!prefix) return commands;
    return commands.filter((c) => c.label.startsWith(prefix) || c.label.includes(prefix));
  }

  private getFileCompletions(prefix: string): Completion[] {
    const dir = this.context.workingDir;
    try {
      const searchDir = prefix.includes('/')
        ? path.resolve(dir, path.dirname(prefix))
        : dir;
      const filePrefix = prefix.includes('/') ? path.basename(prefix) : prefix;

      const entries = fs.readdirSync(searchDir, { withFileTypes: true });
      return entries
        .filter((e) => e.name.startsWith(filePrefix) && !e.name.startsWith('.'))
        .map((e) => ({
          text: prefix.includes('/')
            ? `${path.dirname(prefix)}/${e.name}${e.isDirectory() ? '/' : ''}`
            : `${e.name}${e.isDirectory() ? '/' : ''}`,
          label: e.name,
          description: e.isDirectory() ? 'Directory' : 'File',
          icon: e.isDirectory() ? '📁' : '📄',
        }))
        .slice(0, 20);
    } catch {
      return [];
    }
  }

  private getSymbolCompletions(_prefix: string): Completion[] {
    // In a full implementation, this would parse the workspace for symbols
    return [
      { text: '#TODO', label: 'TODO', description: 'Find TODO comments', icon: '✓' },
      { text: '#FIXME', label: 'FIXME', description: 'Find FIXME comments', icon: '⚠' },
      { text: '#HACK', label: 'HACK', description: 'Find HACK comments', icon: '⚡' },
    ].filter((s) => s.label.startsWith(_prefix) || s.label.includes(_prefix));
  }

  private getEnvCompletions(prefix: string): Completion[] {
    const envKeys = Object.keys(process.env)
      .filter((k) => k.startsWith(prefix.toUpperCase()))
      .map((k) => {
        const val = process.env[k] ?? '';
        const masked = k.includes('KEY') || k.includes('SECRET') || k.includes('TOKEN')
          ? val.slice(0, 4) + '…' + val.slice(-4)
          : val;
        return {
          text: `$${k}`,
          label: k,
          description: masked ? `=${masked}` : '(empty)',
          icon: '$',
        };
      })
      .slice(0, 15);

    return envKeys;
  }

  private getShellCompletions(prefix: string): Completion[] {
    try {
      const pathDirs = (process.env['PATH'] ?? '').split(path.delimiter);
      const seen = new Set<string>();
      const commands: string[] = [];

      for (const dir of pathDirs) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() || entry.isSymbolicLink()) {
              const name = entry.name;
              const ext = path.extname(name);
              // On Windows, filter by executable extensions; on POSIX, include everything
              if (process.platform === 'win32') {
                const exts = ['.exe', '.cmd', '.bat', '.ps1'];
                if (!exts.includes(ext.toLowerCase())) continue;
              }
              const cmdName = ext ? name.slice(0, -ext.length) : name;
              if (cmdName.startsWith(prefix) && !seen.has(cmdName)) {
                seen.add(cmdName);
                commands.push(cmdName);
                if (commands.length >= 20) break;
              }
            }
          }
        } catch {
          // skip unreadable directories
        }
        if (commands.length >= 20) break;
      }

      return commands.map((cmd) => ({
        text: `!${cmd}`,
        label: cmd,
        description: 'Shell command',
        icon: '❯',
      }));
    } catch {
      return [];
    }
  }

  formatCompletions(completions: Completion[], terminalWidth: number): string {
    if (completions.length === 0) return '';

    const theme = {
      dim: '\x1B[90m',
      accent: '\x1B[36m',
      reset: '\x1B[39m',
    };

    const lines = completions.map((c) => {
      const icon = c.icon ?? ' ';
      const label = c.label.padEnd(25);
      const desc = c.description;
      return `  ${icon} ${theme.accent}${label}${theme.reset} ${theme.dim}${desc}${theme.reset}`;
    });

    lines.push(`${theme.dim}${'─'.repeat(Math.min(terminalWidth, 60))}${theme.reset}`);
    return '\n' + lines.join('\n') + '\n';
  }
}
