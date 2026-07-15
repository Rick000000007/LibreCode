import { describe, it, expect } from 'vitest';
import { ModalEditor } from '../modal-editor.js';

describe('ModalEditor', () => {
  it('initializes with empty content', () => {
    const editor = new ModalEditor();
    expect(editor.getContent()).toBe('');
    expect(editor.getMode()).toBe('normal');
    expect(editor.getLineCount()).toBe(1);
  });

  it('loads content', () => {
    const editor = new ModalEditor();
    editor.load('line1\nline2\nline3');
    expect(editor.getLineCount()).toBe(3);
    expect(editor.getContent()).toBe('line1\nline2\nline3');
  });

  it('starts in normal mode', () => {
    const editor = new ModalEditor();
    expect(editor.getMode()).toBe('normal');
  });

  it('switches to insert mode on i key', () => {
    const editor = new ModalEditor();
    editor.handleKey('i', false, false);
    expect(editor.getMode()).toBe('insert');
  });

  it('switches back to normal mode on Escape', () => {
    const editor = new ModalEditor();
    editor.handleKey('i', false, false);
    editor.handleKey('c', true, false);
    expect(editor.getMode()).toBe('normal');
  });

  it('inserts characters in insert mode', () => {
    const editor = new ModalEditor();
    editor.handleKey('i', false, false);
    editor.handleKey('h', false, false);
    editor.handleKey('e', false, false);
    editor.handleKey('l', false, false);
    editor.handleKey('l', false, false);
    editor.handleKey('o', false, false);
    expect(editor.getContent()).toBe('hello');
  });

  it('supports cursor movement in normal mode', () => {
    const editor = new ModalEditor();
    editor.load('abc\ndef\nghi');

    // Initial cursor at (0,0)
    expect(editor.getCursor()).toEqual({ line: 0, column: 0 });

    // Move down
    editor.handleKey('j', false, false);
    expect(editor.getCursor()).toEqual({ line: 1, column: 0 });

    // Move right
    editor.handleKey('l', false, false);
    expect(editor.getCursor()).toEqual({ line: 1, column: 1 });

    // Move up
    editor.handleKey('k', false, false);
    expect(editor.getCursor()).toEqual({ line: 0, column: 1 });

    // Move left
    editor.handleKey('h', false, false);
    expect(editor.getCursor()).toEqual({ line: 0, column: 0 });
  });

  it('supports undo and redo', () => {
    const editor = new ModalEditor();
    editor.handleKey('i', false, false);
    editor.handleKey('a', false, false);
    editor.handleKey('b', false, false);
    editor.handleKey('c', false, false);
    editor.handleKey('c', true, false); // Escape

    expect(editor.getContent()).toBe('abc');

    editor.handleKey('u', false, false); // Undo
    expect(editor.getContent()).toBe('ab');

    editor.handleKey('r', false, false); // Redo
    expect(editor.getContent()).toBe('abc');
  });

  it('supports visual mode', () => {
    const editor = new ModalEditor();
    editor.load('hello world');
    editor.handleKey('v', false, false);
    expect(editor.getMode()).toBe('visual');
  });

  it('supports search', () => {
    const editor = new ModalEditor();
    editor.load('hello world\nhello again');

    editor.handleKey(':', false, false);
    expect(editor.getMode()).toBe('command');

    // Type /hello and press enter
    editor.handleKey('/', false, false);
    editor.handleKey('h', false, false);
    editor.handleKey('e', false, false);
    editor.handleKey('l', false, false);
    editor.handleKey('l', false, false);
    editor.handleKey('o', false, false);
    editor.handleKey('enter', false, false);

    // Should be back in normal mode
    expect(editor.getMode()).toBe('normal');
  });

  it('switches to command mode with :', () => {
    const editor = new ModalEditor();
    editor.handleKey(':', false, false);
    expect(editor.getMode()).toBe('command');
  });

  it('supports line delete with dd', () => {
    const editor = new ModalEditor();
    editor.load('line1\nline2\nline3');
    editor.handleKey('d', false, false);
    expect(editor.getContent()).toBe('line2\nline3');
  });

  it('supports yank and paste', () => {
    const editor = new ModalEditor();
    editor.load('abc\ndef\nghi');
    // Yank second line
    editor.handleKey('j', false, false); // cursor at line 1, col 0
    editor.handleKey('y', false, false); // yank "def"
    // Paste - inserts "def" at cursor position (line 1, col 0)
    editor.handleKey('p', false, false);
    expect(editor.getContent()).toBe('abc\ndefdef\nghi');
  });

  it('tracks modified state', () => {
    const editor = new ModalEditor();
    expect(editor.isModified()).toBe(false);
    editor.handleKey('i', false, false);
    editor.handleKey('a', false, false);
    expect(editor.isModified()).toBe(true);
  });

  it('renders content as string', () => {
    const editor = new ModalEditor({ lineNumbers: false, syntaxHighlighter: undefined });
    editor.load('hello\nworld');
    const rendered = editor.render();
    // The cursor at (0,0) wraps 'h' in escape codes for highlighting
    expect(rendered).toContain('ello');
    expect(rendered).toContain('world');
  });

  it('handles multi-cursor', () => {
    const editor = new ModalEditor();
    editor.addCursor({ line: 0, column: 0 });
    editor.addCursor({ line: 1, column: 0 });
    expect(editor.getMode()).toBe('normal');
  });
});
