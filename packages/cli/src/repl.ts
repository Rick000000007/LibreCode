import * as readline from 'node:readline';
import { Completer } from 'librecode-ui';
import { getTerminalCapabilities } from 'librecode-ui';

export type ReplMode = 'single' | 'multi';

export interface ReplOptions {
  prompt: string;
  completionContext?: {
    workingDir: string;
    providerId?: string;
    providerModels?: string[];
    configuredProviders?: string[];
    gitBranches?: string[];
    envVars?: string[];
  };
  onCommandPalette?: () => void;
  onSubmit?: (input: string) => void;
  onCancel?: () => void;
}

export class EnhancedRepl {
  private rl: readline.Interface;
  private completer: Completer;
  private options: ReplOptions;
  private mode: ReplMode = 'single';
  private multiLineBuffer: string[] = [];
  private history: string[] = [];
  private historyIndex = -1;
  private inputBuffer = '';

  constructor(options: ReplOptions) {
    this.options = options;
    this.completer = new Completer(options.completionContext ?? { workingDir: process.cwd() });
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: options.prompt,
      terminal: true,
      tabSize: 2,
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    const rl = this.rl;
    const stdin = process.stdin;

    if (!stdin.isTTY) return;

    stdin.on('data', (data: Buffer) => {
      const key = data.toString();
      if (key === '\x1B') {
        // Escape sequences
        return;
      }
      if (key === '\t') {
        // Tab completion - handle manually
        this.handleTabCompletion();
        return;
      }
    });

    rl.on('SIGINT', () => {
      if (this.options.onCancel) {
        this.options.onCancel();
      } else {
        rl.question('\n\x1B[90mExit? (y/N) \x1B[39m', (answer: string) => {
          if (answer.toLowerCase() === 'y') {
            rl.close();
          } else {
            rl.prompt();
          }
        });
      }
    });
  }

  private handleTabCompletion(): void {
    const line = this.rl.line;
    const cursor = this.rl.cursor;
    const completions = this.completer.getCompletions(line, cursor);
    if (completions.length === 0) return;

    const cap = getTerminalCapabilities();
    process.stdout.write(this.completer.formatCompletions(completions, cap.width));
    this.rl.write(null as unknown as string);
  }

  setMode(mode: ReplMode): void {
    this.mode = mode;
  }

  getMode(): ReplMode {
    return this.mode;
  }

  setPrompt(prompt: string): void {
    this.rl.setPrompt(prompt);
  }

  prompt(): void {
    this.rl.prompt();
  }

  pause(): void {
    this.rl.pause();
  }

  resume(): void {
    this.rl.resume();
  }

  close(): void {
    this.rl.close();
  }

  onLine(callback: (line: string) => void): void {
    this.rl.removeAllListeners('line');
    this.rl.on('line', (line: string) => {
      if (this.mode === 'multi') {
        const trimmed = line.trim();
        if (trimmed === '' && this.multiLineBuffer.length > 0) {
          const fullInput = this.multiLineBuffer.join('\n');
          this.multiLineBuffer = [];
          this.history.push(fullInput);
          this.historyIndex = this.history.length;
          callback(fullInput);
          return;
        }
        this.multiLineBuffer.push(line);
        this.rl.prompt();
      } else {
        this.history.push(line);
        this.historyIndex = this.history.length;
        callback(line);
      }
    });
  }

  onClose(callback: () => void): void {
    this.rl.on('close', callback);
  }

  getHistory(): string[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
    this.historyIndex = -1;
  }
}

export function createRepl(prompt: string): readline.Interface {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt,
    terminal: true,
  });

  rl.on('SIGINT', () => {
    rl.question('\n\x1B[90mExit rcode? (y/N) \x1B[39m', (answer: string) => {
      if (answer.toLowerCase() === 'y') {
        rl.close();
      } else {
        rl.prompt();
      }
    });
  });

  return rl;
}
