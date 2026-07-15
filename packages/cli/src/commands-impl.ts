import { globalCommandRegistry, type Command, type CommandContext } from './command-framework.js';
import { Doctor, ConfigurationManager } from 'librecode-providers';
import { getLogger, recordRecentCommand } from 'librecode-ui';
import { ExternalEditor, ModalEditor, MacroEngine, WorkspaceTimeline, WorkspaceDashboard, LSPManager } from 'librecode-core';

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

// --- Phase 38: External Editor Commands ---
const editCommand: Command = {
  metadata: {
    name: 'edit',
    description: 'Open external editor to compose content',
    usage: '/edit [file]',
    examples: ['/edit', '/edit notes.md'],
    aliases: ['compose'],
  },
  async execute(ctx: CommandContext) {
    try {
      const editor = new ExternalEditor();
      const fileArg = ctx.args[0];
      let result: string | null;
      if (fileArg) {
        result = await editor.editFile(fileArg);
      } else {
        result = await editor.compose();
      }
      if (result === null) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation('\x1B[33mEditor closed without saving.\x1B[39m', 'system');
      } else if (result.trim()) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[32mEditor content captured (${result.length} chars).\x1B[39m`, 'system');
        ctx.agent.addUserMessage(result);
      }
    } catch (err) {
      if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[31mEditor error: ${err}\x1B[39m`, 'system');
    }
  },
};

const editSelectionCommand: Command = {
  metadata: {
    name: 'edit-selection',
    description: 'Edit selected text in external editor',
    usage: '/edit-selection <text>',
    examples: ['/edit-selection "some text to edit"'],
    aliases: ['edit-sel'],
  },
  async execute(ctx: CommandContext) {
    try {
      const editor = new ExternalEditor();
      const text = ctx.args.join(' ') || ' ';
      const result = await editor.editSelection(text);
      if (result && result.trim()) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[32mEdited: ${result.slice(0, 100)}...\x1B[39m`, 'system');
      }
    } catch (err) {
      if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[31mError: ${err}\x1B[39m`, 'system');
    }
  },
};

const editPromptCommand: Command = {
  metadata: {
    name: 'edit-prompt',
    description: 'Edit your prompt in an external editor before sending',
    usage: '/edit-prompt',
    examples: ['/edit-prompt'],
    aliases: ['ep'],
  },
  async execute(ctx: CommandContext) {
    try {
      const editor = new ExternalEditor();
      const result = await editor.editPrompt('Write your prompt here...');
      if (result && result.trim() && result !== 'Write your prompt here...') {
        if (ctx.tuiApp) {
          ctx.tuiApp.addToConversation(`\x1B[36m> \x1B[39m${result}`, 'user');
          ctx.agent.addUserMessage(result);
        }
      }
    } catch (err) {
      if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[31mError: ${err}\x1B[39m`, 'system');
    }
  },
};

// --- Phase 40: Macro Commands ---
let macroEngineInstance: MacroEngine | null = null;
function getMacroEngine(): MacroEngine {
  if (!macroEngineInstance) macroEngineInstance = new MacroEngine();
  return macroEngineInstance;
}

const macroCommand: Command = {
  metadata: {
    name: 'macro',
    description: 'List, run, edit, export, or import macros',
    usage: '/macro [run|edit|export|import|list] [name]',
    examples: ['/macro list', '/macro run review-pr --branch main --reviewer alice', '/macro export my-macro'],
    aliases: ['macros'],
  },
  async execute(ctx: CommandContext) {
    const engine = getMacroEngine();
    const sub = ctx.args[0]?.toLowerCase();

    if (!sub || sub === 'list') {
      const macros = engine.list();
      if (macros.length === 0) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation('\x1B[90mNo macros defined.\x1B[39m', 'system');
      } else {
        const lines = ['\x1B[1mDefined Macros:\x1B[22m', ''];
        for (const m of macros) {
          lines.push(`  \x1B[33m${m.name}\x1B[39m${m.description ? ` - ${m.description}` : ''}`);
        }
        if (ctx.tuiApp) ctx.tuiApp.addToConversation(lines.join('\n'), 'system');
      }
      return;
    }

    if (sub === 'run') {
      const name = ctx.args[1];
      if (!name) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation('\x1B[31mUsage: /macro run <name> [args]\x1B[39m', 'system');
        return;
      }
      const macroArgs: Record<string, unknown> = {};
      for (let i = 2; i < ctx.args.length; i++) {
        const pair = ctx.args[i]!.split('=');
        if (pair.length === 2) macroArgs[pair[0]!.replace(/^--/, '')] = pair[1]!;
      }
      try {
        const result = await engine.execute(name, macroArgs);
        if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[32mMacro '${name}' executed.\x1B[39m\n${result.slice(0, 500)}`, 'system');
      } catch (err) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[31mMacro error: ${err}\x1B[39m`, 'system');
      }
      return;
    }

    if (sub === 'export') {
      const name = ctx.args[1];
      if (!name) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation('\x1B[31mUsage: /macro export <name>\x1B[39m', 'system');
        return;
      }
      const macro = engine.get(name);
      if (!macro) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[31mMacro '${name}' not found.\x1B[39m`, 'system');
        return;
      }
      const json = engine.exportToJson(macro);
      if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[90m${json}\x1B[39m`, 'system');
      return;
    }

    if (sub === 'import') {
      const json = ctx.args.slice(1).join(' ');
      if (!json) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation('\x1B[31mUsage: /macro import <json>\x1B[39m', 'system');
        return;
      }
      try {
        engine.importFromJson(json);
        if (ctx.tuiApp) ctx.tuiApp.addToConversation('\x1B[32mMacro imported.\x1B[39m', 'system');
      } catch (err) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[31mImport error: ${err}\x1B[39m`, 'system');
      }
      return;
    }
  },
};

// --- Phase 41: Timeline Command ---
let timelineInstance: WorkspaceTimeline | null = null;
function getTimeline(): WorkspaceTimeline {
  if (!timelineInstance) timelineInstance = new WorkspaceTimeline();
  return timelineInstance;
}

const timelineCommand: Command = {
  metadata: {
    name: 'timeline',
    description: 'Browse workspace timeline history',
    usage: '/timeline [list|diff|search|stats|clear]',
    examples: ['/timeline list', '/timeline diff <id>', '/timeline search query'],
    aliases: ['tl'],
  },
  execute(ctx: CommandContext) {
    const tl = getTimeline();
    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'stats' || !sub) {
      const s = tl.stats();
      if (ctx.tuiApp) {
        ctx.tuiApp.addToConversation(
          `\x1B[1mTimeline Stats\x1B[22m\n` +
          `  Total events: ${s.total}\n` +
          `  By type: ${Object.entries(s.byType).map(([k, v]) => `${k}: ${v}`).join(', ')}\n` +
          `  Range: ${s.timeRange.oldest?.toLocaleString() ?? 'N/A'} - ${s.timeRange.newest?.toLocaleString() ?? 'N/A'}`,
          'system'
        );
      }
      return;
    }

    if (sub === 'list') {
      const events = tl.getEvents({ limit: parseInt(ctx.args[1] ?? '20', 10) });
      const lines = ['\x1B[1mRecent Events:\x1B[22m', ''];
      for (const e of events) {
        const icon = e.type === 'error' ? '\x1B[31m✘\x1B[39m' : '\x1B[32m●\x1B[39m';
        lines.push(`  ${icon} \x1B[90m${e.timestamp.toLocaleTimeString()}\x1B[39m \x1B[36m${e.type}\x1B[39m ${e.description.slice(0, 60)}`);
      }
      if (ctx.tuiApp) ctx.tuiApp.addToConversation(lines.join('\n'), 'system');
      return;
    }

    if (sub === 'diff') {
      const id = ctx.args[1];
      if (!id) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation('\x1B[31mUsage: /timeline diff <event-id>\x1B[39m', 'system');
        return;
      }
      const diff = tl.getDiff(id);
      if (!diff) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation('\x1B[31mEvent not found or no diff available.\x1B[39m', 'system');
        return;
      }
      if (ctx.tuiApp) {
        const text = [
          `Diff for: ${diff.event.description}`,
          `Type: ${diff.event.type}`,
          `Time: ${diff.event.timestamp.toLocaleString()}`,
          diff.diff ? `\n${diff.diff.slice(0, 1000)}` : '\n\x1B[90mNo content diff available\x1B[39m',
        ].join('\n');
        ctx.tuiApp.addToConversation(text, 'system');
      }
      return;
    }

    if (sub === 'search') {
      const query = ctx.args.slice(1).join(' ');
      if (!query) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation('\x1B[31mUsage: /timeline search <query>\x1B[39m', 'system');
        return;
      }
      const results = tl.search(query);
      if (results.length === 0) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation('\x1B[90mNo matching events.\x1B[39m', 'system');
        return;
      }
      const lines = [`\x1B[1mSearch results for "${query}":\x1B[22m`, ''];
      for (const e of results.slice(0, 20)) {
        lines.push(`  \x1B[90m${e.timestamp.toLocaleTimeString()}\x1B[39m \x1B[36m${e.type}\x1B[39m ${e.description.slice(0, 60)}`);
      }
      if (ctx.tuiApp) ctx.tuiApp.addToConversation(lines.join('\n'), 'system');
      return;
    }
  },
};

// --- Phase 42: Dashboard Command ---
const dashboardCommand: Command = {
  metadata: {
    name: 'dashboard',
    description: 'Show workspace dashboard with system status',
    usage: '/dashboard',
    examples: ['/dashboard'],
    aliases: ['dash', 'status-info'],
  },
  execute(ctx: CommandContext) {
    const dashboard = new WorkspaceDashboard();
    dashboard.update({
      provider: ctx.providerManager?.getActiveProvider()?.id ?? 'unknown',
      model: ctx.providerManager?.getActiveProvider()?.model ?? 'unknown',
      sessionDuration: ((ctx as any).sessionStart ? Date.now() - (ctx as any).sessionStart : Date.now()),
      workspace: {
        root: ctx.workingDir ?? process.cwd(),
        branch: null,
        status: 'active',
        fileCount: 0,
      },
    });
    const rendered = dashboard.render();
    if (ctx.tuiApp) {
      ctx.tuiApp.addMarkdown(rendered);
    } else {
      process.stdout.write(rendered + '\n');
    }
  },
};

// --- Phase 37: LSP Command ---
const lspCommand: Command = {
  metadata: {
    name: 'lsp',
    description: 'Manage Language Server Protocol servers',
    usage: '/lsp [start|stop|status|diagnostics] [language]',
    examples: ['/lsp status', '/lsp start typescript', '/lsp diagnostics'],
    aliases: ['language-server'],
  },
  async execute(ctx: CommandContext) {
    const sub = ctx.args[0]?.toLowerCase();
    const workingDir = ctx.workingDir ?? process.cwd();

    if (sub === 'status' || !sub) {
      const available = LSPManager.getAvailableServers();
      if (ctx.tuiApp) {
        ctx.tuiApp.addToConversation(
          `\x1B[1mLSP Servers\x1B[22m\n` +
          `  Available: ${available.length > 0 ? available.join(', ') : '\x1B[90mNone detected\x1B[39m'}`,
          'system'
        );
      }
      return;
    }

    if (sub === 'start') {
      const lang = ctx.args[1]?.toLowerCase();
      if (!lang) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation('\x1B[31mUsage: /lsp start <language>\x1B[39m', 'system');
        return;
      }
      try {
        const manager = new LSPManager({ workspaceRoot: workingDir, servers: [lang] });
        await manager.start(lang);
        if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[32mLSP '${lang}' started.\x1B[39m`, 'system');
      } catch (err) {
        if (ctx.tuiApp) ctx.tuiApp.addToConversation(`\x1B[31mFailed to start LSP '${lang}': ${err}\x1B[39m`, 'system');
      }
      return;
    }

    if (sub === 'diagnostics') {
      if (ctx.tuiApp) {
        ctx.tuiApp.addToConversation(
          '\x1B[90mRun /lsp start <language> first, then diagnostics will appear here.\x1B[39m',
          'system'
        );
      }
      return;
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

// Phase 37-43 Commands
globalCommandRegistry.register(editCommand);
globalCommandRegistry.register(editSelectionCommand);
globalCommandRegistry.register(editPromptCommand);
globalCommandRegistry.register(macroCommand);
globalCommandRegistry.register(timelineCommand);
globalCommandRegistry.register(dashboardCommand);
globalCommandRegistry.register(lspCommand);

