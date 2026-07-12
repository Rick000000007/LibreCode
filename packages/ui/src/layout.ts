import { TuiEngine } from './tui.js';
import { Sidebar } from './sidebar.js';
import { getTheme } from './theme.js';

export interface LayoutRegions {
  statusBar: { x: number; y: number; width: number; height: number };
  sidebar: { x: number; y: number; width: number; height: number };
  conversation: { x: number; y: number; width: number; height: number };
  input: { x: number; y: number; width: number; height: number };
  suggestionArea: { x: number; y: number; width: number; height: number };
  workflowPanel: { x: number; y: number; width: number; height: number };
}

export class Layout {
  private tui: TuiEngine;
  private sidebar: Sidebar;
  private statusBarHeight = 1;
  private workflowPanelHeight = 3;
  private inputHeight = 1;

  constructor(tui: TuiEngine, sidebar: Sidebar) {
    this.tui = tui;
    this.sidebar = sidebar;
  }

  getRegions(): LayoutRegions {
    const w = this.tui.width;
    const h = this.tui.height;
    const sbWidth = this.sidebar.getWidth();

    return {
      statusBar: { x: 0, y: 0, width: w, height: this.statusBarHeight },
      sidebar: { x: 0, y: this.statusBarHeight, width: sbWidth, height: h - this.statusBarHeight - this.inputHeight },
      conversation: {
        x: sbWidth,
        y: this.statusBarHeight,
        width: w - sbWidth,
        height: h - this.statusBarHeight - this.inputHeight - this.workflowPanelHeight,
      },
      workflowPanel: {
        x: sbWidth,
        y: h - this.statusBarHeight - this.inputHeight - this.workflowPanelHeight,
        width: w - sbWidth,
        height: this.workflowPanelHeight,
      },
      input: { x: sbWidth, y: h - this.inputHeight, width: w - sbWidth, height: this.inputHeight },
      suggestionArea: {
        x: sbWidth,
        y: h - this.inputHeight - 8,
        width: w - sbWidth,
        height: 8,
      },
    };
  }

  renderStatusBar(provider: string, model: string, gitBranch: string | null, tokenPct: number): void {
    const regions = this.getRegions();
    const theme = getTheme();
    const r = regions.statusBar;
    const width = r.width;

    if (width <= 0) return;

    const git = gitBranch ? ` ${theme.git}\u{2447} ${gitBranch}${theme.reset}` : '';
    const tokens = tokenPct > 0 ? ` ${theme.dim}ctx: ${tokenPct}%${theme.reset}` : '';
    const prov = ` ${theme.provider}${theme.bold}${provider}${theme.reset}${theme.dim}/${theme.reset}${theme.model}${model}${theme.reset}`;

    let statusLine = `${theme.bg}${theme.fg}`;
    statusLine += `${prov}${git}${tokens}`;

    const rightSide = ` ${theme.dim}Ctrl+K:palette | /:commands${theme.reset} `;
    const rightLen = stripLen(rightSide);
    const leftLen = stripLen(statusLine);
    const padding = width - leftLen - rightLen;
    if (padding > 0) {
      statusLine += ' '.repeat(padding);
    }
    statusLine += rightSide;
    statusLine += `${theme.reset}\x1B[49m`;

    this.tui.cursorTo(r.x, r.y);
    this.tui.write(`\x1B[2K${statusLine}`);
  }

  renderWorkflowPanel(steps: Array<{ label: string; status: string; detail?: string }>): void {
    const regions = this.getRegions();
    const theme = getTheme();
    const r = regions.workflowPanel;

    if (r.width <= 0 || r.height <= 0) return;

    const activeSteps = steps.slice(-2);

    this.tui.cursorTo(r.x, r.y);
    this.tui.write(`\x1B[2K${theme.dim}${'\u2500'.repeat(r.width)}${theme.reset}`);

    const spinnerFrames = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
    const spinnerColors = ['\x1B[35m', '\x1B[34m', '\x1B[36m', '\x1B[32m', '\x1B[33m', '\x1B[31m']; // magenta, blue, cyan, green, yellow, red

    for (let i = 0; i < Math.min(activeSteps.length, r.height - 1); i++) {
      const step = activeSteps[i]!;
      
      let statusIcon = '';
      if (step.status === 'active') {
        const frameIndex = Math.floor(Date.now() / 70) % spinnerFrames.length;
        const colorIndex = Math.floor(Date.now() / 70) % spinnerColors.length;
        const symbol = spinnerFrames[frameIndex];
        const color = spinnerColors[colorIndex];
        statusIcon = `${color}${symbol}\x1B[39m`;
      } else if (step.status === 'completed') {
        const lower = step.label.toLowerCase();
        let icon = '\u2714'; // ✔
        let color = '\x1B[34m'; // blue
        
        if (lower.includes('read')) {
          icon = '\u25A4'; // ▤
          color = '\x1B[36m'; // cyan
        } else if (lower.includes('writ') || lower.includes('edit')) {
          icon = '\u270E'; // ✎
          color = '\x1B[32m'; // green
        } else if (lower.includes('run') || lower.includes('exec') || lower.includes('command')) {
          icon = '\u276F'; // ❯
          color = '\x1B[33m'; // yellow
        } else if (lower.includes('analyz') || lower.includes('search')) {
          icon = '\u25A4'; // ▤
          color = '\x1B[36m'; // cyan
        }
        
        statusIcon = `${color}${icon}\x1B[39m`;
      } else if (step.status === 'failed') {
        statusIcon = `\x1B[31m\u2716\x1B[39m`; // red cross ✖
      } else {
        statusIcon = `${theme.dim}\u25CB${theme.reset}`;
      }

      const label = step.label;
      const detail = step.detail ? ` ${theme.dim}${step.detail}${theme.reset}` : '';

      this.tui.cursorTo(r.x, r.y + 1 + i);
      this.tui.write(`\x1B[2K  ${statusIcon} ${theme.bold}${label}${theme.reset}${detail}`);
    }
  }
}

const ESC_LITERAL = '\u001B';

function stripLen(text: string): number {
  return text.replace(new RegExp(ESC_LITERAL + '\\[[0-9;]*[a-zA-Z]', 'g'), '').length;
}
