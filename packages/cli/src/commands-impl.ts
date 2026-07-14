import { globalCommandRegistry, type Command, type CommandContext } from './command-framework.js';
import { Doctor, ConfigurationManager } from 'librecode-providers';
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
    if (!ctx.tuiApp) return;

    if (ctx.args.length > 0) {
      const topic = ctx.args[0]!.toLowerCase();
      let found = false;
      for (const cmd of globalCommandRegistry.getAllCommands()) {
        if (cmd.metadata.name === topic || cmd.metadata.aliases?.includes(topic)) {
          ctx.tuiApp!.addToConversation(
            `\x1B[36m/${cmd.metadata.name}\x1B[39m - ${cmd.metadata.description}\n` +
            `\x1B[90mUsage: \x1B[39m${cmd.metadata.usage}\n` +
            `\x1B[90mExamples:\n  \x1B[39m${cmd.metadata.examples.join('\n  ')}`,
            'system'
          );
          found = true;
          break;
        }
      }
      if (!found) {
        ctx.tuiApp!.addToConversation(`\x1B[31mUnknown command: /${topic}\x1B[39m\n\x1B[90mRun /help to see a list of available commands.\x1B[39m`, 'system');
      }
      return;
    }

    const commands = globalCommandRegistry.getAllCommands();
    const lines = ['\x1B[1mAvailable Commands:\x1B[22m', ''];
    for (const cmd of commands) {
      const name = cmd.metadata.name;
      const desc = cmd.metadata.description;
      const aliases = cmd.metadata.aliases?.length ? ` (${cmd.metadata.aliases.join(', ')})` : '';
      lines.push(`  \x1B[33m/${name.padEnd(15)}\x1B[39m ${desc}${aliases ? `\x1B[90m${aliases}\x1B[39m` : ''}`);
    }
    lines.push('', '\x1B[90m  Type /help <command> for details on a specific command.\x1B[39m');
    ctx.tuiApp.addToConversation(lines.join('\n'), 'system');
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
    const start = Date.now();
    const report = await doctor.run((msg: string) => {
      if (ctx.tuiApp) {
        ctx.tuiApp.addToConversation(`\x1B[90m${msg}\x1B[39m`, 'system');
        ctx.tuiApp.render();
      } else {
        process.stdout.write(`\x1B[90m${msg}\x1B[39m\n`);
      }
    });
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    if (ctx.tuiApp) {
      const lines = report.checks.map((c) => {
        const icon = c.status === 'passed' ? '\u2714' : c.status === 'warning' ? '\u26A0' : '\u2718';
        const color = c.status === 'passed' ? '\x1B[32m' : c.status === 'warning' ? '\x1B[33m' : '\x1B[31m';
        return `${color}${icon}\x1B[39m ${c.name}: ${c.message}`;
      });
      lines.push(`\x1B[90mCompleted in ${duration} seconds.\x1B[39m`);
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
  async execute(ctx: CommandContext) {
    if (!ctx.tuiApp || !ctx.providerManager) return;
    
    const registry = ctx.providerManager.getRegistry(); 
    const config = ctx.providerManager.getConfig();
    if (!config) return;

    if (ctx.args.length > 0) {
      const target = ctx.args[0]!.toLowerCase();
      
      if (target === 'free' || (target === 'switch' && ctx.args[1] === 'free')) {
        config.defaultProvider = 'free';
        ctx.providerManager.saveConfig(config);
        ctx.tuiApp!.addToConversation(`\x1B[90mChanged default provider to \x1B[33mfree\x1B[39m. Restart required to fully apply.\x1B[39m`, 'system');
        return;
      }

      const id = target === 'switch' ? ctx.args[1]?.toLowerCase() : target;
      if (id && registry.exists(id)) {
        config.defaultProvider = id;
        ctx.providerManager.saveConfig(config);
        ctx.tuiApp!.addToConversation(`\x1B[90mChanged default provider to \x1B[33m${id}\x1B[39m. Restart required to fully apply.\x1B[39m`, 'system');
        return;
      } else if (id) {
        ctx.tuiApp!.addToConversation(`\x1B[31mCould not find provider '${id}'.\x1B[39m\n\x1B[90mRun /setup to configure a new provider, or /provider to list available providers.\x1B[39m`, 'system');
        return;
      }
    }

    const items: import('librecode-ui').PaletteItem[] = [];
    const allProviders = registry.all();

    for (const meta of allProviders) {
      const entry = config.providers[meta.id];
      const isConfigured = entry?.enabled ?? false;
      const isSelected = config.defaultProvider === meta.id;
      
      const caps = registry.deriveCapabilities(meta.id);
      let authType = meta.requiresApiKey ? 'API Key' : 'Local';
      if (caps.browserLogin) authType = 'Browser Login';
      if (caps.deviceFlow) authType = 'Device Flow';
      if (caps.localServer) authType = 'Local';
      if (meta.id === 'free') authType = 'None';
                     
      const statusStr = isConfigured ? '\x1B[32mConfigured\x1B[39m' : '\x1B[90mNot Configured\x1B[39m';
      const health = ctx.providerManager.getProviderHealthStatus(meta.id) || 'unknown';
      const selectionStr = isSelected ? ' (Current)' : '';
      
      const modelsInfo = caps.modelDiscovery ? 'Auto-discovery' : meta.defaultModel;
      const description = `Status: ${statusStr} | Auth: ${authType} | Health: ${health} | Models: ${modelsInfo}`;
      
      items.push({
        id: meta.id,
        category: isConfigured ? 'Configured Providers' : 'Available Providers',
        label: `${meta.name}${selectionStr}`,
        description,
        action: async () => {
          if (!isConfigured && meta.id !== 'free') {
            ctx.tuiApp!.suspend();
            const { SetupWizard, ProviderRegistry, ConfigurationManager } = await import('librecode-providers');
            const wizard = new SetupWizard(new ProviderRegistry(), new ConfigurationManager());
            await wizard.configureProviderInteractive(meta.id);
            await ctx.providerManager!.initialize();
            const newActive = ctx.providerManager!.getActiveProvider();
            if (newActive) {
               ctx.tuiApp!.setProviderInfo(newActive.id, newActive.model);
               ctx.agent?.setProvider(ctx.providerManager!.getProvider(), newActive.id, newActive.model);
            }
            ctx.tuiApp!.resume();
          } else {
            const config = ctx.providerManager!.getConfig();
            config.defaultProvider = meta.id;
            ctx.providerManager!.saveConfig(config);
            await ctx.providerManager!.initialize();
            ctx.tuiApp!.addToConversation(`\x1B[90mSwitched default provider to \x1B[33m${meta.name}\x1B[39m.\x1B[39m`, 'system');
            const newActive = ctx.providerManager!.getActiveProvider();
            if (newActive) {
               ctx.tuiApp!.setProviderInfo(newActive.id, newActive.model);
               ctx.agent?.setProvider(ctx.providerManager!.getProvider(), newActive.id, newActive.model);
            }
          }
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
    description: 'Switch or list models',
    usage: '/model <name>',
    examples: ['/model gpt-4o', '/model', '/models'],
    aliases: ['models'],
  },
  async execute(ctx: CommandContext) {
    if (!ctx.tuiApp || !ctx.providerManager) return;

    const activeInfo = ctx.providerManager.getActiveProvider();
    if (!activeInfo) {
      ctx.tuiApp.addToConversation('\x1B[90mNo active provider configured. Use /setup or /provider.\x1B[39m', 'system');
      return;
    }

    const modelArg = ctx.args.join(' ');
    
    if (modelArg) {
       const provider = ctx.providerManager.getProvider();
       provider.setModel(modelArg);
        if (activeInfo.id !== 'free') {
          const config = ctx.providerManager.getConfig();
          if (config.providers[activeInfo.id]) {
             config.providers[activeInfo.id]!.defaultModel = modelArg;
             ctx.providerManager.saveConfig(config);
          }
       }
       ctx.tuiApp!.addToConversation(`\x1B[90mSwitched model to \x1B[33m${modelArg}\x1B[39m\x1B[39m`, 'system');
       ctx.tuiApp!.setProviderInfo(activeInfo.id, modelArg);
       ctx.agent?.setProvider(ctx.providerManager!.getProvider(), activeInfo.id, modelArg);
       return;
    }

    const provider = ctx.providerManager.getProvider();
    
    ctx.tuiApp.addToConversation('\x1B[90mDiscovering available models...\x1B[39m', 'system');
    ctx.tuiApp.render();
    try {
      const models = await provider.listModels();
      if (models.length === 0) {
        ctx.tuiApp.addToConversation('\x1B[33mNo models discovered. Provider may not support discovery or needs to be configured.\x1B[39m', 'system');
        return;
      }
      
      const items = models.map(m => ({
        id: m.id,
        category: 'Available Models',
        label: m.name || m.id,
        description: `Context: ${m.contextWindow.toLocaleString()}`,
        action: () => {
          provider.setModel(m.id);
          if (activeInfo.id !== 'free') {
             const config = ctx.providerManager!.getConfig();
             if (config.providers[activeInfo.id]) {
                config.providers[activeInfo.id]!.defaultModel = m.id;
                ctx.providerManager!.saveConfig(config);
             }
          }
          ctx.tuiApp!.addToConversation(`\x1B[90mSwitched to model \x1B[33m${m.name || m.id}\x1B[39m.\x1B[39m`, 'system');
          ctx.tuiApp!.setProviderInfo(activeInfo.id, m.name || m.id);
          ctx.agent?.setProvider(ctx.providerManager!.getProvider(), activeInfo.id, m.id);
        }
      }));
      ctx.tuiApp.openCommandPalette(items);
    } catch (err) {
       ctx.tuiApp.addToConversation('\x1B[31mFailed to fetch models: ' + String(err) + '\x1B[39m\n\x1B[90mEnsure your API key is valid and your internet connection is active.\x1B[39m', 'system');
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

// 15. config
const configCommand: Command = {
  metadata: {
    name: 'config',
    description: 'View configuration file location',
    usage: '/config [path|show]',
    examples: ['/config', '/config path'],
  },
  execute(ctx: CommandContext) {
    if (ctx.tuiApp) {
      const configMgr = new ConfigurationManager();
      const configPath = configMgr.configFilePath();
      const isConfigured = configMgr.isConfigured();
      ctx.tuiApp.addToConversation(
        `\x1B[90mConfig file: ${configPath}\x1B[39m\n` +
        `\x1B[90mStatus: ${isConfigured ? '\x1B[32mExists\x1B[39m' : '\x1B[33mNot created yet\x1B[39m'}\x1B[39m`,
        'system',
      );
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
      const [used, max] = ctx.agent.contextUsage();
      const turns = ctx.agent.tokenUsage().totalTokens;
      ctx.tuiApp.addToConversation(
        `\x1B[90mConversation History\x1B[39m\n` +
        `\x1B[90m  Context: ${used.toLocaleString()} / ${max.toLocaleString()} tokens\x1B[39m\n` +
        `\x1B[90m  Total tokens used: ${turns.toLocaleString()}\x1B[39m`,
        'system',
      );
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
  async execute(ctx: CommandContext) {
    if (ctx.tuiApp && ctx.providerManager) {
      ctx.tuiApp.suspend();
      
      try {
        const { SetupWizard, ProviderRegistry, ConfigurationManager } = await import('librecode-providers');
        const wizard = new SetupWizard(new ProviderRegistry(), new ConfigurationManager());
        await wizard.run();
        
        // Re-initialize to apply new settings
        await ctx.providerManager.initialize();
      } finally {
        ctx.tuiApp.resume();
      }
      
      const active = ctx.providerManager.getActiveProvider();
      if (active) {
        ctx.tuiApp.addToConversation(`\x1B[32mSuccessfully configured and switched to ${active.id}.\x1B[39m`, 'system');
      }
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
globalCommandRegistry.register(compactCommand);
globalCommandRegistry.register(workspaceCommand);
globalCommandRegistry.register(sessionCommand);
globalCommandRegistry.register(configCommand);
globalCommandRegistry.register(logsCommand);
globalCommandRegistry.register(historyCommand);
globalCommandRegistry.register(setupCommand);

