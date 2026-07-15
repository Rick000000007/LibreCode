import { EventEmitter } from 'node:events';

export type EditorMode = 'normal' | 'insert' | 'visual' | 'command';

export interface EditorOptions {
  syntaxHighlighter?: (code: string, ext: string) => string;
  tabSize?: number;
  softWrap?: boolean;
  lineNumbers?: boolean;
  bracketMatching?: boolean;
}

interface CursorPosition {
  line: number;
  column: number;
}

interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
}

interface UndoEntry {
  lines: string[];
  cursor: CursorPosition;
  timestamp: number;
}

export class ModalEditor extends EventEmitter {
  private lines: string[] = [''];
  private cursor: CursorPosition = { line: 0, column: 0 };
  private selection: SelectionRange | null = null;
  private mode: EditorMode = 'normal';
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private clipboard: string | null = null;
  private commandBuffer = '';
  private searchQuery = '';
  private searchResults: Array<{ line: number; start: number; end: number }> = [];
  private searchIndex = -1;
  private visualStart: CursorPosition | null = null;
  private options: EditorOptions;
  private multiCursors: CursorPosition[] = [];
  private modified = false;
  private filename = '';
  private fileExtension = '';

  constructor(options?: EditorOptions) {
    super();
    this.options = {
      tabSize: 2,
      softWrap: false,
      lineNumbers: true,
      bracketMatching: true,
      ...options,
    };
  }

  load(content: string, filename?: string): void {
    this.lines = content === '' ? [''] : content.split('\n');
    this.cursor = { line: 0, column: 0 };
    this.selection = null;
    this.mode = 'normal';
    this.undoStack = [];
    this.redoStack = [];
    this.clipboard = null;
    this.modified = false;
    this.filename = filename ?? '';
    this.fileExtension = this.filename.split('.').pop() ?? '';
    this.emit('contentChanged', this.getContent());
  }

  getContent(): string {
    return this.lines.join('\n');
  }

  getLines(): string[] {
    return [...this.lines];
  }

  getCursor(): CursorPosition {
    return { ...this.cursor };
  }

  getMode(): EditorMode {
    return this.mode;
  }

  getSelection(): SelectionRange | null {
    return this.selection;
  }

  isModified(): boolean {
    return this.modified;
  }

  getLineCount(): number {
    return this.lines.length;
  }

  setMode(mode: EditorMode): void {
    if (this.mode === 'visual' && mode !== 'visual') {
      this.selection = null;
    }
    this.mode = mode;
    this.commandBuffer = '';
    this.emit('modeChanged', mode);
  }

  private pushUndo(): void {
    this.undoStack.push({
      lines: [...this.lines],
      cursor: { ...this.cursor },
      timestamp: Date.now(),
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    this.redoStack.push({
      lines: [...this.lines],
      cursor: { ...this.cursor },
      timestamp: Date.now(),
    });
    const entry = this.undoStack.pop()!;
    this.lines = entry.lines;
    this.cursor = entry.cursor;
    this.modified = true;
    this.emit('contentChanged', this.getContent());
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    this.undoStack.push({
      lines: [...this.lines],
      cursor: { ...this.cursor },
      timestamp: Date.now(),
    });
    const entry = this.redoStack.pop()!;
    this.lines = entry.lines;
    this.cursor = entry.cursor;
    this.modified = true;
    this.emit('contentChanged', this.getContent());
  }

  handleKey(key: string, ctrl: boolean, meta: boolean): boolean {
    switch (this.mode) {
      case 'insert': return this.handleInsertKey(key, ctrl, meta);
      case 'normal': return this.handleNormalKey(key, ctrl, meta);
      case 'visual': return this.handleVisualKey(key, ctrl, meta);
      case 'command': return this.handleCommandKey(key, ctrl, meta);
      default: return false;
    }
  }

  private handleInsertKey(key: string, ctrl: boolean, _meta: boolean): boolean {
    if (ctrl && (key === 'c' || key === '[')) {
      this.setMode('normal');
      this.cursor.column = Math.max(0, this.cursor.column - 1);
      this.emit('cursorMoved', this.cursor);
      return true;
    }

    if (ctrl && key === 'z') { this.undo(); return true; }
    if (ctrl && key === 'y') { this.redo(); return true; }

    if (key === 'enter' || key === 'return') {
      this.pushUndo();
      const currentLine = this.lines[this.cursor.line]!;
      const before = currentLine.slice(0, this.cursor.column);
      const after = currentLine.slice(this.cursor.column);
      this.lines[this.cursor.line] = before;
      this.lines.splice(this.cursor.line + 1, 0, after);
      this.cursor.line++;
      this.cursor.column = 0;
      this.modified = true;
      this.emit('contentChanged', this.getContent());
      this.emit('cursorMoved', this.cursor);
      return true;
    }

    if (key === 'backspace') {
      if (this.cursor.column > 0) {
        this.pushUndo();
        const line = this.lines[this.cursor.line]!;
        this.lines[this.cursor.line] = line.slice(0, this.cursor.column - 1) + line.slice(this.cursor.column);
        this.cursor.column--;
        this.modified = true;
        this.emit('contentChanged', this.getContent());
        this.emit('cursorMoved', this.cursor);
      } else if (this.cursor.line > 0) {
        this.pushUndo();
        const prevLine = this.lines[this.cursor.line - 1]!;
        const currentLine = this.lines[this.cursor.line]!;
        this.cursor.column = prevLine.length;
        this.lines[this.cursor.line - 1] = prevLine + currentLine;
        this.lines.splice(this.cursor.line, 1);
        this.cursor.line--;
        this.modified = true;
        this.emit('contentChanged', this.getContent());
        this.emit('cursorMoved', this.cursor);
      }
      return true;
    }

    if (key === 'delete') {
      const line = this.lines[this.cursor.line]!;
      if (this.cursor.column < line.length) {
        this.pushUndo();
        this.lines[this.cursor.line] = line.slice(0, this.cursor.column) + line.slice(this.cursor.column + 1);
        this.modified = true;
        this.emit('contentChanged', this.getContent());
      } else if (this.cursor.line < this.lines.length - 1) {
        this.pushUndo();
        const nextLine = this.lines[this.cursor.line + 1]!;
        this.lines[this.cursor.line] = line + nextLine;
        this.lines.splice(this.cursor.line + 1, 1);
        this.modified = true;
        this.emit('contentChanged', this.getContent());
      }
      return true;
    }

    if (key === 'tab') {
      this.pushUndo();
      const spaces = ' '.repeat(this.options.tabSize ?? 2);
      const line = this.lines[this.cursor.line]!;
      this.lines[this.cursor.line] = line.slice(0, this.cursor.column) + spaces + line.slice(this.cursor.column);
      this.cursor.column += this.options.tabSize ?? 2;
      this.modified = true;
      this.emit('contentChanged', this.getContent());
      this.emit('cursorMoved', this.cursor);
      return true;
    }

    if (key.length === 1 && !ctrl) {
      this.pushUndo();
      const line = this.lines[this.cursor.line]!;
      this.lines[this.cursor.line] = line.slice(0, this.cursor.column) + key + line.slice(this.cursor.column);
      this.cursor.column++;
      this.modified = true;

      if (this.options.bracketMatching) {
        if (key === ')' || key === ']' || key === '}') {
          this.highlightMatchingBracket();
        }
      }

      this.emit('contentChanged', this.getContent());
      this.emit('cursorMoved', this.cursor);
      return true;
    }

    // Arrow keys
    if (key === 'left') { this.moveCursor(0, -1); return true; }
    if (key === 'right') { this.moveCursor(0, 1); return true; }
    if (key === 'up') { this.moveCursor(-1, 0); return true; }
    if (key === 'down') { this.moveCursor(1, 0); return true; }
    if (key === 'home') { this.cursor.column = 0; this.emit('cursorMoved', this.cursor); return true; }
    if (key === 'end') { this.cursor.column = this.lines[this.cursor.line]!.length; this.emit('cursorMoved', this.cursor); return true; }

    return false;
  }

  private handleNormalKey(key: string, ctrl: boolean, _meta: boolean): boolean {
    if (ctrl && key === 'z') { this.undo(); return true; }
    if (ctrl && key === 'y') { this.redo(); return true; }

    switch (key) {
      // Mode switching
      case 'i': this.setMode('insert'); return true;
      case 'I':
        this.cursor.column = 0;
        this.setMode('insert');
        return true;
      case 'a':
        this.cursor.column = Math.min(this.cursor.column + 1, this.lines[this.cursor.line]!.length);
        this.setMode('insert');
        return true;
      case 'A':
        this.cursor.column = this.lines[this.cursor.line]!.length;
        this.setMode('insert');
        return true;
      case 'o':
        this.pushUndo();
        this.lines.splice(this.cursor.line + 1, 0, '');
        this.cursor.line++;
        this.cursor.column = 0;
        this.modified = true;
        this.setMode('insert');
        this.emit('contentChanged', this.getContent());
        return true;
      case 'O':
        this.pushUndo();
        this.lines.splice(this.cursor.line, 0, '');
        this.cursor.column = 0;
        this.modified = true;
        this.setMode('insert');
        this.emit('contentChanged', this.getContent());
        return true;
      case 'v': this.setMode('visual'); this.visualStart = { ...this.cursor }; return true;
      case ':': this.mode = 'command'; this.commandBuffer = ''; this.emit('modeChanged', 'command'); return true;
      case '/': this.mode = 'command'; this.commandBuffer = '/'; this.emit('modeChanged', 'command'); return true;
      case '?': this.mode = 'command'; this.commandBuffer = '?'; this.emit('modeChanged', 'command'); return true;

      // Navigation
      case 'h': case 'left': this.moveCursor(0, -1); return true;
      case 'l': case 'right': this.moveCursor(0, 1); return true;
      case 'k': case 'up': this.moveCursor(-1, 0); return true;
      case 'j': case 'down': this.moveCursor(1, 0); return true;
      case 'w': this.wordForward(); return true;
      case 'b': this.wordBackward(); return true;
      case '0': this.cursor.column = 0; this.emit('cursorMoved', this.cursor); return true;
      case '$': this.cursor.column = this.lines[this.cursor.line]!.length; this.emit('cursorMoved', this.cursor); return true;
      case '^':
        this.cursor.column = this.lines[this.cursor.line]!.search(/\S/);
        if (this.cursor.column < 0) this.cursor.column = 0;
        this.emit('cursorMoved', this.cursor);
        return true;
      case 'g':
        this.cursor = { line: 0, column: 0 };
        this.emit('cursorMoved', this.cursor);
        return true;
      case 'G':
        this.cursor = { line: this.lines.length - 1, column: 0 };
        this.emit('cursorMoved', this.cursor);
        return true;
      case 'H':
        this.cursor = { line: 0, column: this.cursor.column };
        this.emit('cursorMoved', this.cursor);
        return true;
      case 'M':
        this.cursor = { line: Math.floor(this.lines.length / 2), column: this.cursor.column };
        this.emit('cursorMoved', this.cursor);
        return true;
      case 'L':
        this.cursor = { line: this.lines.length - 1, column: this.cursor.column };
        this.emit('cursorMoved', this.cursor);
        return true;

      // Editing
      case 'x':
        this.pushUndo();
        {
          const line = this.lines[this.cursor.line]!;
          if (this.cursor.column < line.length) {
            this.lines[this.cursor.line] = line.slice(0, this.cursor.column) + line.slice(this.cursor.column + 1);
            this.modified = true;
            this.emit('contentChanged', this.getContent());
          }
        }
        return true;
      case 'd': {
        this.pushUndo();
        if (this.cursor.line < this.lines.length - 1) {
          this.lines.splice(this.cursor.line, 1);
          if (this.cursor.line >= this.lines.length) this.cursor.line = this.lines.length - 1;
          this.modified = true;
          this.emit('contentChanged', this.getContent());
        }
        return true;
      }
      case 'D':
        this.pushUndo();
        this.lines[this.cursor.line] = this.lines[this.cursor.line]!.slice(0, this.cursor.column);
        this.modified = true;
        this.emit('contentChanged', this.getContent());
        return true;
      case 'y':
        this.clipboard = this.lines[this.cursor.line] ?? null;
        return true;
      case 'Y':
        this.clipboard = this.lines[this.cursor.line] ?? null;
        return true;
      case 'p':
        if (this.clipboard !== null) {
          this.pushUndo();
          const line = this.lines[this.cursor.line] ?? '';
          this.lines[this.cursor.line] = line.slice(0, this.cursor.column) + this.clipboard + line.slice(this.cursor.column);
          this.cursor.column += this.clipboard.length;
          this.modified = true;
          this.emit('contentChanged', this.getContent());
          this.emit('cursorMoved', this.cursor);
        }
        return true;
      case 'P':
        if (this.clipboard !== null) {
          this.pushUndo();
          this.lines.splice(this.cursor.line, 0, this.clipboard);
          this.modified = true;
          this.emit('contentChanged', this.getContent());
        }
        return true;
      case 'u': this.undo(); return true;
      case 'r': this.redo(); return true;
      case '.': this.redo(); return true;

      case 'n':
        if (this.searchQuery) this.findNext();
        return true;
      case 'N':
        if (this.searchQuery) this.findPrev();
        return true;

      default:
        return false;
    }
  }

  private handleVisualKey(key: string, ctrl: boolean, _meta: boolean): boolean {
    if (key === 'escape' || (ctrl && (key === 'c' || key === '['))) {
      this.setMode('normal');
      return true;
    }

    switch (key) {
      case 'h': case 'left': this.moveCursor(0, -1); this.updateSelection(); return true;
      case 'l': case 'right': this.moveCursor(0, 1); this.updateSelection(); return true;
      case 'k': case 'up': this.moveCursor(-1, 0); this.updateSelection(); return true;
      case 'j': case 'down': this.moveCursor(1, 0); this.updateSelection(); return true;
      case '0': this.cursor.column = 0; this.updateSelection(); return true;
      case '$': this.cursor.column = this.lines[this.cursor.line]!.length; this.updateSelection(); return true;
      case 'y': {
        if (this.selection) {
          const selected = this.getSelectedText();
          if (selected) this.clipboard = selected;
        }
        this.setMode('normal');
        return true;
      }
      case 'd': {
        if (this.selection) {
          this.pushUndo();
          const start = this.selection.start;
          const end = this.selection.end;
          const minLine = Math.min(start.line, end.line);
          const maxLine = Math.max(start.line, end.line);
          this.lines.splice(minLine, maxLine - minLine + 1);
          this.cursor = { line: Math.min(minLine, this.lines.length - 1), column: 0 };
          this.modified = true;
          this.emit('contentChanged', this.getContent());
        }
        this.setMode('normal');
        return true;
      }
      default:
        return false;
    }
  }

  private handleCommandKey(key: string, ctrl: boolean, _meta: boolean): boolean {
    if (key === 'escape' || (ctrl && (key === 'c' || key === '['))) {
      this.setMode('normal');
      return true;
    }

    if (key === 'enter' || key === 'return') {
      this.executeCommand(this.commandBuffer);
      return true;
    }

    if (key === 'backspace') {
      this.commandBuffer = this.commandBuffer.slice(0, -1);
      return true;
    }

    if (key.length === 1) {
      this.commandBuffer += key;
      return true;
    }

    return false;
  }

  private executeCommand(cmd: string): void {
    if (cmd.startsWith('/') || cmd.startsWith('?')) {
      const query = cmd.slice(1);
      if (query) {
        this.searchQuery = query;
        this.searchResults = [];
        const lowerQuery = query.toLowerCase();
        for (let i = 0; i < this.lines.length; i++) {
          const line = this.lines[i]!.toLowerCase();
          let pos = 0;
          while (true) {
            const idx = line.indexOf(lowerQuery, pos);
            if (idx === -1) break;
            this.searchResults.push({ line: i, start: idx, end: idx + query.length });
            pos = idx + 1;
          }
        }
        this.searchIndex = cmd.startsWith('/') ? 0 : this.searchResults.length - 1;
        if (this.searchResults.length > 0) {
          const r = this.searchResults[this.searchIndex]!;
          this.cursor = { line: r.line, column: r.start };
          this.emit('cursorMoved', this.cursor);
        }
      }
      this.setMode('normal');
      return;
    }

    // :w - save
    if (cmd === 'w' || cmd === 'wq') {
      this.emit('saveRequested', this.getContent());
      if (cmd === 'wq') this.setMode('normal');
      else this.setMode('normal');
      return;
    }

    // :q - quit
    if (cmd === 'q' || cmd === 'q!' || cmd === 'wq') {
      this.emit('quitRequested');
      this.setMode('normal');
      return;
    }

    // :set number / nonumber
    if (cmd.startsWith('set ')) {
      const opt = cmd.slice(4);
      if (opt === 'number') this.options.lineNumbers = true;
      else if (opt === 'nonumber') this.options.lineNumbers = false;
      else if (opt.startsWith('tabstop=')) {
        this.options.tabSize = parseInt(opt.slice(8), 10) || 2;
      }
      this.setMode('normal');
      this.emit('optionsChanged', { ...this.options });
      return;
    }

    // :%s/old/new/g
    const substMatch = cmd.match(/^%s\/([^/]*)\/([^/]*)\/([g]?)$/);
    if (substMatch) {
      this.pushUndo();
      const search = substMatch[1]!;
      const replace = substMatch[2]!;
      const global = substMatch[3] === 'g';
      try {
        const regex = new RegExp(search, global ? 'g' : '');
        for (let i = 0; i < this.lines.length; i++) {
          this.lines[i] = this.lines[i]!.replace(regex, replace);
        }
        this.modified = true;
        this.emit('contentChanged', this.getContent());
      } catch { /* invalid regex */ }
      this.setMode('normal');
      return;
    }

    // Line number jump
    const lineNum = parseInt(cmd, 10);
    if (!isNaN(lineNum) && lineNum > 0 && lineNum <= this.lines.length) {
      this.cursor = { line: lineNum - 1, column: 0 };
      this.emit('cursorMoved', this.cursor);
    }

    this.setMode('normal');
  }

  private moveCursor(dLine: number, dCol: number): void {
    let newLine = this.cursor.line + dLine;
    newLine = Math.max(0, Math.min(this.lines.length - 1, newLine));
    let newCol = this.cursor.column + dCol;
    if (newCol < 0) {
      if (newLine > 0) {
        newLine--;
        newCol = this.lines[newLine]!.length;
      } else {
        newCol = 0;
      }
    }
    if (newCol > this.lines[newLine]!.length) {
      if (newLine + 1 < this.lines.length && dCol > 0) {
        newLine++;
        newCol = 0;
      } else {
        newCol = this.lines[newLine]!.length;
      }
    }
    this.cursor = { line: newLine, column: newCol };
    this.emit('cursorMoved', this.cursor);
  }

  private wordForward(): void {
    const line = this.lines[this.cursor.line]!;
    // Find next word start (non-whitespace after whitespace)
    let pos = this.cursor.column;
    const len = line.length;

    // Skip current word
    while (pos < len && line[pos] !== ' ' && line[pos] !== '\t') pos++;
    // Skip whitespace
    while (pos < len && (line[pos] === ' ' || line[pos] === '\t')) pos++;

    if (pos >= len && this.cursor.line + 1 < this.lines.length) {
      this.cursor = { line: this.cursor.line + 1, column: 0 };
    } else {
      this.cursor.column = Math.min(pos, len);
    }
    this.emit('cursorMoved', this.cursor);
  }

  private wordBackward(): void {
    const line = this.lines[this.cursor.line]!;
    let pos = this.cursor.column;

    // Skip whitespace behind
    while (pos > 0 && (line[pos - 1] === ' ' || line[pos - 1] === '\t')) pos--;
    // Skip word behind
    while (pos > 0 && line[pos - 1] !== ' ' && line[pos - 1] !== '\t') pos--;

    if (pos <= 0 && this.cursor.line > 0) {
      const prevLine = this.lines[this.cursor.line - 1]!;
      this.cursor = { line: this.cursor.line - 1, column: prevLine.length };
    } else {
      this.cursor.column = pos;
    }
    this.emit('cursorMoved', this.cursor);
  }

  private findNext(): void {
    if (this.searchResults.length === 0) return;
    this.searchIndex = (this.searchIndex + 1) % this.searchResults.length;
    const r = this.searchResults[this.searchIndex]!;
    this.cursor = { line: r.line, column: r.start };
    this.emit('cursorMoved', this.cursor);
  }

  private findPrev(): void {
    if (this.searchResults.length === 0) return;
    this.searchIndex = (this.searchIndex - 1 + this.searchResults.length) % this.searchResults.length;
    const r = this.searchResults[this.searchIndex]!;
    this.cursor = { line: r.line, column: r.start };
    this.emit('cursorMoved', this.cursor);
  }

  private updateSelection(): void {
    if (this.visualStart) {
      this.selection = {
        start: this.visualStart,
        end: { ...this.cursor },
      };
      this.emit('selectionChanged', this.selection);
    }
  }

  private getSelectedText(): string | null {
    if (!this.selection) return null;
    const startLine = Math.min(this.selection.start.line, this.selection.end.line);
    const endLine = Math.max(this.selection.start.line, this.selection.end.line);
    const lines = this.lines.slice(startLine, endLine + 1);
    return lines.join('\n');
  }

  private highlightMatchingBracket(): void {
    const line = this.lines[this.cursor.line]!;
    const col = this.cursor.column - 1;
    if (col < 0) return;
    const char = line[col]!;
    const pairs: Record<string, [string, number]> = {
      ')': ['(', -1],
      ']': ['[', -1],
      '}': ['{', -1],
    };
    const pair = pairs[char];
    if (!pair) return;
    const [open, dir] = pair;
    let depth = 1;
    let c = col + dir;
    while (c >= 0 && c < line.length) {
      if (line[c] === open) depth--;
      if (line[c] === char) depth++;
      if (depth === 0) {
        // Found matching bracket
        this.emit('bracketMatch', { line: this.cursor.line, column: c });
        return;
      }
      c += dir;
    }
  }

  addCursor(cursor: CursorPosition): void {
    this.multiCursors.push({ ...cursor });
    this.emit('multiCursorChanged', [...this.multiCursors]);
  }

  clearMultiCursors(): void {
    this.multiCursors = [];
    this.emit('multiCursorChanged', []);
  }

  enableMouseSupport(): void {
    process.stdout.write('\x1B[?1000h'); // enable mouse
    process.stdout.write('\x1B[?1002h'); // enable button events
    process.stdout.write('\x1B[?1006h'); // enable SGR mouse
  }

  disableMouseSupport(): void {
    process.stdout.write('\x1B[?1000l');
    process.stdout.write('\x1B[?1002l');
    process.stdout.write('\x1B[?1006l');
  }

  render(): string {
    const visibleLines = this.lines;
    const lineNumWidth = this.options.lineNumbers ? String(this.lines.length).length + 2 : 0;
    const result: string[] = [];

    for (let i = 0; i < visibleLines.length; i++) {
      let prefix = '';
      if (this.options.lineNumbers) {
        const num = String(i + 1).padStart(lineNumWidth - 1);
        prefix = i === this.cursor.line ? `\x1B[38;5;240m${num} \x1B[39m` : `\x1B[38;5;236m${num} \x1B[39m`;
      }

      const line = visibleLines[i] ?? '';
      const cursorMarker = i === this.cursor.line
        ? line.slice(0, this.cursor.column) + '\x1B[7m' + (line[this.cursor.column] ?? ' ') + '\x1B[27m' + line.slice(this.cursor.column + 1)
        : line;

      // Syntax highlighting
      let displayLine = cursorMarker;
      if (this.options.syntaxHighlighter && this.fileExtension) {
        displayLine = this.options.syntaxHighlighter(displayLine, this.fileExtension);
      }

      result.push(prefix + displayLine);
    }

    return result.join('\n');
  }
}
