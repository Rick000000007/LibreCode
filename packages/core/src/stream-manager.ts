export type StreamEventType = 'text_delta' | 'tool_start' | 'tool_result' | 'tool_error' | 'turn_complete' | 'shell_output' | 'file_change' | 'progress' | 'cancel';

export interface StreamEvent {
  type: StreamEventType;
  data: string;
  metadata?: Record<string, unknown>;
}

export interface StreamListener {
  onEvent(event: StreamEvent): void;
  onError(err: Error): void;
  onComplete(): void;
}

export class CancellationToken {
  private _cancelled = false;
  private listeners: Array<() => void> = [];

  get cancelled(): boolean {
    return this._cancelled;
  }

  cancel(): void {
    this._cancelled = true;
    for (const listener of this.listeners) {
      listener();
    }
  }

  onCancel(listener: () => void): void {
    this.listeners.push(listener);
  }

  throwIfCancelled(): void {
    if (this._cancelled) {
      throw new CancelledError('Operation was cancelled');
    }
  }
}

export class CancelledError extends Error {
  constructor(message?: string) {
    super(message ?? 'Operation cancelled');
    this.name = 'CancelledError';
  }
}

export class StreamManager {
  private token = new CancellationToken();
  private listeners: StreamListener[] = [];
  private shellOutputBuffer = '';
  private fileChanges: Array<{ file: string; action: string }> = [];

  get cancellationToken(): CancellationToken {
    return this.token;
  }

  addListener(listener: StreamListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: StreamListener): void {
    const idx = this.listeners.indexOf(listener);
    if (idx >= 0) this.listeners.splice(idx, 1);
  }

  emit(event: StreamEvent): void {
    for (const listener of this.listeners) {
      try {
        listener.onEvent(event);
      } catch {
      }
    }
  }

  onTextDelta(delta: string): void {
    this.emit({ type: 'text_delta', data: delta });
  }

  onToolStart(name: string, argsPreview: string): void {
    this.emit({ type: 'tool_start', data: name, metadata: { argsPreview } });
  }

  onToolResult(name: string, success: boolean, summary: string): void {
    this.emit({
      type: 'tool_result',
      data: name,
      metadata: { success, summary },
    });
  }

  onToolError(name: string, message: string): void {
    this.emit({ type: 'tool_error', data: name, metadata: { message } });
  }

  onShellOutput(output: string): void {
    this.shellOutputBuffer += output;
    this.emit({ type: 'shell_output', data: output });
  }

  onFileChange(file: string, action: 'write' | 'edit' | 'delete'): void {
    this.fileChanges.push({ file, action });
    this.emit({ type: 'file_change', data: `${action}:${file}` });
  }

  onTurnComplete(turnNumber: number): void {
    this.emit({ type: 'turn_complete', data: `Turn ${turnNumber}` });
  }

  onProgress(current: number, total: number, label: string): void {
    this.emit({
      type: 'progress',
      data: `${current}/${total}`,
      metadata: { current, total, label },
    });
  }

  cancel(): void {
    this.token.cancel();
    this.emit({ type: 'cancel', data: 'Operation cancelled by user' });
  }

  getShellBuffer(): string {
    return this.shellOutputBuffer;
  }

  clearShellBuffer(): void {
    this.shellOutputBuffer = '';
  }

  getFileChanges(): Array<{ file: string; action: string }> {
    return [...this.fileChanges];
  }

  reset(): void {
    this.token = new CancellationToken();
    this.shellOutputBuffer = '';
    this.fileChanges = [];
  }
}

export class LiveStreamDisplay {
  private currentLine = '';
  private shellLines = 0;

  handleEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'text_delta':
        process.stdout.write(event.data);
        break;
      case 'tool_start':
        process.stdout.write(`\n  ▶ ${event.data}\n`);
        break;
      case 'tool_result':
        if (event.metadata?.['success']) {
          process.stdout.write(`  ✓ ${event.data}: ${event.metadata?.['summary'] ?? ''}\n`);
        }
        break;
      case 'tool_error':
        process.stdout.write(`\n  ⚠ ${event.data}: ${event.metadata?.['message'] ?? ''}\n`);
        break;
      case 'shell_output':
        process.stdout.write(event.data);
        break;
      case 'file_change':
        process.stdout.write(`  📄 ${event.data}\n`);
        break;
      case 'progress':
        if (event.metadata) {
          const meta = event.metadata as Record<string, unknown>;
          const current = meta['current'] as number;
          const total = meta['total'] as number;
          const label = meta['label'] as string;
          process.stdout.write(`\r  ${'█'.repeat(current)}${'░'.repeat(total - current)} ${current}/${total} ${label}`);
        }
        break;
      case 'cancel':
        process.stdout.write(`\n  ⏹ ${event.data}\n`);
        break;
      case 'turn_complete':
        process.stdout.write(`\n  ─── ${event.data} ───\n\n`);
        break;
    }
  }
}
