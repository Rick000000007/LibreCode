export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private interval: ReturnType<typeof setInterval> | null = null;
  private currentFrame = 0;
  private message = '';

  start(msg = ''): void {
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
    process.stderr.write(`\r\x1B[36m${frame}${text}\x1B[39m`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stderr.write('\r\x1B[2K\x1B[?25h');
  }
}
