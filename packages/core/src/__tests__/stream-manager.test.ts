import { describe, it, expect, vi } from 'vitest';
import { StreamManager, CancellationToken, CancelledError, LiveStreamDisplay } from '../stream-manager';

describe('CancellationToken', () => {
  it('starts not cancelled', () => {
    const token = new CancellationToken();
    expect(token.cancelled).toBe(false);
  });

  it('becomes cancelled after cancel()', () => {
    const token = new CancellationToken();
    token.cancel();
    expect(token.cancelled).toBe(true);
  });

  it('cancels listeners', () => {
    const token = new CancellationToken();
    const listener = vi.fn();
    token.onCancel(listener);
    token.cancel();
    expect(listener).toHaveBeenCalled();
  });

  it('throwIfCancelled throws', () => {
    const token = new CancellationToken();
    token.cancel();
    expect(() => token.throwIfCancelled()).toThrow(CancelledError);
  });

  it('throwIfCancelled does not throw when not cancelled', () => {
    const token = new CancellationToken();
    expect(() => token.throwIfCancelled()).not.toThrow();
  });
});

describe('StreamManager', () => {
  it('emits and receives events', () => {
    const manager = new StreamManager();
    const listener = { onEvent: vi.fn(), onError: vi.fn(), onComplete: vi.fn() };
    manager.addListener(listener);

    manager.onTextDelta('hello');
    expect(listener.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text_delta', data: 'hello' }),
    );
  });

  it('onToolStart emits tool_start event', () => {
    const manager = new StreamManager();
    const listener = { onEvent: vi.fn(), onError: vi.fn(), onComplete: vi.fn() };
    manager.addListener(listener);

    manager.onToolStart('read_file', 'test.ts');
    expect(listener.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool_start', data: 'read_file' }),
    );
  });

  it('onShellOutput buffers output', () => {
    const manager = new StreamManager();
    manager.onShellOutput('line1\n');
    manager.onShellOutput('line2\n');
    expect(manager.getShellBuffer()).toBe('line1\nline2\n');
  });

  it('clearShellOutput clears buffer', () => {
    const manager = new StreamManager();
    manager.onShellOutput('data');
    manager.clearShellBuffer();
    expect(manager.getShellBuffer()).toBe('');
  });

  it('onFileChange tracks changes', () => {
    const manager = new StreamManager();
    manager.onFileChange('/test.ts', 'write');
    manager.onFileChange('/old.ts', 'delete');
    const changes = manager.getFileChanges();
    expect(changes.length).toBe(2);
    expect(changes[0]).toEqual({ file: '/test.ts', action: 'write' });
  });

  it('cancel emits cancel event', () => {
    const manager = new StreamManager();
    const listener = { onEvent: vi.fn(), onError: vi.fn(), onComplete: vi.fn() };
    manager.addListener(listener);

    manager.cancel();
    expect(listener.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cancel' }),
    );
  });

  it('reset clears state', () => {
    const manager = new StreamManager();
    manager.onShellOutput('data');
    manager.onFileChange('/f.ts', 'write');
    manager.reset();
    expect(manager.getShellBuffer()).toBe('');
    expect(manager.getFileChanges()).toEqual([]);
  });

  it('removeListener works', () => {
    const manager = new StreamManager();
    const listener = { onEvent: vi.fn(), onError: vi.fn(), onComplete: vi.fn() };
    manager.addListener(listener);
    manager.removeListener(listener);
    manager.onTextDelta('test');
    expect(listener.onEvent).not.toHaveBeenCalled();
  });
});

describe('LiveStreamDisplay', () => {
  it('handles text_delta', () => {
    const display = new LiveStreamDisplay();
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    display.handleEvent({ type: 'text_delta', data: 'hello' });
    expect(writeSpy).toHaveBeenCalledWith('hello');
    writeSpy.mockRestore();
  });

  it('handles cancel event', () => {
    const display = new LiveStreamDisplay();
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    display.handleEvent({ type: 'cancel', data: 'cancelled' });
    expect(writeSpy).toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});
