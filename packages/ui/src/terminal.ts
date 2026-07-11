import * as os from 'node:os';

export interface TerminalCapabilities {
  isTTY: boolean;
  supportsUTF8: boolean;
  supportsColor: boolean;
  colorDepth: 1 | 4 | 8 | 16 | 256 | 16777216;
  supportsUnicodeBlocks: boolean;
  width: number;
  height: number;
  isDark: boolean | null;
  platform: 'linux' | 'macos' | 'windows' | 'unknown';
  isWSL: boolean;
  isSSH: boolean;
  isDocker: boolean;
  isCI: boolean;
  isTermux: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
}

let cached: TerminalCapabilities | null = null;

function detectCI(): boolean {
  return !!(
    process.env['CI'] ||
    process.env['GITHUB_ACTIONS'] ||
    process.env['GITLAB_CI'] ||
    process.env['CIRCLECI'] ||
    process.env['JENKINS_URL'] ||
    process.env['TRAVIS'] ||
    process.env['BUILDKITE'] ||
    process.env['CODEBUILD_BUILD_ID']
  );
}

function detectWSL(): boolean {
  try {
    return os.release().toLowerCase().includes('microsoft') ||
      os.release().toLowerCase().includes('wsl');
  } catch {
    return false;
  }
}

function detectDocker(): boolean {
  try {
    return (!!process.env['DOCKER']) || (!!process.env['KUBERNETES_SERVICE_HOST']);
  } catch {
    return false;
  }
}

function detectSSH(): boolean {
  return !!(
    process.env['SSH_CONNECTION'] ||
    process.env['SSH_CLIENT'] ||
    process.env['SSH_TTY']
  );
}

function detectTermux(): boolean {
  try {
    return !!process.env['TERMUX_VERSION'] || os.homedir().startsWith('/data/data/com.termux');
  } catch {
    return false;
  }
}

function detectColorDepth(): 1 | 4 | 8 | 16 | 256 | 16777216 {
  if (!process.stdout.isTTY) return 1;
  if (process.env['NO_COLOR'] && process.env['NO_COLOR'] !== '0') return 1;
  if (process.env['FORCE_COLOR'] === '0') return 1;

  const term = process.env['TERM'] ?? '';
  const colorterm = process.env['COLORTERM'] ?? '';

  if (colorterm === 'truecolor' || colorterm === '24bit') return 16777216;
  if (term.endsWith('-256color') || term === 'xterm-256color' || term === 'screen-256color') return 256;
  if (term.endsWith('-color') || term === 'xterm-color' || term === 'screen') return 8;
  if (term === 'vt100' || term === 'dumb') return 1;

  return 16777216;
}

function detectUTF8(): boolean {
  const lang = process.env['LANG'] ?? '';
  const lcAll = process.env['LC_ALL'] ?? '';
  const lcCtype = process.env['LC_CTYPE'] ?? '';

  if (lang.includes('UTF-8') || lang.includes('utf8')) return true;
  if (lcAll.includes('UTF-8') || lcAll.includes('utf8')) return true;
  if (lcCtype.includes('UTF-8') || lcCtype.includes('utf8')) return true;

  if (process.platform === 'darwin') return true;
  if (process.platform === 'win32') return true;
  return false;
}

function detectUnicodeBlocks(): boolean {
  if (!process.stdout.isTTY) return false;
  const term = process.env['TERM'] ?? '';
  if (term === 'linux' || term === 'vt100' || term === 'dumb') return false;
  return detectUTF8();
}

function detectReducedMotion(): boolean {
  return process.env['REDUCED_MOTION'] === '1' || process.env['NO_ANIMATION'] === '1';
}

function detectHighContrast(): boolean {
  return !!process.env['HIGH_CONTRAST'] || process.env['FORCE_HIGH_CONTRAST'] === '1';
}

export function getTerminalCapabilities(): TerminalCapabilities {
  if (cached) return cached;

  const platform = (() => {
    const p = process.platform;
    if (p === 'linux') return 'linux' as const;
    if (p === 'darwin') return 'macos' as const;
    if (p === 'win32') return 'windows' as const;
    return 'unknown' as const;
  })();

  cached = {
    isTTY: process.stdout.isTTY ?? false,
    supportsUTF8: detectUTF8(),
    supportsColor: !(process.env['NO_COLOR'] && process.env['NO_COLOR'] !== '0'),
    colorDepth: detectColorDepth(),
    supportsUnicodeBlocks: detectUnicodeBlocks(),
    width: process.stdout.columns ?? 80,
    height: process.stdout.rows ?? 24,
    isDark: null,
    platform,
    isWSL: detectWSL(),
    isSSH: detectSSH(),
    isDocker: detectDocker(),
    isCI: detectCI(),
    isTermux: detectTermux(),
    reducedMotion: detectReducedMotion(),
    highContrast: detectHighContrast(),
  };

  return cached;
}

export function resetTerminalCache(): void {
  cached = null;
}

export function supportsEmoji(): boolean {
  const cap = getTerminalCapabilities();
  if (cap.isCI) return false;
  if (!cap.supportsUTF8) return false;
  if (cap.platform === 'linux' && !cap.isWSL) return true;
  if (cap.platform === 'macos') return true;
  return false;
}

export function formatWidth(text: string, width: number): string {
  const visible = stripAnsi(text);
  if (visible.length >= width) return visible.slice(0, width);
  return text + ' '.repeat(width - visible.length);
}

export function truncateMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const half = Math.floor((maxLen - 3) / 2);
  return text.slice(0, half) + '...' + text.slice(text.length - half);
}

function isEscapeSequence(text: string, start: number): boolean {
  if (start >= text.length || text.charCodeAt(start) !== 0x1b) return false;
  if (start + 1 >= text.length || text.charAt(start + 1) !== '[') return false;
  let i = start + 2;
  while (i < text.length) {
    const ch = text.charAt(i);
    if ((ch >= '0' && ch <= '9') || ch === ';') {
      i++;
    } else {
      break;
    }
  }
  if (i < text.length) {
    const ch = text.charAt(i);
    if (ch >= 'A' && ch <= 'z') i++;
  }
  return i > start + 2;
}

export function stripAnsi(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    if (isEscapeSequence(text, i)) {
      while (i < text.length && !((text.charAt(i) >= 'A' && text.charAt(i) <= 'z'))) i++;
      i++;
    } else {
      result += text.charAt(i);
      i++;
    }
  }
  return result;
}
