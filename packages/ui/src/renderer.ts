import type { AgentEvent, TokenUsage } from '@rcode/types';
import { Spinner } from './spinner.js';

export class TerminalRenderer {
  private spinner: Spinner;
  private toolCount = 0;
  private currentLine = '';

  constructor() {
    this.spinner = new Spinner();
  }

  startThinking(): void {
    this.spinner.start('thinking');
  }

  stopThinking(): void {
    this.spinner.stop();
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
    this.stopThinking();
    this.currentLine += delta;
    process.stdout.write(delta);
  }

  private handleToolStart(name: string, argsPreview: string): void {
    this.stopThinking();
    this.toolCount++;
    process.stdout.write(`\n\x1B[90m─── \x1B[33m${name}\x1B[90m(${argsPreview})\x1B[39m\n`);
  }

  private handleToolResult(name: string, success: boolean, summary: string): void {
    const color = success ? '\x1B[32m' : '\x1B[31m';
    const status = success ? '✓' : '✗';
    process.stdout.write(`${color}${status} ${summary}\x1B[39m\n`);
  }

  private handleToolError(name: string, message: string): void {
    process.stdout.write(`\n\x1B[31m⚠ ${name} error: ${message}\x1B[39m\n`);
  }

  private handleFatalError(message: string): void {
    process.stdout.write(`\n\x1B[31;1mFATAL: ${message}\x1B[39m\n`);
  }

  private handleTurnComplete(turnNumber: number): void {
    process.stdout.write(`\n\x1B[90m─── Turn ${turnNumber} complete ───\x1B[39m\n\n`);
  }

  printUsage(usage: TokenUsage): void {
    process.stderr.write(
      `\n\x1B[90mTokens: ${usage.promptTokens}↑ ${usage.completionTokens}↓ total: ${usage.totalTokens}\x1B[39m\n`,
    );
  }

  printBanner(version: string): void {
    process.stdout.write(
      `\x1B[36m╭────────────────────────────╮\x1B[39m\n` +
      `\x1B[36m│ \x1B[1mrcode v${version.padEnd(4)}\x1B[22m AI coding agent\x1B[36m │\x1B[39m\n` +
      `\x1B[36m╰────────────────────────────╯\x1B[39m\n\n`,
    );
  }

  clearLine(): void {
    this.currentLine = '';
    process.stdout.write('\r\x1B[2K');
  }
}
