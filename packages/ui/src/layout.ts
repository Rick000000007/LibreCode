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

    for (let i = 0; i < Math.min(activeSteps.length, r.height - 1); i++) {
      const step = activeSteps[i]!;
      const statusIcon = step.status === 'active'
        ? `${theme.secondary}\u25CB${theme.reset}`
        : step.status === 'completed'
          ? `${theme.success}\u2714${theme.reset}`
          : step.status === 'failed'
            ? `${theme.error}\u2718${theme.reset}`
            : `${theme.dim}\u25CB${theme.reset}`;
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
