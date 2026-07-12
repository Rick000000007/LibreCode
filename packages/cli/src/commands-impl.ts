import { globalCommandRegistry, type Command, type CommandContext } from './command-framework.js';
import { Doctor } from 'librecode-providers';
import { getLogger } from 'librecode-ui';

// 1. help
const helpCommand: Command = {
  metadata: {
    name: 'help',
    description: 'Show this help message',
    usage: '/help [command]',
    examples: ['/help', '/help doctor'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      ctx.tuiApp.openCommandPalette();
    }
  },
};

// 2. exit
const exitCommand: Command = {
  metadata: {
    name: 'exit',
    description: 'Exit librecode',
    usage: '/exit',
    examples: ['/exit', '/quit'],
    aliases: ['quit', 'q'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      ctx.tuiApp.addToConversation('\x1B[90mShutting down...\x1B[39m', 'system');
      setTimeout(() => {
        if (ctx.tuiApp) ctx.tuiApp.stop();
        process.exit(0);
      }, 200);
    }
  },
};

// 3. clear
const clearCommand: Command = {
  metadata: {
    name: 'clear',
    description: 'Clear conversation history (keeps system prompt)',
    usage: '/clear',
    examples: ['/clear'],
  },
  execute(ctx: CommandContext) {
    ctx.agent.clearHistory();
    if (ctx.tuiApp) {
      ctx.tuiApp.getTui().clearScreen();
      ctx.tuiApp.render();
    }
  },
};

// 4. status
const statusCommand: Command = {
  metadata: {
    name: 'status',
    description: 'Show current session status',
    usage: '/status',
    examples: ['/status'],
  },
  execute(ctx: CommandContext) {
    const [used, max] = ctx.agent.contextUsage();
    const active = ctx.providerManager?.getActiveProvider();
    const pct = max > 0 ? Math.round((used / max) * 100) : 0;
    if (ctx.tuiApp) {
      const statusText = [
        '**Session Status**',
        '',
        `- Provider: ${active?.id ?? 'unknown'}`,
        `- Model: ${active?.model ?? 'unknown'}`,
        `- Context: ${used.toLocaleString()} / ${max.toLocaleString()} (${pct}%)`,
        `- Tokens: ${ctx.agent.tokenUsage().totalTokens.toLocaleString()} total`,
      ].join('\n');
      ctx.tuiApp.addMarkdown(statusText);
    }
  },
};

// 5. tokens
const tokensCommand: Command = {
  metadata: {
    name: 'tokens',
    description: 'Show context window usage',
    usage: '/tokens',
    examples: ['/tokens'],
    aliases: ['token', 't'],
  },
  execute(ctx: CommandContext) {
    const [used, max] = ctx.agent.contextUsage();
    const pct = max > 0 ? Math.round((used / max) * 100) : 0;
    if (ctx.tuiApp) {
      ctx.tuiApp.addToConversation(
        `\x1B[90mContext: ${used.toLocaleString()} / ${max.toLocaleString()} (${pct}%)\x1B[39m`,
        'system',
      );
    }
  },
};

// 6. cost
const costCommand: Command = {
  metadata: {
    name: 'cost',
    description: 'Show token usage for this session',
    usage: '/cost',
    examples: ['/cost'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      ctx.tuiApp.addToConversation(
        `\x1B[90mTokens: \u2191${ctx.agent.tokenUsage().promptTokens.toLocaleString()} \u2193${ctx.agent.tokenUsage().completionTokens.toLocaleString()} \u03A3${ctx.agent.tokenUsage().totalTokens.toLocaleString()}\x1B[39m`,
        'system',
      );
    }
  },
};

// 7. doctor
const doctorCommand: Command = {
  metadata: {
    name: 'doctor',
    description: 'Run diagnostics and health checks',
    usage: '/doctor',
    examples: ['/doctor'],
  },
  async execute(ctx: CommandContext) {
    const doctor = new Doctor();
    const report = await doctor.run();
    if (ctx.tuiApp) {
      const lines = report.checks.map((c) => {
        const icon = c.status === 'passed' ? '\u2714' : c.status === 'warning' ? '\u26A0' : '\u2718';
        const color = c.status === 'passed' ? '\x1B[32m' : c.status === 'warning' ? '\x1B[33m' : '\x1B[31m';
        return `${color}${icon}\x1B[39m ${c.name}: ${c.message}`;
      });
      ctx.tuiApp.addToConversation(lines.join('\n'), 'system');
    }
  },
};

// 8. provider
const providerCommand: Command = {
  metadata: {
    name: 'provider',
    description: 'Manage AI providers',
    usage: '/provider [list|current|switch|login|logout|test|models]',
    examples: ['/provider list', '/provider switch openai', '/provider test gemini'],
  },
  execute(ctx: CommandContext) {
    if (!ctx.tuiApp || !ctx.providerManager) return;
    
    const registry = ctx.providerManager['registry']; 
    const config = ctx.providerManager['configManager']?.load();
    if (!config) return;

    // Fast path: if argument provided, switch immediately
    if (ctx.args.length > 0) {
      const target = ctx.args[0]!.toLowerCase();
      
      if (target === 'free' || target === 'switch' && ctx.args[1] === 'free') {
        config.defaultProvider = 'free';
        ctx.providerManager!['configManager']?.save(config);
        ctx.tuiApp!.addToConversation(`\x1B[90mChanged default provider to \x1B[33mfree\x1B[39m. Restart required to fully apply.\x1B[39m`, 'system');
        return;
      }

      const id = target === 'switch' ? ctx.args[1]?.toLowerCase() : target;
      if (id && config.providers && config.providers[id]) {
        config.defaultProvider = id;
        ctx.providerManager!['configManager']?.save(config);
        ctx.tuiApp!.addToConversation(`\x1B[90mChanged default provider to \x1B[33m${id}\x1B[39m. Restart required to fully apply.\x1B[39m`, 'system');
        return;
      } else if (id) {
        ctx.tuiApp!.addToConversation(`\x1B[31mProvider '${id}' is not configured. Configured providers: ${Object.keys(config.providers || {}).join(', ')}\x1B[39m`, 'system');
        return;
      }
    }

    const items: import('librecode-ui').PaletteItem[] = [];

    // Add free mode explicitly
    items.push({
      id: 'free',
      category: 'System',
      label: 'Free Mode (Auto)',
      description: 'Automatically route to the best free models available',
      action: async () => {
        config.defaultProvider = 'free';
        ctx.providerManager!['configManager']?.save(config);
        ctx.tuiApp!.addToConversation(`\x1B[90mChanged default provider to \x1B[33mfree\x1B[39m. Restart required to fully apply.\x1B[39m`, 'system');
      }
    });

    for (const [id, entry] of Object.entries(config.providers || {}) as [string, any][]) {
      if (!entry || !entry.enabled) continue;
      items.push({
        id,
        category: 'Configured Providers',
        label: id,
        description: `Switch to ${id}`,
        action: async () => {
          config.defaultProvider = id;
          ctx.providerManager!['configManager']?.save(config);
          ctx.tuiApp!.addToConversation(`\x1B[90mChanged default provider to \x1B[33m${id}\x1B[39m. Restart required to fully apply.\x1B[39m`, 'system');
        }
      });
    }

    if (items.length > 0) {
      ctx.tuiApp.openCommandPalette(items);
    }
  },
};

// 9. model
const modelCommand: Command = {
  metadata: {
    name: 'model',
    description: 'Switch model (managed by provider system)',
    usage: '/model <name>',
    examples: ['/model gpt-4o'],
  },
  async execute(ctx: CommandContext) {
    if (!ctx.tuiApp) return;

    const modelArg = ctx.args.join(' ');
    if (!modelArg) {
      const active = ctx.providerManager?.getActiveProvider();
      if (active?.type === 'free') {
        const fp = ctx.providerManager?.getFreeProvider();
        if (fp) {
          const models = await ctx.providerManager!.listFreeModels();
          const items = models.map((m) => ({
            id: m.id,
            category: 'Free Models',
            label: m.id,
            description: `Switch to ${m.id}`,
            action: () => {
              fp.setModel(m.id);
              const mi = fp.getModel();
              ctx.tuiApp!.addToConversation(`\x1B[90mSwitched to free model: \x1B[33m${mi.name}\x1B[39m`, 'system');
              ctx.tuiApp!.setProviderInfo('Free', mi.name);
            }
          }));
          const aliases = fp.getAliases();
          for (const [alias, m] of Object.entries(aliases)) {
            items.unshift({
              id: alias,
              category: 'Aliases',
              label: alias,
              description: `Alias for ${m || 'auto-best'}`,
              action: () => {
                fp.setModel(alias);
                const mi = fp.getModel();
                ctx.tuiApp!.addToConversation(`\x1B[90mSwitched to free model: \x1B[33m${mi.name}\x1B[39m`, 'system');
                ctx.tuiApp!.setProviderInfo('Free', mi.name);
              }
            });
          }
          ctx.tuiApp.openCommandPalette(items);
        }
      } else if (active) {
        ctx.tuiApp.addToConversation('\x1B[90mModel switching via menu is currently only supported for the free tier. Edit ~/.rcode.toml to change your premium provider model.\x1B[39m', 'system');
      } else {
        ctx.tuiApp.addToConversation('\x1B[90mUse /provider switch <name> to change provider.\x1B[39m', 'system');
      }
    } else {
      const fp = ctx.providerManager?.getFreeProvider();
      if (fp && (modelArg === 'auto' || modelArg.endsWith('-free') || modelArg === 'free')) {
        fp.setModel(modelArg);
        const mi = fp.getModel();
        ctx.tuiApp.addToConversation(`\x1B[90mSwitched to free model: \x1B[33m${mi.name}\x1B[39m`, 'system');
      } else {
        ctx.tuiApp.addToConversation('\x1B[90mUse /provider switch to change providers, or /model auto for free.\x1B[39m', 'system');
      }
    }
  },
};

// 10. permissions
const permissionsCommand: Command = {
  metadata: {
    name: 'permissions',
    description: 'Manage tool permissions',
    usage: '/permissions [list|allow|deny|reset] [tool]',
    examples: ['/permissions list', '/permissions allow write_file', '/permissions deny run_command'],
    aliases: ['perms'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      ctx.tuiApp.addToConversation('\x1B[90mUse /permissions list|allow|deny|reset <tool>\x1B[39m', 'system');
    }
  },
};

// 11. compact
const compactCommand: Command = {
  metadata: {
    name: 'compact',
    description: 'Manually compact context window',
    usage: '/compact',
    examples: ['/compact'],
  },
  execute(ctx: CommandContext) {
    ctx.agent.clearHistory();
    if (ctx.tuiApp) {
      ctx.tuiApp.addToConversation('\x1B[90mContext compacted.\x1B[39m', 'system');
    }
  },
};

// 12. workspace
const workspaceCommand: Command = {
  metadata: {
    name: 'workspace',
    description: 'Show workspace information',
    usage: '/workspace',
    examples: ['/workspace'],
  },
  execute(ctx: CommandContext) {
    const dir = ctx.workingDir ?? process.cwd();
    if (ctx.tuiApp) {
      ctx.tuiApp.addToConversation(`\x1B[90mWorkspace: ${dir}\x1B[39m`, 'system');
    }
  },
};

// 13. session
const sessionCommand: Command = {
  metadata: {
    name: 'session',
    description: 'Show session information',
    usage: '/session',
    examples: ['/session'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      const [used, max] = ctx.agent.contextUsage();
      ctx.tuiApp.addToConversation(
        `\x1B[90mContext: ${used.toLocaleString()} / ${max.toLocaleString()}\x1B[39m`,
        'system',
      );
    }
  },
};

// 14. git
const gitCommand: Command = {
  metadata: {
    name: 'git',
    description: 'Git operations',
    usage: '/git <command>',
    examples: ['/git status', '/git diff', '/git log --oneline -5'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      ctx.tuiApp.addToConversation('\x1B[90mGit operations are handled by the AI agent.\x1B[39m', 'system');
    }
  },
};

// 15. config
const configCommand: Command = {
  metadata: {
    name: 'config',
    description: 'View or edit configuration',
    usage: '/config [path|show]',
    examples: ['/config show', '/config path'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      ctx.tuiApp.addToConversation('\x1B[90mConfig is managed automatically.\x1B[39m', 'system');
    }
  },
};

// 16. tools
const toolsCommand: Command = {
  metadata: {
    name: 'tools',
    description: 'List available tools',
    usage: '/tools',
    examples: ['/tools'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      ctx.tuiApp.addToConversation('\x1B[90mAll tools are pre-configured. Use /permissions to manage.\x1B[39m', 'system');
    }
  },
};

// 17. logs
const logsCommand: Command = {
  metadata: {
    name: 'logs',
    description: 'Show log file location',
    usage: '/logs',
    examples: ['/logs'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      const logFile = getLogger().getLogFile();
      ctx.tuiApp.addToConversation(`\x1B[90mLog file: ${logFile ?? 'N/A'}\x1B[39m`, 'system');
    }
  },
};

// 18. history
const historyCommand: Command = {
  metadata: {
    name: 'history',
    description: 'Show conversation history status',
    usage: '/history',
    examples: ['/history'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      ctx.tuiApp.addToConversation('\x1B[90mHistory is managed in the agent context.\x1B[39m', 'system');
    }
  },
};

// 19. setup
const setupCommand: Command = {
  metadata: {
    name: 'setup',
    description: 'Run setup wizard',
    usage: '/setup',
    examples: ['/setup'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      ctx.tuiApp.addToConversation('\x1B[33mTo run the interactive setup wizard, exit LibreCode (/exit) and run `librecode setup` in your terminal.\x1B[39m', 'system');
    }
  },
};

// Register all commands
globalCommandRegistry.register(helpCommand);
globalCommandRegistry.register(exitCommand);
globalCommandRegistry.register(clearCommand);
globalCommandRegistry.register(statusCommand);
globalCommandRegistry.register(tokensCommand);
globalCommandRegistry.register(costCommand);
globalCommandRegistry.register(doctorCommand);
globalCommandRegistry.register(providerCommand);
globalCommandRegistry.register(modelCommand);
globalCommandRegistry.register(permissionsCommand);
globalCommandRegistry.register(compactCommand);
globalCommandRegistry.register(workspaceCommand);
globalCommandRegistry.register(sessionCommand);
globalCommandRegistry.register(gitCommand);
globalCommandRegistry.register(configCommand);
globalCommandRegistry.register(toolsCommand);
globalCommandRegistry.register(logsCommand);
globalCommandRegistry.register(historyCommand);
globalCommandRegistry.register(setupCommand);
