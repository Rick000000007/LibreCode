import { TuiEngine } from './tui.js';
import { getTheme } from './theme.js';
import { getTerminalCapabilities } from './terminal.js';

export type SidebarPanel = 'explorer' | 'git' | 'diagnostics' | 'context' | 'tools' | 'plugins' | 'memory' | null;

export interface SidebarTab {
  id: SidebarPanel;
  label: string;
  icon: string;
}

const TABS: SidebarTab[] = [
  { id: 'explorer', label: 'Explorer', icon: '\u{1F4C1}' },
  { id: 'git', label: 'Git', icon: '\u{2447}' },
  { id: 'diagnostics', label: 'Diagnostics', icon: '\u{2665}' },
  { id: 'context', label: 'Context', icon: '\u{25A3}' },
  { id: 'tools', label: 'Tools', icon: '\u{1F527}' },
  { id: 'plugins', label: 'Plugins', icon: '\u{1F9F0}' },
  { id: 'memory', label: 'Memory', icon: '\u{1F4BE}' },
];

export class Sidebar {
  private tui: TuiEngine;
  private activePanel: SidebarPanel = null;
  private visible = false;
  private width = 28;
  private explorerFiles: string[] = [];
  private gitBranch: string | null = null;
  private gitChanges: string[] = [];

  constructor(tui: TuiEngine) {
    this.tui = tui;
  }

  isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.visible = !this.visible;
  }

  show(): void {
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  setActivePanel(panel: SidebarPanel): void {
    this.activePanel = panel;
  }

  getActivePanel(): SidebarPanel {
    return this.activePanel;
  }

  getWidth(): number {
    return this.visible ? this.width : 0;
  }

  setExplorerFiles(files: string[]): void {
    this.explorerFiles = files;
  }

  setGitInfo(branch: string | null, changes: string[]): void {
    this.gitBranch = branch;
    this.gitChanges = changes;
  }

  render(y: number, height: number): void {
    if (!this.visible) return;

    const theme = getTheme();
    const cap = getTerminalCapabilities();

    // Draw sidebar background
    const bg = cap.colorDepth >= 256 ? '\x1B[48;5;234m' : '\x1B[40m';

    for (let row = 0; row < height; row++) {
      this.tui.cursorTo(0, y + row);
      this.tui.write(`${bg}${' '.repeat(this.width)}${'\x1B[49m'}`);
    }

    // Draw tab bar
    this.tui.cursorTo(0, y);
    this.tui.write(`${bg}${theme.bold}  Sidebar${'\x1B[22m'}${' '.repeat(this.width - 9)}\x1B[49m`);

    // Draw panel tabs
    let tabY = y + 1;
    for (const tab of TABS) {
      const isActive = tab.id === this.activePanel;
      const selBg = isActive ? (cap.colorDepth >= 256 ? '\x1B[48;5;236m' : '\x1B[44m') : bg;
      this.tui.cursorTo(0, tabY);
      this.tui.write(`${selBg}  ${isActive ? theme.accent : theme.dim}${tab.icon} ${tab.label}${theme.reset}${' '.repeat(Math.max(0, this.width - 4 - tab.label.length))}\x1B[49m`);
      tabY++;
    }

    // Draw active panel content
    if (this.activePanel) {
      this.renderPanelContent(tabY, y + height - tabY);
    }
  }

  private renderPanelContent(startY: number, maxHeight: number): void {
    const theme = getTheme();
    const cap = getTerminalCapabilities();
    const bg = cap.colorDepth >= 256 ? '\x1B[48;5;234m' : '\x1B[40m';
    let row = 0;

    switch (this.activePanel) {
      case 'explorer':
        this.tui.cursorTo(0, startY);
        this.tui.write(`${bg}  ${theme.bold}Workspace${theme.reset}${' '.repeat(this.width - 11)}\x1B[49m`);
        row = 1;
        for (const file of this.explorerFiles.slice(0, maxHeight - 2)) {
          this.tui.cursorTo(0, startY + row);
          this.tui.write(`${bg}  ${theme.muted}${file}${theme.reset}${' '.repeat(Math.max(0, this.width - 2 - file.length))}\x1B[49m`);
          row++;
        }
        break;

      case 'git':
        this.tui.cursorTo(0, startY);
        this.tui.write(`${bg}  ${theme.bold}${this.gitBranch ?? '(no repo)'}${theme.reset}${' '.repeat(Math.max(0, this.width - 2 - (this.gitBranch?.length ?? 10)))}\x1B[49m`);
        row = 1;
        for (const change of this.gitChanges.slice(0, maxHeight - 2)) {
          this.tui.cursorTo(0, startY + row);
          const icon = change.startsWith('M') ? 'M' : change.startsWith('?') ? '?' : ' ';
          this.tui.write(`${bg}  ${theme.warning}${icon}${theme.reset} ${theme.muted}${change.slice(2)}${theme.reset}${' '.repeat(Math.max(0, this.width - 4 - change.length))}\x1B[49m`);
          row++;
        }
        break;

      case 'context':
        this.tui.cursorTo(0, startY);
        this.tui.write(`${bg}  ${theme.bold}Context${theme.reset}${' '.repeat(this.width - 9)}\x1B[49m`);
        row = 1;
        this.tui.cursorTo(0, startY + row);
        this.tui.write(`${bg}  ${theme.dim}Token usage${theme.reset}${' '.repeat(this.width - 12)}\x1B[49m`);
        row++;
        this.tui.cursorTo(0, startY + row);
        this.tui.write(`${bg}  ${theme.muted}Provider info${theme.reset}${' '.repeat(this.width - 14)}\x1B[49m`);
        break;

      case 'diagnostics':
        this.tui.cursorTo(0, startY);
        this.tui.write(`${bg}  ${theme.bold}Health${theme.reset}${' '.repeat(this.width - 7)}\x1B[49m`);
        row = 1;
        this.tui.cursorTo(0, startY + row);
        this.tui.write(`${bg}  ${theme.success}\u2714${theme.reset} ${theme.dim}System OK${theme.reset}${' '.repeat(this.width - 13)}\x1B[49m`);
        break;

      case 'tools':
        this.tui.cursorTo(0, startY);
        this.tui.write(`${bg}  ${theme.bold}Tools${theme.reset}${' '.repeat(this.width - 7)}\x1B[49m`);
        row = 1;
        this.tui.cursorTo(0, startY + row);
        this.tui.write(`${bg}  ${theme.dim}Running tools...${theme.reset}${' '.repeat(this.width - 17)}\x1B[49m`);
        break;

      case 'plugins':
        this.tui.cursorTo(0, startY);
        this.tui.write(`${bg}  ${theme.bold}Plugins${theme.reset}${' '.repeat(this.width - 9)}\x1B[49m`);
        row = 1;
        this.tui.cursorTo(0, startY + row);
        this.tui.write(`${bg}  ${theme.dim}No plugins loaded${theme.reset}${' '.repeat(this.width - 19)}\x1B[49m`);
        break;

      case 'memory':
        this.tui.cursorTo(0, startY);
        this.tui.write(`${bg}  ${theme.bold}Memory${theme.reset}${' '.repeat(this.width - 8)}\x1B[49m`);
        row = 1;
        this.tui.cursorTo(0, startY + row);
        this.tui.write(`${bg}  ${theme.dim}No sessions${theme.reset}${' '.repeat(this.width - 13)}\x1B[49m`);
        break;
    }

    // Fill remaining space
    for (let r = startY + row + 1; r < startY + maxHeight; r++) {
      this.tui.cursorTo(0, r);
      this.tui.write(`${bg}${' '.repeat(this.width)}\x1B[49m`);
    }
  }
}
