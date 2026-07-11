import type { AgentEvent, TokenUsage } from 'librecode-types';
import { Spinner } from './spinner.js';
import { renderBanner } from './banner.js';
import { type TerminalCapabilities, getTerminalCapabilities } from './terminal.js';
import { type ExecutionStage, getStageLabel, getStageIcon, inferStageFromTool } from './stage.js';
import { type StatusInfo, formatStatusHeader, getInitialStatus } from './status.js';
import { getLogger } from './logger.js';

export class TerminalRenderer {
  private spinner: Spinner;
  private toolCount = 0;
  private currentLine = '';
  private terminal: TerminalCapabilities;
  private stage: ExecutionStage = 'idle';
  private showBanner: boolean;
  private showStatus: boolean;
  private status: StatusInfo | null = null;
  private sessionStart: number;

  constructor(options?: { showBanner?: boolean; showStatus?: boolean }) {
    this.spinner = new Spinner();
    this.terminal = getTerminalCapabilities();
    this.showBanner = options?.showBanner ?? true;
    this.showStatus = options?.showStatus ?? true;
    this.sessionStart = Date.now();
  }

  setStatus(workingDir: string, provider: string, model: string): void {
    this.status = getInitialStatus(workingDir, provider, model);
  }

  updateContextUsage(used: number, max: number): void {
    if (this.status) {
      this.status.contextUsed = used;
      this.status.contextMax = max;
    }
  }

  private getSessionDuration(): number {
    return Math.floor((Date.now() - this.sessionStart) / 1000);
  }

  startThinking(): void {
    this.stage = 'thinking';
    this.spinner.start(getStageLabel('thinking'));
  }

  stopThinking(): void {
    this.spinner.stop();
    this.stage = 'idle';
  }

  setStage(stage: ExecutionStage): void {
    this.stage = stage;
    if (stage !== 'idle' && stage !== 'completed' && stage !== 'error') {
      this.spinner.start(getStageLabel(stage));
    } else {
      this.spinner.stop();
    }
  }

  handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'text_delta':
        this.handleTextDelta(event.delta);
        break;
      case 'tool_start':
        this.handleToolStart(event.name, event.argsPreview);
        break;
      case 'tool_result':
        this.handleToolResult(event.name, event.success, event.summary);
        break;
      case 'tool_error':
        this.handleToolError(event.name, event.message);
        break;
      case 'fatal_error':
        this.handleFatalError(event.message);
        break;
      case 'turn_complete':
        this.handleTurnComplete(event.turnNumber);
        break;
    }
  }

  private handleTextDelta(delta: string): void {
    this.spinner.stop();
    this.stage = 'generating_response';
    this.currentLine += delta;
    process.stdout.write(delta);
  }

  private handleToolStart(name: string, argsPreview: string): void {
    this.spinner.stop();
    this.stage = inferStageFromTool(name);
    this.toolCount++;

    const icon = getStageIcon(this.stage, this.terminal.supportsUnicodeBlocks);
    const theme = this.terminal.colorDepth >= 256
      ? { dim: '\x1B[38;5;240m', accent: '\x1B[38;5;190m', reset: '\x1B[39m\x1B[22m' }
      : { dim: '\x1B[90m', accent: '\x1B[33m', reset: '\x1B[39m' };

    process.stdout.write(`\n${theme.dim}──${theme.reset} ${theme.accent}${icon} ${name}${theme.reset}${theme.dim}(${argsPreview})${theme.reset}\n`);
    getLogger().debug(`Tool start: ${name}(${argsPreview})`);
  }

  private handleToolResult(name: string, success: boolean, summary: string): void {
    const theme = this.terminal.colorDepth >= 256
      ? { success: '\x1B[38;5;118m', fail: '\x1B[38;5;196m', dim: '\x1B[38;5;245m', reset: '\x1B[39m\x1B[22m' }
      : { success: '\x1B[32m', fail: '\x1B[31m', dim: '\x1B[90m', reset: '\x1B[39m' };

    const icon = success
      ? (this.terminal.supportsUnicodeBlocks ? '✔' : '+')
      : (this.terminal.supportsUnicodeBlocks ? '✘' : 'x');
    const color = success ? theme.success : theme.fail;

    process.stdout.write(`${color}${icon}${theme.reset} ${theme.dim}${summary}${theme.reset}\n`);
    this.setStage('idle');
  }

  private handleToolError(name: string, message: string): void {
    const theme = this.terminal.colorDepth >= 256
      ? { warn: '\x1B[38;5;214m', dim: '\x1B[38;5;245m', reset: '\x1B[39m\x1B[22m' }
      : { warn: '\x1B[33m', dim: '\x1B[90m', reset: '\x1B[39m' };

    const icon = this.terminal.supportsUnicodeBlocks ? '⚠' : '!';
    process.stdout.write(`\n${theme.warn}${icon} ${name}: ${message}${theme.reset}\n`);
    getLogger().warn(`Tool error: ${name} - ${message}`);
    this.setStage('idle');
  }

  private handleFatalError(message: string): void {
    this.spinner.stop();
    this.stage = 'error';
    const theme = '\x1B[38;5;196m';
    const reset = '\x1B[39m\x1B[22m';

    process.stdout.write(`\n${theme}┌─ Error ─────────────────────┐${reset}\n`);
    process.stdout.write(`${theme}│${reset} ${message}\n`);
    process.stdout.write(`${theme}└─────────────────────────────┘${reset}\n`);
    getLogger().error(`Fatal error: ${message}`);
  }

  private handleTurnComplete(turnNumber: number): void {
    this.stage = 'completed';
    this.spinner.stop();

    const theme = this.terminal.colorDepth >= 256
      ? { dim: '\x1B[38;5;240m', reset: '\x1B[39m\x1B[22m' }
      : { dim: '\x1B[90m', reset: '\x1B[39m' };

    process.stdout.write(`\n${theme.dim}─── Turn ${turnNumber} ───${theme.reset}\n\n`);
  }

  printUsage(usage: TokenUsage): void {
    const theme = this.terminal.colorDepth >= 256
      ? { dim: '\x1B[38;5;245m', reset: '\x1B[39m\x1B[22m' }
      : { dim: '\x1B[90m', reset: '\x1B[39m' };

    process.stderr.write(
      `${theme.dim}Tokens: ↑${usage.promptTokens.toLocaleString()} ↓${usage.completionTokens.toLocaleString()} Σ${usage.totalTokens.toLocaleString()}${theme.reset}\n`,
    );
  }

  printBanner(version: string): void {
    if (!this.showBanner) return;
    process.stdout.write(renderBanner(version, this.terminal));
  }

  printStatus(): void {
    if (!this.showStatus || !this.status) return;
    if (this.status) {
      this.status.sessionDuration = this.getSessionDuration();
      process.stdout.write(formatStatusHeader(this.status, this.terminal));
    }
  }

  clearLine(): void {
    this.currentLine = '';
    process.stdout.write('\r\x1B[2K');
  }

  showErrorWithGuidance(message: string, suggestion?: string): void {
    const theme = '\x1B[38;5;196m';
    const accent = '\x1B[38;5;214m';
    const dim = '\x1B[38;5;245m';
    const reset = '\x1B[39m\x1B[22m';

    process.stdout.write(`\n${theme}✘ ${message}${reset}\n`);
    if (suggestion) {
      process.stdout.write(`${dim}  → ${accent}${suggestion}${reset}\n`);
    }
    getLogger().error(message);
  }

  showInfo(message: string): void {
    const theme = this.terminal.colorDepth >= 256
      ? { accent: '\x1B[38;5;117m', reset: '\x1B[39m\x1B[22m' }
      : { accent: '\x1B[36m', reset: '\x1B[39m' };
    process.stdout.write(`${theme.accent}${theme.reset} ${message}\n`);
  }

  showSuccess(message: string): void {
    const theme = this.terminal.colorDepth >= 256
      ? { success: '\x1B[38;5;118m', reset: '\x1B[39m\x1B[22m' }
      : { success: '\x1B[32m', reset: '\x1B[39m' };
    const icon = this.terminal.supportsUnicodeBlocks ? '✔' : '+';
    process.stdout.write(`${theme.success}${icon} ${message}${theme.reset}\n`);
  }
}
