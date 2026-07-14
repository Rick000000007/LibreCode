import { EventEmitter } from 'events';
import type { FSWatcher } from 'chokidar';

let chokidar: typeof import('chokidar');

async function loadChokidar(): Promise<void> {
  if (!chokidar) {
    chokidar = await import('chokidar');
  }
}

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'error';
  path: string;
  timestamp: number;
}

export type WatchListener = (event: WatchEvent) => void;

export interface ChokidarWatcherOptions {
  paths: string | readonly string[];
  ignored?: RegExp | ((path: string) => boolean);
  persistent?: boolean;
  depth?: number;
  batchDelay?: number;
}

export class ChokidarWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private readonly options: ChokidarWatcherOptions;
  private ready = false;

  constructor(options: ChokidarWatcherOptions) {
    super();
    this.options = {
      persistent: true,
      depth: 10,
      batchDelay: 300,
      ...options,
    };
  }

  async start(): Promise<void> {
    await loadChokidar();
    const paths = typeof this.options.paths === 'string' ? [this.options.paths] : [...this.options.paths];

    this.watcher = chokidar.watch(paths, {
      ignored: this.options.ignored,
      persistent: this.options.persistent,
      depth: this.options.depth,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 10,
      },
    });

    this.watcher
      .on('add', (path) => this.emitEvent({ type: 'add', path, timestamp: Date.now() }))
      .on('change', (path) => this.emitEvent({ type: 'change', path, timestamp: Date.now() }))
      .on('unlink', (path) => this.emitEvent({ type: 'unlink', path, timestamp: Date.now() }))
      .on('addDir', (path) => this.emitEvent({ type: 'addDir', path, timestamp: Date.now() }))
      .on('unlinkDir', (path) => this.emitEvent({ type: 'unlinkDir', path, timestamp: Date.now() }))
      .on('error', (err: unknown) => this.emitEvent({ type: 'error', path: err instanceof Error ? err.message : String(err), timestamp: Date.now() }))
      .on('ready', () => { this.ready = true; this.emit('ready'); });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.ready = false;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  onEvent(listener: WatchListener): void {
    this.on('watch_event', listener);
  }

  private emitEvent(event: WatchEvent): void {
    this.emit('watch_event', event);
  }
}
