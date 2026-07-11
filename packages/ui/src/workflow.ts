import { getTerminalCapabilities, type TerminalCapabilities } from './terminal.js';
import { getTheme } from './theme.js';
import { getStageIcon } from './stage.js';

export interface WorkflowStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  startedAt: number;
  duration?: number;
  detail?: string;
  output?: string;
}

export class WorkflowTracker {
  private steps: WorkflowStep[] = [];
  private currentStepId: string | null = null;
  private startTime: number;
  private terminal: TerminalCapabilities;

  constructor() {
    this.startTime = Date.now();
    this.terminal = getTerminalCapabilities();
  }

  beginStep(id: string, label: string): void {
    this.currentStepId = id;
    const existing = this.steps.find((s) => s.id === id);
    if (existing) {
      existing.status = 'active';
      existing.startedAt = Date.now();
      existing.duration = undefined;
    } else {
      this.steps.push({
        id,
        label,
        status: 'active',
        startedAt: Date.now(),
      });
    }
    this.render();
  }

  completeStep(id: string, detail?: string): void {
    const step = this.steps.find((s) => s.id === id);
    if (step) {
      step.status = 'completed';
      step.duration = Date.now() - step.startedAt;
      step.detail = detail;
    }
    if (this.currentStepId === id) {
      this.currentStepId = null;
    }
  }

  failStep(id: string, detail?: string): void {
    const step = this.steps.find((s) => s.id === id);
    if (step) {
      step.status = 'failed';
      step.duration = Date.now() - step.startedAt;
      step.detail = detail;
    }
    if (this.currentStepId === id) {
      this.currentStepId = null;
    }
  }

  setStepDetail(id: string, detail: string): void {
    const step = this.steps.find((s) => s.id === id);
    if (step) {
      step.detail = detail;
      this.render();
    }
  }

  getActiveStep(): WorkflowStep | null {
    if (!this.currentStepId) return null;
    return this.steps.find((s) => s.id === this.currentStepId) ?? null;
  }

  getSteps(): WorkflowStep[] {
    return [...this.steps];
  }

  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  reset(): void {
    this.steps = [];
    this.currentStepId = null;
    this.startTime = Date.now();
  }

  render(): void {
    const theme = getTheme();
    const useUnicode = this.terminal.supportsUnicodeBlocks;

    // Clear previous workflow display
    process.stderr.write('\r\x1B[J');

    const active = this.getActiveStep();
    if (!active) return;

    const elapsed = Date.now() - active.startedAt;
    const elapsedStr = formatDuration(elapsed);
    const icon = getStageIcon(toStage(active.label), useUnicode);

    process.stderr.write(
      `${theme.secondary}${icon}${theme.reset} ${theme.bold}${active.label}${theme.reset}` +
      ` ${theme.dim}${elapsedStr}${theme.reset}`,
    );
  }

  renderSummary(): string {
    const theme = getTheme();
    const lines: string[] = [];
    const useUnicode = this.terminal.supportsUnicodeBlocks;

    lines.push(`${theme.dim}${'─'.repeat(Math.min(this.terminal.width, 60))}${theme.reset}`);

    for (const step of this.steps) {
      const icon = step.status === 'completed'
        ? (useUnicode ? '✔' : '+')
        : step.status === 'failed'
          ? (useUnicode ? '✘' : 'x')
          : step.status === 'active'
            ? '◉'
            : '○';
      const color = step.status === 'completed'
        ? theme.success
        : step.status === 'failed'
          ? theme.error
          : theme.muted;
      const dur = step.duration ? ` ${theme.dim}(${formatDuration(step.duration)})${theme.reset}` : '';

      lines.push(`  ${color}${icon}${theme.reset} ${step.label}${dur}`);
      if (step.detail) {
        lines.push(`    ${theme.dim}${step.detail}${theme.reset}`);
      }
    }

    return lines.join('\n') + '\n';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

function toStage(label: string): 'analyzing_repo' | 'reading_files' | 'thinking' {
  const l = label.toLowerCase();
  if (l.includes('analyze') || l.includes('repo') || l.includes('search')) return 'analyzing_repo';
  if (l.includes('read') || l.includes('file')) return 'reading_files';
  return 'thinking';
}
