import { EventEmitter } from 'node:events';
import * as readline from 'node:readline';

export type TUITheme = 'dark' | 'light' | 'high-contrast';

export interface TUICommand {
  name: string;
  description: string;
  aliases: string[];
  handler: (args: string[]) => Promise<void> | void;
}

export interface TUIStatus {
  mode: string;
  file?: string;
  branch?: string;
  progress?: number;
  tasks?: number;
  messages?: string[];
}

export class AdvancedTUI {
  private rl: readline.Interface | null = null;
  private commands = new Map<string, TUICommand>();
  private events = new EventEmitter();
  private theme: TUITheme = 'dark';
  private status: TUIStatus = { mode: 'normal' };
  private history: string[] = [];
  private historyIndex = -1;
  private prompt = '> ';
  private running = false;
  private isTTY: boolean;

  constructor() {
    this.isTTY = process.stdin.isTTY && process.stdout.isTTY;
    if (this.isTTY) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });
    }
    this.registerDefaults();
  }

  start(): void {
    this.running = true;
    if (this.rl) {
      this.rl.on('line', (line) => this.handleInput(line));
    }
  }

  stop(): void {
    this.running = false;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  registerCommand(cmd: TUICommand): void {
    this.commands.set(cmd.name, cmd);
    for (const alias of cmd.aliases) {
      this.commands.set(alias, cmd);
    }
  }

  setTheme(theme: TUITheme): void {
    this.theme = theme;
  }

  updateStatus(status: Partial<TUIStatus>): void {
    this.status = { ...this.status, ...status };
  }

  showNotification(message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info'): void {
    this.status.messages = [...(this.status.messages ?? []), `[${type.toUpperCase()}] ${message}`];
    if ((this.status.messages?.length ?? 0) > 5) {
      this.status.messages = this.status.messages!.slice(-5);
    }
  }

  private registerDefaults(): void {
    this.registerCommand({
      name: 'help',
      description: 'Show available commands',
      aliases: ['h', '?'],
      handler: () => this.showHelp(),
    });

    this.registerCommand({
      name: 'clear',
      description: 'Clear the screen',
      aliases: ['cls'],
      handler: () => console.clear(),
    });

    this.registerCommand({
      name: 'theme',
      description: 'Set theme (dark|light|high-contrast)',
      aliases: ['t'],
      handler: (args) => {
        if (args[0] && ['dark', 'light', 'high-contrast'].includes(args[0])) {
          this.setTheme(args[0] as TUITheme);
        }
      },
    });

    this.registerCommand({
      name: 'exit',
      description: 'Exit the TUI',
      aliases: ['quit', 'q'],
      handler: () => this.stop(),
    });
  }

  private handleInput(line: string): void {
    if (!this.running) return;
    const trimmed = line.trim();
    if (!trimmed) return;

    this.history.push(trimmed);
    this.historyIndex = this.history.length;

    const parts = trimmed.split(/\s+/);
    const cmdName = parts[0]!.toLowerCase();
    const args = parts.slice(1);

    const cmd = this.commands.get(cmdName);
    if (cmd) {
      Promise.resolve(cmd.handler(args)).catch(err => this.showNotification(String(err), 'error'));
    } else {
      this.showNotification(`Unknown command: ${cmdName}. Type 'help' for available commands.`, 'warning');
    }
  }

  private showHelp(): void {
    const unique = new Set(this.commands.values());
    for (const cmd of unique) {
      console.log(`  ${cmd.name.padEnd(15)} ${cmd.description}`);
    }
  }
}
