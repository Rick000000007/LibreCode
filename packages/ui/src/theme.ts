import { getTerminalCapabilities, type TerminalCapabilities } from './terminal.js';

export interface Theme {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  muted: string;
  dim: string;
  border: string;
  selection: string;
  bg: string;
  fg: string;
  reset: string;
  bold: string;
  italic: string;
  underline: string;
  code: string;
  link: string;
  git: string;
  provider: string;
  model: string;
  bar: string;
  modified: string;
}

function buildBaseTheme(cap: TerminalCapabilities): Theme {
  if (cap.colorDepth >= 256) {
    return {
      name: '256-color',
      primary: '\x1B[38;5;117m',
      secondary: '\x1B[38;5;213m',
      accent: '\x1B[38;5;190m',
      success: '\x1B[38;5;118m',
      warning: '\x1B[38;5;214m',
      error: '\x1B[38;5;196m',
      info: '\x1B[38;5;39m',
      muted: '\x1B[38;5;245m',
      dim: '\x1B[38;5;240m',
      border: '\x1B[38;5;236m',
      selection: '\x1B[48;5;237m',
      bg: '\x1B[48;5;235m',
      fg: '\x1B[38;5;188m',
      reset: '\x1B[39m\x1B[22m\x1B[23m\x1B[24m\x1B[27m\x1B[49m',
      bold: '\x1B[1m',
      italic: '\x1B[3m',
      underline: '\x1B[4m',
      code: '\x1B[38;5;186m',
      link: '\x1B[38;5;39m\x1B[4m',
      git: '\x1B[38;5;117m',
      provider: '\x1B[38;5;213m',
      model: '\x1B[38;5;156m',
      bar: '\x1B[38;5;117m',
      modified: '\x1B[38;5;214m',
    };
  }

  return {
    name: '16-color',
    primary: '\x1B[36m',
    secondary: '\x1B[35m',
    accent: '\x1B[33m',
    success: '\x1B[32m',
    warning: '\x1B[33m',
    error: '\x1B[31m',
    info: '\x1B[36m',
    muted: '\x1B[90m',
    dim: '\x1B[90m',
    border: '\x1B[90m',
    selection: '\x1B[7m',
    bg: '',
    fg: '',
    reset: '\x1B[39m\x1B[22m\x1B[23m\x1B[24m\x1B[27m',
    bold: '\x1B[1m',
    italic: '\x1B[3m',
    underline: '\x1B[4m',
    code: '\x1B[33m',
    link: '\x1B[36m\x1B[4m',
    git: '\x1B[36m',
    provider: '\x1B[35m',
    model: '\x1B[32m',
    bar: '\x1B[36m',
    modified: '\x1B[33m',
  };
}

let currentTheme: Theme | null = null;

export function getTheme(): Theme {
  if (!currentTheme) {
    const cap = getTerminalCapabilities();
    currentTheme = buildBaseTheme(cap);
  }
  return currentTheme;
}

export function resetTheme(): void {
  currentTheme = null;
}
