import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { ChokidarWatcher } from './chokidar-watcher.js';

export interface WorkspaceConfig {
  root: string;
  name?: string;
  description?: string;
  ignorePatterns?: string[];
  env?: Record<string, string>;
  tasks?: WorkspaceTask[];
}

export interface WorkspaceTask {
  name: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  dependsOn?: string[];
  parallel?: boolean;
  watch?: boolean;
  timeout?: number;
}

export interface FileEvent {
  type: 'add' | 'change' | 'unlink';
  file: string;
  timestamp: Date;
}

export class WorkspaceOrchestrator {
  private config: WorkspaceConfig;
  private events = new EventEmitter();
  private watcher: ChokidarWatcher | null = null;
  private runningTasks = new Set<string>();
  private fileIndex = new Map<string, number>();
  private destroyed = false;

  constructor(root: string) {
    this.config = {
      root: path.resolve(root),
      ignorePatterns: ['node_modules', 'dist', 'build', '.git', '.rcode-checkpoints'],
      tasks: [],
    };
    this.loadConfig();
  }

  async init(): Promise<void> {
    this.ensureDirectory(this.config.root);
    await this.indexFiles();
    this.startWatching();
    this.events.emit('workspace:ready', this.config.root);
  }

  getConfig(): WorkspaceConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<WorkspaceConfig>): void {
    this.config = { ...this.config, ...patch };
    this.saveConfig();
    this.events.emit('workspace:config-updated', this.config);
  }

  async runTask(name: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const task = this.config.tasks?.find(t => t.name === name);
    if (!task) throw new Error(`Task "${name}" not found`);

    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        if (!this.runningTasks.has(dep)) {
          await this.runTask(dep);
        }
      }
    }

    this.runningTasks.add(name);
    this.events.emit('task:start', name);

    const cwd = task.cwd ? path.resolve(this.config.root, task.cwd) : this.config.root;
    const env = { ...process.env, ...this.config.env, ...task.env };

    const child = spawnSync(task.command, [], {
      cwd,
      env,
      timeout: task.timeout ?? 60000,
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
    });

    this.runningTasks.delete(name);
    this.events.emit('task:complete', name);

    return {
      exitCode: child.status ?? -1,
      stdout: child.stdout?.toString() ?? '',
      stderr: child.stderr?.toString() ?? '',
    };
  }

  async listFiles(pattern?: string): Promise<string[]> {
    if (pattern) {
      const allFiles = Array.from(this.fileIndex.keys());
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      return allFiles.filter(f => regex.test(f));
    }
    return Array.from(this.fileIndex.keys());
  }

  async readFile(relative: string): Promise<string> {
    this.validatePath(relative);
    const full = path.join(this.config.root, relative);
    return fs.readFileSync(full, 'utf-8');
  }

  async writeFile(relative: string, content: string): Promise<void> {
    this.validatePath(relative);
    const full = path.join(this.config.root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
    this.fileIndex.set(relative, Date.now());
    this.events.emit('file:change', { type: 'change', file: relative, timestamp: new Date() });
  }

  async deleteFile(relative: string): Promise<boolean> {
    this.validatePath(relative);
    const full = path.join(this.config.root, relative);
    try {
      fs.unlinkSync(full);
      this.fileIndex.delete(relative);
      this.events.emit('file:change', { type: 'unlink', file: relative, timestamp: new Date() });
      return true;
    } catch {
      return false;
    }
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.events.on(event, handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.events.off(event, handler);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.watcher) {
      this.watcher.stop().catch(() => {});
      this.watcher = null;
    }
    this.events.removeAllListeners();
  }

  private validatePath(relative: string): void {
    const resolved = path.resolve(this.config.root, relative);
    if (!resolved.startsWith(this.config.root)) {
      throw new Error(`Path traversal denied: ${relative}`);
    }
  }

  private async indexFiles(): Promise<void> {
    this.fileIndex.clear();
    const walk = (dir: string) => {
      let items: fs.Dirent[];
      try {
        items = fs.readdirSync(dir, { withFileTypes: true });
      } catch { return; }
      for (const item of items) {
        const full = path.join(dir, item.name);
        const relative = path.relative(this.config.root, full);
        if (item.isDirectory()) {
          if (!this.isIgnored(item.name)) walk(full);
        } else if (item.isFile()) {
          try {
            const stat = fs.statSync(full);
            this.fileIndex.set(relative.replace(/\\/g, '/'), stat.mtimeMs);
          } catch {
            this.fileIndex.set(relative.replace(/\\/g, '/'), Date.now());
          }
        }
      }
    };
    walk(this.config.root);
  }

  private startWatching(): void {
    try {
      this.watcher = new ChokidarWatcher({
        paths: this.config.root,
        ignored: (p: string) => this.isIgnored(path.relative(this.config.root, p)),
      });
      this.watcher.onEvent((event) => {
        if (this.destroyed) return;
        const relative = path.relative(this.config.root, event.path).replace(/\\/g, '/');
        if (this.isIgnored(relative)) return;
        let fe: FileEvent;
        switch (event.type) {
          case 'add':
            fe = { type: 'add', file: relative, timestamp: new Date(event.timestamp) };
            this.fileIndex.set(relative, Date.now());
            break;
          case 'change':
            fe = { type: 'change', file: relative, timestamp: new Date(event.timestamp) };
            this.fileIndex.set(relative, Date.now());
            break;
          case 'unlink':
            fe = { type: 'unlink', file: relative, timestamp: new Date(event.timestamp) };
            this.fileIndex.delete(relative);
            break;
          default:
            return;
        }
        this.events.emit('file:change', fe);
      });
      this.watcher.start().catch(() => { /* filesystem watching not available */ });
    } catch { /* filesystem watching not available */ }
  }

  private loadConfig(): void {
    const configPath = path.join(this.config.root, '.rcode.json');
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      if (data['workspace']) {
        this.config = { ...this.config, ...data['workspace'] as WorkspaceConfig };
      }
    } catch { /* use defaults */ }
  }

  private saveConfig(): void {
    try {
      const configPath = path.join(this.config.root, '.rcode.json');
      let existing: Record<string, unknown> = {};
      try {
        existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch { /* new file */ }
      existing['workspace'] = this.config;
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8');
    } catch { /* best effort */ }
  }

  private isIgnored(name: string): boolean {
    return this.config.ignorePatterns?.some(p => name === p || name.startsWith(p + '/') || name.includes('/' + p)) ?? false;
  }

  private ensureDirectory(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }
}
