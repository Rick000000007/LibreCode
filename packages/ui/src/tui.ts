import * as tty from 'node:tty';
import { getTerminalCapabilities, type TerminalCapabilities } from './terminal.js';

export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type KeyHandler = (key: KeyEvent) => void;

export interface KeyEvent {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
}

export interface TuiOptions {
  onKey?: KeyHandler;
  onResize?: (width: number, height: number) => void;
}

export class TuiEngine {
  private stdin: tty.ReadStream;
  private stdout: tty.WriteStream;
  private cap: TerminalCapabilities;
  private alternateScreen = false;
  private rawMode = false;
  private keyHandlers: KeyHandler[] = [];
  private resizeHandler: ((w: number, h: number) => void) | null = null;
  private inputBuffer = '';

  constructor(options?: TuiOptions) {
    this.stdin = process.stdin as tty.ReadStream;
    this.stdout = process.stdout as tty.WriteStream;
    this.cap = getTerminalCapabilities();

    if (options?.onKey) this.keyHandlers.push(options.onKey);
    if (options?.onResize) this.resizeHandler = options.onResize;
  }

  get width(): number {
    return this.cap.width;
  }

  get height(): number {
    return this.cap.height;
  }

  getStreams(): { stdin: tty.ReadStream; stdout: tty.WriteStream } {
    return { stdin: this.stdin, stdout: this.stdout };
  }

  enterAltScreen(): void {
    if (!this.cap.isTTY) return;
    this.stdout.write('\x1B[?1049h\x1B[2J\x1B[H');
    this.alternateScreen = true;
  }

  exitAltScreen(): void {
    if (!this.cap.isTTY) return;
    this.stdout.write('\x1B[?1049l');
    this.alternateScreen = false;
  }

  enableRawMode(): void {
    if (!this.cap.isTTY || this.rawMode) return;
    this.stdin.setRawMode(true);
    this.stdin.resume();
    this.stdout.write('\x1B[?2004h'); // Enable bracketed paste
    this.rawMode = true;
  }

  disableRawMode(): void {
    if (!this.rawMode) return;
    this.stdin.setRawMode(false);
    this.stdin.pause();
    this.stdout.write('\x1B[?2004l'); // Disable bracketed paste
    this.rawMode = false;
  }

  hideCursor(): void {
    this.stdout.write('\x1B[?25l');
  }

  showCursor(): void {
    this.stdout.write('\x1B[?25h');
  }

  clearScreen(): void {
    this.stdout.write('\x1B[2J\x1B[H');
  }

  clearLine(): void {
    this.stdout.write('\x1B[2K\r');
  }

  clearLines(n: number): void {
    for (let i = 0; i < n; i++) {
      this.stdout.write('\x1B[2K');
      if (i < n - 1) this.stdout.write('\x1B[A');
    }
    this.stdout.write('\r');
  }

  cursorTo(x: number, y: number): void {
    this.stdout.write(`\x1B[${y + 1};${x + 1}H`);
  }

  cursorUp(n = 1): void {
    if (n > 0) this.stdout.write(`\x1B[${n}A`);
  }

  cursorDown(n = 1): void {
    if (n > 0) this.stdout.write(`\x1B[${n}B`);
  }

  cursorForward(n = 1): void {
    if (n > 0) this.stdout.write(`\x1B[${n}C`);
  }

  cursorBack(n = 1): void {
    if (n > 0) this.stdout.write(`\x1B[${n}D`);
  }

  setScrollRegion(top: number, bottom: number): void {
    this.stdout.write(`\x1B[${top + 1};${bottom + 1}r`);
  }

  resetScrollRegion(): void {
    this.stdout.write('\x1B[r');
  }

  scrollDown(n = 1): void {
    if (n > 0) this.stdout.write(`\x1B[${n}S`);
  }

  scrollUp(n = 1): void {
    if (n > 0) this.stdout.write(`\x1B[${n}T`);
  }

  saveCursor(): void {
    this.stdout.write('\x1B[s');
  }

  restoreCursor(): void {
    this.stdout.write('\x1B[u');
  }

  insertLines(n = 1): void {
    if (n > 0) this.stdout.write(`\x1B[${n}L`);
  }

  deleteLines(n = 1): void {
    if (n > 0) this.stdout.write(`\x1B[${n}M`);
  }

  write(text: string): void {
    this.stdout.write(text);
  }

  writeln(text: string): void {
    this.stdout.write(text + '\n');
  }

  writeAt(x: number, y: number, text: string): void {
    this.cursorTo(x, y);
    this.stdout.write(text);
  }

  get region(): ScreenRegion {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  onKey(handler: KeyHandler): void {
    this.keyHandlers.push(handler);
  }

  removeKeyHandler(handler: KeyHandler): void {
    const idx = this.keyHandlers.indexOf(handler);
    if (idx >= 0) this.keyHandlers.splice(idx, 1);
  }

  startInput(): void {
    if (!this.rawMode) this.enableRawMode();

    this.stdin.on('data', (data: Buffer) => {
      this.inputBuffer += data.toString();
      this.processInputBuffer();
    });
  }

  stopInput(): void {
    this.stdin.removeAllListeners('data');
    this.disableRawMode();
  }

  private processInputBuffer(): void {
    while (this.inputBuffer.length > 0) {
      const result = this.parseNextKey();
      if (!result) break;
      for (const handler of this.keyHandlers) {
        handler(result);
      }
    }
  }

  private parseNextKey(): KeyEvent | null {
    if (this.inputBuffer.length === 0) return null;

    // Read a full unicode code point (handles basic emojis/surrogate pairs)
    const code = this.inputBuffer.codePointAt(0)!;
    const charLen = code > 0xffff ? 2 : 1;
    const ch = this.inputBuffer.slice(0, charLen);

    if (code === 0x1b) {
      if (this.inputBuffer.length >= 2 && this.inputBuffer[1] === '[') {
        return this.parseCsiSequence();
      }
      if (this.inputBuffer.length >= 2 && this.inputBuffer[1] === 'O') {
        return this.parseSs3Sequence();
      }
      if (this.inputBuffer.length >= 2) {
        const altChar = this.inputBuffer[1]!;
        this.inputBuffer = this.inputBuffer.slice(2);
        return {
          name: altChar,
          ctrl: false,
          meta: true,
          shift: altChar === altChar.toUpperCase() && altChar !== altChar.toLowerCase(),
          sequence: `\x1B${altChar}`,
        };
      }
      return null;
    }

    if (code === 0x7f) {
      this.inputBuffer = this.inputBuffer.slice(1);
      return {
        name: 'backspace',
        ctrl: false,
        meta: false,
        shift: false,
        sequence: ch,
      };
    }

    if (code === 0x7f) {
      this.inputBuffer = this.inputBuffer.slice(charLen);
      return {
        name: 'backspace',
        ctrl: false,
        meta: false,
        shift: false,
        sequence: ch,
      };
    }

    if (code < 32) {
      this.inputBuffer = this.inputBuffer.slice(charLen);
      const name = code === 0x09 ? 'tab'
        : code === 0x0a ? 'enter'
        : code === 0x0d ? 'enter'
        : code === 0x08 ? 'backspace'
        : code === 0x1b ? 'escape'
        : String.fromCharCode(code + 64).toLowerCase();
      return {
        name,
        ctrl: true,
        meta: false,
        shift: false,
        sequence: ch,
      };
    }

    this.inputBuffer = this.inputBuffer.slice(charLen);
    return {
      name: ch,
      ctrl: false,
      meta: false,
      shift: ch === ch.toUpperCase() && ch !== ch.toLowerCase(),
      sequence: ch,
    };
  }

  private parseCsiSequence(): KeyEvent | null {
    let i = 2;
    let params = '';
    while (i < this.inputBuffer.length) {
      const c = this.inputBuffer[i]!;
      const cc = c.charCodeAt(0);
      if (cc >= 0x40 && cc <= 0x7e) {
        const seq = this.inputBuffer.slice(0, i + 1);
        this.inputBuffer = this.inputBuffer.slice(i + 1);
        return this.mapCsi(seq.charAt(2)!, params);
      }
      if (cc >= 0x30 && cc <= 0x3f) {
        params += c;
        i++;
      } else if (cc >= 0x20 && cc <= 0x2f) {
        i++;
      } else {
        break;
      }
    }
    return null;
  }

  private parseSs3Sequence(): KeyEvent | null {
    if (this.inputBuffer.length < 3) return null;
    const seq = this.inputBuffer.slice(0, 3);
    this.inputBuffer = this.inputBuffer.slice(3);
    return this.mapSs3(seq.charAt(2)!);
  }

  private mapCsi(intermediate: string, params: string): KeyEvent {
    const p = params || '1';
    const p1 = parseInt(p.split(';')[0] ?? '1', 10);
    const mod = parseInt(p.split(';')[1] ?? '1', 10);
    const shift = !!(mod & 1);
    const meta = !!(mod & 2);
    const ctrl = !!(mod & 4);

    const nameMap: Record<string, string> = {
      'A': 'up', 'B': 'down', 'C': 'right', 'D': 'left',
      'H': 'home', 'F': 'end',
      'Z': 'tab',
    };

    const name = nameMap[intermediate];
    if (name) {
      return { name, ctrl, meta, shift: name === 'tab' ? true : shift, sequence: `\x1B[${params}${intermediate}` };
    }

    if (intermediate === '~') {
      const fnMap: Record<number, string> = {
        1: 'home', 2: 'insert', 3: 'delete', 4: 'end',
        5: 'pageup', 6: 'pagedown',
        7: 'home', 8: 'end',
        11: 'f1', 12: 'f2', 13: 'f3', 14: 'f4',
        15: 'f5', 17: 'f6', 18: 'f7', 19: 'f8',
        20: 'f9', 21: 'f10', 23: 'f11', 24: 'f12',
        200: 'paste_start', 201: 'paste_end',
      };
      return {
        name: fnMap[p1] ?? `unknown_${p1}`,
        ctrl, meta, shift,
        sequence: `\x1B[${p}~`,
      };
    }

    return { name: intermediate, ctrl, meta, shift, sequence: `\x1B[${params}${intermediate}` };
  }

  private mapSs3(ch: string): KeyEvent {
    const fnMap: Record<string, string> = {
      'P': 'f1', 'Q': 'f2', 'R': 'f3', 'S': 'f4',
    };
    return {
      name: fnMap[ch] ?? ch,
      ctrl: false, meta: false, shift: false,
      sequence: `\x1BO${ch}`,
    };
  }

  setTitle(title: string): void {
    this.stdout.write(`\x1B]0;${title}\x07`);
  }

  enableMouse(): void {
    this.stdout.write('\x1B[?1000h\x1B[?1002h\x1B[?1006h');
  }

  disableMouse(): void {
    this.stdout.write('\x1B[?1000l\x1B[?1002l\x1B[?1006l');
  }

  beep(): void {
    this.stdout.write('\x07');
  }

  destroy(): void {
    this.disableRawMode();
    this.showCursor();
    if (this.alternateScreen) {
      this.exitAltScreen();
    }
    this.stdin.removeAllListeners('data');
  }
}
