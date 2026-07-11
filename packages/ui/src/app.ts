import { TuiEngine, type KeyEvent } from './tui.js';
import { InputHandler } from './input.js';
import { Sidebar } from './sidebar.js';
import { Layout } from './layout.js';
import { Completer } from './completer.js';
import { WorkflowTracker } from './workflow.js';
import { renderMarkdown } from './markdown.js';
import { getTheme } from './theme.js';
import { getTerminalCapabilities } from './terminal.js';


export interface TuiAppOptions {
  provider: string;
  model: string;
  gitBranch: string | null;
  workingDir: string;
  onSubmit: (input: string) => void;
  onCancel?: () => void;
  onCommand?: (command: string) => void;
}

export class TuiApp {
  private tui: TuiEngine;
  private sidebar: Sidebar;
  private layout: Layout;
  private input: InputHandler;
  private completer: Completer;
  private workflow: WorkflowTracker;
  private options: TuiAppOptions;
  private conversationBuffer: string[] = [];
  private scrollOffset = 0;
  private lastKeyTime = 0;
  private provider: string;
  private model: string;
  private gitBranch: string | null;
  private tokenPct = 0;

  constructor(options: TuiAppOptions) {
    this.options = options;
    this.provider = options.provider;
    this.model = options.model;
    this.gitBranch = options.gitBranch;

    this.tui = new TuiEngine({
      onKey: (key) => this.handleKey(key),
      onResize: (w, h) => this.handleResize(w, h),
    });

    this.completer = new Completer({
      workingDir: options.workingDir,
      providerId: options.provider,
    });

    this.sidebar = new Sidebar(this.tui);
    this.layout = new Layout(this.tui, this.sidebar);
    this.workflow = new WorkflowTracker();

    this.input = new InputHandler({
      prompt: '\x1B[36m>\x1B[39m ',
      completer: this.completer,
      tui: this.tui,
      onSubmit: (value) => {
        this.addToConversation(`\x1B[36m>\x1B[39m ${value}`, 'user');
        this.options.onSubmit(value);
      },
      onCancel: () => {
        this.options.onCancel?.();
      },
      onCommandPalette: () => {
        this.openCommandPalette();
      },
    });
  }

  private handleKey(key: KeyEvent): boolean {
    // Global shortcuts
    if (key.ctrl && key.name === 'b') {
      this.sidebar.toggle();
      this.requestRender();
      return true;
    }

    if (key.ctrl && key.name === 'l') {
      this.tui.clearScreen();
      this.requestRender();
      return true;
    }

    // Delegate to input handler
    this.lastKeyTime = Date.now();
    return this.input.handleKey(key);
  }

  private handleResize(_w: number, _h: number): void {
    this.requestRender();
  }

  start(): void {
    this.tui.enterAltScreen();
    this.tui.hideCursor();
    this.tui.enableRawMode();
    this.tui.setTitle('librecode - AI Coding Agent');
    this.tui.startInput();
    this.render();
  }

  stop(): void {
    this.tui.stopInput();
    this.tui.showCursor();
    this.tui.destroy();
  }

  addToConversation(text: string, role?: 'user' | 'assistant' | 'system'): void {
    const theme = getTheme();
    let formatted = text;

    if (role === 'system') {
      formatted = `${theme.dim}${text}${theme.reset}`;
    }

    this.conversationBuffer.push(formatted);
    this.scrollOffset = 0;
    this.requestRender();
  }

  appendToLast(text: string): void {
    if (this.conversationBuffer.length > 0) {
      this.conversationBuffer[this.conversationBuffer.length - 1] += text;
    } else {
      this.conversationBuffer.push(text);
    }
    this.requestRender();
  }

  addMarkdown(text: string): void {
    const rendered = renderMarkdown(text);
    this.conversationBuffer.push(rendered);
    this.scrollOffset = 0;
    this.requestRender();
  }

  setProviderInfo(provider: string, model: string): void {
    this.provider = provider;
    this.model = model;
    this.requestRender();
  }

  setGitBranch(branch: string | null): void {
    this.gitBranch = branch;
    this.requestRender();
  }

  setTokenPct(pct: number): void {
    this.tokenPct = pct;
    this.requestRender();
  }

  getWorkflow(): WorkflowTracker {
    return this.workflow;
  }

  getTui(): TuiEngine {
    return this.tui;
  }

  getInput(): InputHandler {
    return this.input;
  }

  getLayout(): Layout {
    return this.layout;
  }

  private openCommandPalette(): void {
    const theme = getTheme();
    const cap = getTerminalCapabilities();
    const y = Math.floor(cap.height / 3);

    // Draw overlay
    this.tui.cursorTo(10, y);
    const width = Math.min(cap.width - 20, 60);
    const boxTop = `${theme.primary}\u250C${'\u2500'.repeat(width)}\u2510${theme.reset}`;
    const boxMid = `${theme.primary}\u2502${theme.reset}${' '.repeat(width)}${theme.primary}\u2502${theme.reset}`;
    const boxBot = `${theme.primary}\u2514${'\u2500'.repeat(width)}\u2518${theme.reset}`;

    this.tui.write(`\n${boxTop}\n`);
    for (let i = 0; i < 5; i++) {
      this.tui.write(`${boxMid}\n`);
    }
    this.tui.write(`${boxBot}\n`);

    this.tui.cursorTo(12, y + 1);
    this.tui.write(`${theme.bold}Command Palette${theme.reset}`);
    this.tui.cursorTo(12, y + 3);
    this.tui.write(`${theme.dim}Type a command...${theme.reset}`);
    this.tui.cursorTo(12, y + 3);
  }

  private requestRender(): void {
    this.render();
  }

  render(): void {
    const regions = this.layout.getRegions();

    // Status bar
    this.layout.renderStatusBar(this.provider, this.model, this.gitBranch, this.tokenPct);

    // Sidebar
    this.sidebar.render(regions.sidebar.y, regions.sidebar.height);

    // Workflow panel
    const wfSteps = this.workflow.getSteps().map((s) => ({
      label: s.label,
      status: s.status,
      detail: s.detail,
    }));
    this.layout.renderWorkflowPanel(wfSteps);

    // Conversation area
    this.renderConversation(regions.conversation);

    // Input
    this.input.renderInput();
  }

  private renderConversation(region: { x: number; y: number; width: number; height: number }): void {
    const { x, y, width, height } = region;

    if (width <= 0 || height <= 0) return;

    // Calculate visible lines
    const lines: string[] = [];
    for (const block of this.conversationBuffer) {
      const blockLines = block.split('\n');
      lines.push(...blockLines);
    }

    const visibleLines = lines.slice(
      Math.max(0, lines.length - height + this.scrollOffset),
      lines.length + this.scrollOffset,
    );

    // Clear conversation area
    for (let i = 0; i < height; i++) {
      this.tui.cursorTo(x, y + i);
      this.tui.write('\x1B[2K');
    }

    // Draw conversation lines
    const startIdx = Math.max(0, visibleLines.length - height);
    for (let i = 0; i < Math.min(visibleLines.length, height); i++) {
      const line = visibleLines[startIdx + i] ?? '';
      this.tui.cursorTo(x, y + i);
      const displayLine = line.length > width ? line.slice(0, width - 3) + '...' : line;
      this.tui.write(displayLine);
    }

    // Fill remaining space
    if (visibleLines.length < height) {
      for (let i = visibleLines.length; i < height; i++) {
        this.tui.cursorTo(x, y + i);
        this.tui.write('\x1B[2K');
      }
    }
  }
}
