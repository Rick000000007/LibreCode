import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

export class Logger {
  private level: number;
  private logFile: string | null = null;
  private stream: fs.WriteStream | null = null;
  private enabled: boolean;

  constructor(options?: { level?: LogLevel; logFile?: string; enabled?: boolean }) {
    this.level = options?.level ? LOG_LEVELS[options.level] : LOG_LEVELS['info'];
    this.enabled = options?.enabled ?? true;
    const logDir = path.join(os.homedir(), '.config', 'librecode', 'logs');
    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logFile = path.join(logDir, `librecode-${timestamp}.log`);
      this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
    } catch {
      this.logFile = null;
      this.stream = null;
    }
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.enabled) return;
    if (LOG_LEVELS[level] < this.level) return;

    const timestamp = new Date().toISOString();

    if (this.stream) {
      const logEntry = {
        timestamp,
        level,
        message,
        ...(meta ?? {}),
      };
      this.stream.write(JSON.stringify(logEntry) + '\n');
    }

    if (level === 'error' || level === 'warn') {
      const prefix = level === 'error' ? '\x1B[31m' : '\x1B[33m';
      process.stderr.write(`${prefix}[${level.toUpperCase()}] ${message}\x1B[39m\n`);
      if (meta?.['error']) {
        process.stderr.write(`  \x1B[90m${String(meta['error'])}\x1B[39m\n`);
      }
    }
  }

  trace(message: string, meta?: Record<string, unknown>): void { this.log('trace', message, meta); }
  debug(message: string, meta?: Record<string, unknown>): void { this.log('debug', message, meta); }
  info(message: string, meta?: Record<string, unknown>): void { this.log('info', message, meta); }
  warn(message: string, meta?: Record<string, unknown>): void { this.log('warn', message, meta); }
  error(message: string, meta?: Record<string, unknown>): void { this.log('error', message, meta); }

  close(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }

  getLogFile(): string | null {
    return this.logFile;
  }
}

let defaultLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger({ level: 'info' });
  }
  return defaultLogger;
}

export function setLogger(logger: Logger): void {
  defaultLogger = logger;
}
