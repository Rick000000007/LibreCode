import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { type TerminalCapabilities, truncateMiddle } from './terminal.js';

export interface StatusInfo {
  workspace: string;
  gitBranch: string | null;
  provider: string;
  model: string;
  contextUsed: number;
  contextMax: number;
  sessionDuration: number;
}

function getGitBranch(dir: string): string | null {
  try {
    const result = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

function getGitStatus(dir: string): string | null {
  try {
    const result = execFileSync('git', ['status', '--porcelain'], {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = result.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    return lines.length > 1 ? `${lines.length} files` : '1 file';
  } catch {
    return null;
  }
}

export function getInitialStatus(workingDir: string, provider: string, model: string): StatusInfo {
  const home = os.homedir();
  const displayDir = workingDir.startsWith(home)
    ? '~' + workingDir.slice(home.length)
    : workingDir;

  return {
    workspace: truncateMiddle(displayDir, 30),
    gitBranch: getGitBranch(workingDir),
    provider,
    model: truncateMiddle(model, 25),
    contextUsed: 0,
    contextMax: 128000,
    sessionDuration: 0,
  };
}

export function formatStatusHeader(
  status: StatusInfo,
  cap: TerminalCapabilities,
): string {
  const theme = getStatusTheme(cap);
  const parts: string[] = [];

  if (cap.colorDepth >= 256) {
    parts.push(`${theme.bracket}┌─${theme.reset}`);

    if (status.gitBranch) {
      const dirty = getGitStatus(process.cwd());
      const dirtyMarker = dirty ? ` ${theme.modified}*${theme.reset}` : '';
      parts.push(` ${theme.git}${status.gitBranch}${dirtyMarker}${theme.reset}`);
    }

    parts.push(` ${theme.provider}${status.provider}${theme.reset}`);
    parts.push(`${theme.dim}/${theme.reset} ${theme.model}${status.model}${theme.reset}`);

    const dir = status.workspace;
    parts.push(` ${theme.dim}${dir}${theme.reset}`);

    parts.push(`${theme.bracket}┐${theme.reset}`);
    const header = parts.join('');

    const secondLine = `${theme.bracket}│${theme.reset}`;
    const pct = status.contextMax > 0
      ? Math.round((status.contextUsed / status.contextMax) * 100)
      : 0;
    const barLen = Math.max(10, Math.min(30, cap.width - 20));
    const filled = Math.round((pct / 100) * barLen);
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
    const ctxStr = `${status.contextUsed.toLocaleString()}/${status.contextMax.toLocaleString()} (${pct}%)`;
    const durStr = formatDuration(status.sessionDuration);

    return `${header}\n${secondLine} ${theme.dim}ctx:${theme.reset} ${theme.bar}${bar}${theme.reset} ${ctxStr} ${theme.dim}${durStr}${theme.reset} ${theme.bracket}│${theme.reset}\n${theme.bracket}└${'─'.repeat(Math.max(10, cap.width - 6))}┘${theme.reset}\n`;
  }

  parts.push('──');
  if (status.gitBranch) parts.push(status.gitBranch);
  parts.push(`${status.provider}/${status.model}`);
  parts.push(status.workspace);
  return parts.join(' ') + '\n';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

interface StatusTheme {
  bracket: string;
  git: string;
  provider: string;
  model: string;
  dim: string;
  modified: string;
  bar: string;
  reset: string;
}

function getStatusTheme(cap: TerminalCapabilities): StatusTheme {
  const reset = '\x1B[39m\x1B[22m\x1B[23m';
  if (cap.colorDepth >= 256) {
    return {
      bracket: '\x1B[38;5;240m',
      git: '\x1B[38;5;117m',
      provider: '\x1B[38;5;213m',
      model: '\x1B[38;5;156m',
      dim: '\x1B[38;5;245m',
      modified: '\x1B[38;5;214m',
      bar: '\x1B[38;5;117m',
      reset,
    };
  }
  return {
    bracket: '\x1B[90m',
    git: '\x1B[36m',
    provider: '\x1B[35m',
    model: '\x1B[32m',
    dim: '\x1B[90m',
    modified: '\x1B[33m',
    bar: '\x1B[36m',
    reset,
  };
}
