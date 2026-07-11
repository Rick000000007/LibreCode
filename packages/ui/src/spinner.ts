import { getTerminalCapabilities } from './terminal.js';

const SPINNER_FRAMES = {
  braille: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  ascii: ['|', '/', '-', '\\'],
  dots: ['◧', '◨', '◧', '◨'],
};

export class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private currentFrame = 0;
  private message = '';
  private frames: string[];
  private useColor: boolean;

  constructor() {
    const cap = getTerminalCapabilities();
    if (!cap.supportsUnicodeBlocks) {
      this.frames = SPINNER_FRAMES.ascii;
    } else {
      this.frames = SPINNER_FRAMES.braille;
    }
    this.useColor = cap.colorDepth >= 4;
  }

  start(msg = ''): void {
    if (this.interval) this.stop();
    this.message = msg;
    this.currentFrame = 0;
    process.stderr.write('\x1B[?25l');
    this.render();
    this.interval = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.render();
    }, 80);
  }

  private render(): void {
    const frame = this.frames[this.currentFrame];
    const text = this.message ? ` ${this.message}` : '';
    const color = this.useColor ? '\x1B[36m' : '';
    const reset = this.useColor ? '\x1B[39m' : '';
    process.stderr.write(`\r${color}${frame}${text}${reset}`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stderr.write('\r\x1B[2K\x1B[?25h');
    }
  }

  updateMessage(msg: string): void {
    this.message = msg;
    if (this.interval) {
      this.render();
    }
  }
}
