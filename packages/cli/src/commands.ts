import type { AgentConfig } from '@librecode/types';

export type BuiltinCommand =
  | { type: 'help' }
  | { type: 'exit' }
  | { type: 'clear' }
  | { type: 'cost' }
  | { type: 'history'; cmd: string }
  | { type: 'permissions'; sub: string; args: string[] }
  | { type: 'model'; model: string }
  | { type: 'provider'; provider: string }
  | { type: 'compact' }
  | { type: 'tokens' }
  | { type: 'unknown'; command: string };

export function parseBuiltin(input: string): BuiltinCommand | null {
  const trimmed = input.trim();

  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase() ?? '';

  switch (cmd) {
    case 'help':
      return { type: 'help' };
    case 'exit':
    case 'quit':
      return { type: 'exit' };
    case 'clear':
      return { type: 'clear' };
    case 'cost':
      return { type: 'cost' };
    case 'history':
      return { type: 'history', cmd: parts.slice(1).join(' ') };
    case 'permissions':
    case 'perms':
      return {
        type: 'permissions',
        sub: parts[1] ?? 'list',
        args: parts.slice(2),
      };
    case 'model':
      return { type: 'model', model: parts.slice(1).join(' ') };
    case 'provider':
      return { type: 'provider', provider: parts[1] ?? '' };
    case 'compact':
      return { type: 'compact' };
    case 'tokens':
    case 'token':
      return { type: 'tokens' };
    case 't':
      return { type: 'tokens' };
    default:
      return { type: 'unknown', command: trimmed };
  }
}

export function printBuiltinHelp(config: AgentConfig): string {
  return [
    '\x1B[1mAvailable commands:\x1B[22m',
    '  \x1B[33m/help\x1B[39m        Show this help message',
    '  \x1B[33m/exit\x1B[39m        Exit rcode',
    '  \x1B[33m/clear\x1B[39m       Clear conversation history (keeps system prompt)',
    '  \x1B[33m/cost\x1B[39m        Show token usage',
    '  \x1B[33m/tokens\x1B[39m      Show context usage',
    '  \x1B[33m/model <name>\x1B[39m  Switch model (e.g. /model gpt-4o)',
    '  \x1B[33m/permissions list\x1B[39m  Show tool permissions',
    '  \x1B[33m/permissions allow <tool>\x1B[39m  Allow a tool',
    '  \x1B[33m/permissions deny <tool>\x1B[39m   Deny a tool',
    '  \x1B[33m/permissions reset <tool>\x1B[39m  Reset a tool\'s permission',
    '  \x1B[33m/compact\x1B[39m     Manually compact context',
    '',
    `  \x1B[90mProvider:\x1B[39m ${config.provider}`,
    `  \x1B[90mModel:\x1B[39m    ${config.model}`,
    `  \x1B[90mContext:\x1B[39m  ${(config.maxContextTokens / 1000).toFixed(0)}K (compact at ${Math.round(config.compactThreshold * 100)}%)`,
    '',
  ].join('\n');
}

export function getPromptIndicator(config: AgentConfig): string {
  return `\x1B[36mlibrecode\x1B[39m \x1B[90m${config.model}\x1B[39m > `;
}
