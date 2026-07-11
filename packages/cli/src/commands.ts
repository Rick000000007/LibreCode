import type { AgentConfig } from 'librecode-types';

export type BuiltinCommand =
  | { type: 'help' }
  | { type: 'exit' }
  | { type: 'clear' }
  | { type: 'cost' }
  | { type: 'history' }
  | { type: 'permissions'; sub: string; args: string[] }
  | { type: 'model'; model: string }
  | { type: 'provider'; provider: string; args?: string[] }
  | { type: 'compact' }
  | { type: 'tokens' }
  | { type: 'status' }
  | { type: 'setup' }
  | { type: 'doctor' }
  | { type: 'workspace' }
  | { type: 'session' }
  | { type: 'git'; args: string }
  | { type: 'config'; args: string[] }
  | { type: 'tools' }
  | { type: 'logs' }
  | { type: 'unknown'; command: string };

const COMMAND_HELP: Record<string, { description: string; usage: string; examples: string[] }> = {
  help: {
    description: 'Show this help message',
    usage: '/help [command]',
    examples: ['/help', '/help doctor'],
  },
  exit: {
    description: 'Exit librecode',
    usage: '/exit',
    examples: ['/exit', '/quit'],
  },
  clear: {
    description: 'Clear conversation history (keeps system prompt)',
    usage: '/clear',
    examples: ['/clear'],
  },
  cost: {
    description: 'Show token usage for this session',
    usage: '/cost',
    examples: ['/cost'],
  },
  tokens: {
    description: 'Show context window usage',
    usage: '/tokens',
    examples: ['/tokens'],
  },
  status: {
    description: 'Show current session status',
    usage: '/status',
    examples: ['/status'],
  },
  setup: {
    description: 'Run the setup wizard',
    usage: '/setup',
    examples: ['/setup'],
  },
  doctor: {
    description: 'Run diagnostics and health checks',
    usage: '/doctor',
    examples: ['/doctor'],
  },
  provider: {
    description: 'Manage AI providers',
    usage: '/provider [list|current|switch|login|logout|test|models]',
    examples: ['/provider list', '/provider switch openai', '/provider test gemini'],
  },
  model: {
    description: 'Switch model (managed by provider system)',
    usage: '/model <name>',
    examples: ['/model gpt-4o'],
  },
  permissions: {
    description: 'Manage tool permissions',
    usage: '/permissions [list|allow|deny|reset] [tool]',
    examples: ['/permissions list', '/permissions allow write_file', '/permissions deny run_command'],
  },
  compact: {
    description: 'Manually compact context window',
    usage: '/compact',
    examples: ['/compact'],
  },
  workspace: {
    description: 'Show workspace information',
    usage: '/workspace',
    examples: ['/workspace'],
  },
  session: {
    description: 'Show session information',
    usage: '/session',
    examples: ['/session'],
  },
  git: {
    description: 'Git operations',
    usage: '/git <command>',
    examples: ['/git status', '/git diff', '/git log --oneline -5'],
  },
  config: {
    description: 'View or edit configuration',
    usage: '/config [path|show]',
    examples: ['/config show', '/config path'],
  },
  tools: {
    description: 'List available tools',
    usage: '/tools',
    examples: ['/tools'],
  },
  logs: {
    description: 'Show log file location',
    usage: '/logs',
    examples: ['/logs'],
  },
};

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
    case 'q':
      return { type: 'exit' };
    case 'clear':
      return { type: 'clear' };
    case 'cost':
      return { type: 'cost' };
    case 'history':
      return { type: 'history' };
    case 'status':
      return { type: 'status' };
    case 'setup':
      return { type: 'setup' };
    case 'doctor':
      return { type: 'doctor' };
    case 'workspace':
      return { type: 'workspace' };
    case 'session':
      return { type: 'session' };
    case 'logs':
      return { type: 'logs' };
    case 'tools':
      return { type: 'tools' };
    case 'git':
      return { type: 'git', args: parts.slice(1).join(' ') };
    case 'config':
      return { type: 'config', args: parts.slice(1) };
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
      return {
        type: 'provider',
        provider: parts[1] ?? '',
        args: parts.slice(2),
      };
    case 'compact':
      return { type: 'compact' };
    case 'tokens':
    case 'token':
    case 't':
      return { type: 'tokens' };
    default:
      return { type: 'unknown', command: trimmed };
  }
}

export function printBuiltinHelp(config: AgentConfig, command?: string): string {
  if (command) {
    const cmd = COMMAND_HELP[command];
    if (!cmd) return `No help available for \`${command}\`.\n`;
    return [
      `\x1B[1m/${command}\x1B[22m`,
      `  ${cmd.description}`,
      `  \x1B[90mUsage:\x1B[39m ${cmd.usage}`,
      ...(cmd.examples.length > 0
        ? [`\x1B[90mExamples:\x1B[39m`, ...cmd.examples.map((e) => `    \x1B[33m${e}\x1B[39m`)]
        : []),
      '',
    ].join('\n');
  }

  const lines: string[] = [];
  lines.push('\x1B[1mCommands:\x1B[22m');
  lines.push('');

  for (const [name, info] of Object.entries(COMMAND_HELP)) {
    lines.push(`  \x1B[33m/${name.padEnd(15)}\x1B[39m ${info.description}`);
  }

  lines.push('');
  lines.push(`  \x1B[90mType /help <command> for details on a specific command.\x1B[39m`);
  lines.push(`  \x1B[90mContext: ${(config.maxContextTokens / 1000).toFixed(0)}K max, compact at ${Math.round(config.compactThreshold * 100)}%\x1B[39m`);
  lines.push('');

  return lines.join('\n');
}

export function getPromptIndicator(
  config: AgentConfig,
  providerId?: string,
  modelName?: string,
): string {
  const name = providerId ?? config.provider;
  const model = modelName ?? config.model;
  return `\x1B[36mlibrecode\x1B[39m \x1B[90m${name}:${model}\x1B[39m > `;
}
