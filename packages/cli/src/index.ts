#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { type AgentConfig } from 'librecode-types';
import { loadConfig, type CliOptions } from 'librecode-config';
import { Agent, generateSystemPrompt, RepoMapper } from 'librecode-core';
import { TerminalRenderer, getLogger } from 'librecode-ui';
import { ToolRegistry, PermissionChecker } from 'librecode-tools';
import {
  ProviderManager,
  SetupWizard,
  ProviderRegistry,
  ConfigurationManager,
  printProviderList,
  printProviderCurrent,
  handleProviderLogin,
  handleProviderLogout,
  handleProviderTest,
  handleProviderSwitch,
  handleProviderModels,
  Doctor,
  formatDoctorReport,
} from 'librecode-providers';
import { parseBuiltin } from './commands.js';
import { TuiApp } from 'librecode-ui';

const VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'),
).version as string;

function parseArgs(argv: string[]): Partial<CliOptions> {
  const options: Partial<CliOptions> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-v' || arg === '--version') {
      process.stdout.write(`librecode v${VERSION}\n`);
      process.exit(0);
    }
    switch (arg) {
      case '-m':
      case '--model':
        options.model = argv[++i] ?? '';
        break;
      case '-p':
      case '--provider':
        options.provider = argv[++i] ?? '';
        break;
      case '-y':
      case '--yes':
        options.yes = true;
        break;
      case '-c':
      case '--config':
        options.config = argv[++i] ?? '';
        break;
      case '-d':
      case '--directory':
        options.dir = argv[++i] ?? '';
        break;
      default:
        if (!arg.startsWith('-')) {
          options.prompt = arg;
        }
        break;
    }
  }
  return options;
}

type ProviderCliCommand =
  | { type: 'list' }
  | { type: 'login'; provider?: string }
  | { type: 'logout'; provider?: string }
  | { type: 'current' }
  | { type: 'switch'; provider: string }
  | { type: 'test'; provider: string }
  | { type: 'models'; provider: string };

function parseProviderArgs(argv: string[]): ProviderCliCommand | null {
  const args = argv.slice(2);
  if (args[0] !== 'provider') return null;
  const sub = args[1];
  switch (sub) {
    case 'list':
      return { type: 'list' };
    case 'login':
      return { type: 'login', provider: args[2] };
    case 'logout':
      return { type: 'logout', provider: args[2] };
    case 'current':
      return { type: 'current' };
    case 'switch':
      return { type: 'switch', provider: args[2] ?? '' };
    case 'test':
      return { type: 'test', provider: args[2] ?? '' };
    case 'models':
      return { type: 'models', provider: args[2] ?? '' };
    default:
      return null;
  }
}

async function handleProviderCommand(
  cmd: ProviderCliCommand,
  pm: ProviderManager,
): Promise<void> {
  const registry = pm.getRegistry();
  const config = pm.getConfig();
  const configMgr = new ConfigurationManager();

  // Ensure custom providers are registered from config before any operation
  registry.restoreCustomFromConfig(config);

  switch (cmd.type) {
    case 'list':
      process.stdout.write(printProviderList(config, registry));
      break;
    case 'login':
      await handleProviderLogin(registry, configMgr);
      break;
    case 'logout':
      await handleProviderLogout(cmd.provider, registry, configMgr);
      break;
    case 'current':
      process.stdout.write(printProviderCurrent(config, registry));
      break;
    case 'switch':
      await handleProviderSwitch(cmd.provider, registry, configMgr);
      break;
    case 'test':
      await handleProviderTest(cmd.provider, registry, configMgr);
      break;
    case 'models':
      await handleProviderModels(cmd.provider, registry, configMgr);
      break;
  }
}

async function main(): Promise<void> {
  const cliOptions = parseArgs(process.argv);
  const logger = getLogger();

  logger.debug('Starting librecode', { version: VERSION, argv: process.argv.slice(2) });

  // Check for `librecode doctor`
  if (process.argv[2] === 'doctor') {
    const doctor = new Doctor();
    const report = await doctor.run();
    process.stdout.write(formatDoctorReport(report));
    process.exit(report.summary.failed > 0 ? 1 : 0);
  }

  // Check for `librecode setup`
  if (process.argv[2] === 'setup') {
    const registry = new ProviderRegistry();
    const configMgr = new ConfigurationManager();
    const wizard = new SetupWizard(registry, configMgr);
    const configured = await wizard.run();
    process.exit(configured ? 0 : 1);
  }

  // Check if running as `librecode provider <command>`
  const providerCmd = parseProviderArgs(process.argv);
  if (providerCmd) {
    const pm = new ProviderManager();
    await handleProviderCommand(providerCmd, pm);
    process.exit(0);
  }

  // Detect non-TTY mode (pipe)
  const isPipe = !process.stdout.isTTY && !process.stdin.isTTY;
  if (isPipe && process.argv[2]) {
    cliOptions.prompt = process.argv.slice(2).join(' ');
  }

  const configPath = cliOptions.config
    ? path.resolve(cliOptions.config)
    : findConfig();
  const config = loadConfig(
    configPath ? { ...cliOptions, config: configPath } : cliOptions,
  );
  const workingDir = cliOptions.dir
    ? path.resolve(cliOptions.dir)
    : process.cwd();

  const repoMapper = new RepoMapper();
  const tools = ToolRegistry.defaultRegistry();
  const permissionChecker = new PermissionChecker(cliOptions.yes ?? false);

  // Provider manager
  const providerManager = new ProviderManager();

  // First-run: auto-save default config with free provider
  if (providerManager.isFirstRun() && !cliOptions.prompt) {
    const configMgr = new ConfigurationManager();
    configMgr.save({ defaultProvider: 'free', providers: {} });
  }

  // Initialize provider
  const active = await providerManager.initialize();

  if (!active) {
    process.stdout.write(
      '\x1B[33m╭──────────────────────────────────────────────────╮\x1B[39m\n' +
      '\x1B[33m│\x1B[39m  \x1B[1mNo free model endpoints available\x1B[22m                \x1B[33m│\x1B[39m\n' +
      '\x1B[33m╰──────────────────────────────────────────────────╯\x1B[39m\n\n' +
      '\x1B[90m  To use free models, choose one of the following:\x1B[39m\n' +
      '\x1B[90m  \x1B[33m1.\x1B[39m\x1B[90m Install Ollama locally:\x1B[39m\n' +
      '\x1B[90m     Run \x1B[33mollama serve\x1B[39m\x1B[90m then restart librecode\x1B[39m\n' +
      '\x1B[90m     (No API key needed, runs entirely offline)\x1B[39m\n' +
      '\x1B[90m  \x1B[33m2.\x1B[39m\x1B[90m Set a free API key environment variable:\x1B[39m\n' +
      '\x1B[90m     \x1B[33mGEMINI_API_KEY\x1B[39m\x1B[90m  — Google Gemini free tier\x1B[39m\n' +
      '\x1B[90m     \x1B[33mGROQ_API_KEY\x1B[39m\x1B[90m   — Groq free tier (very fast)\x1B[39m\n' +
      '\x1B[90m     \x1B[33mOPENROUTER_API_KEY\x1B[39m\x1B[90m — OpenRouter free models\x1B[39m\n' +
      '\x1B[90m  \x1B[33m3.\x1B[39m\x1B[90m Configure a premium provider:\x1B[39m\n' +
      '\x1B[90m     Run \x1B[33mlibrecode setup\x1B[39m\x1B[90m to run the setup wizard\x1B[39m\n',
    );
    process.exit(1);
  }

  // Resolve model display name for free provider
  let modelDisplayName = active.model;
  if (active.type === 'free') {
    const fp = providerManager.getFreeProvider();
    if (fp) {
      modelDisplayName = fp.getModel().name;
    }
  }

  // Show startup status for free mode
  if (!isPipe && active.type === 'free') {
    process.stdout.write(`\x1B[90mUsing free model: \x1B[33m${modelDisplayName}\x1B[39m\n`);
  }

  // Build agent
  const agent = await Agent.fromProviderManager(
    providerManager,
    tools,
    config,
    workingDir,
    permissionChecker,
  );

  if (!agent) {
    process.stderr.write('\x1B[31mFailed to initialize agent.\x1B[39m\n');
    process.exit(1);
  }

  repoMapper.indexDirectory(workingDir);
  const repoMap = repoMapper.generateMap(4096);
  const prompt = generateSystemPrompt(workingDir, repoMap);
  agent.setSystemPrompt(prompt);

  // Single-shot mode
  if (cliOptions.prompt) {
    const renderer = new TerminalRenderer();
    await runSingleTurn(agent, renderer, cliOptions.prompt);
    process.exit(0);
  }

  // Non-TTY mode (pipe-only)
  if (isPipe) {
    const renderer = new TerminalRenderer();
    let input = '';
    const stdin = process.stdin;
    stdin.setEncoding('utf-8');
    for await (const chunk of stdin) {
      input += chunk;
    }
    if (input.trim()) {
      await runSingleTurn(agent, renderer, input.trim());
    }
    process.exit(0);
  }

  // Get git branch for display
  let gitBranch: string | null = null;
  try {
    const { execSync } = await import('node:child_process');
    const result = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
      cwd: workingDir,
      encoding: 'utf-8',
      timeout: 2000,
    });
    gitBranch = result.trim() || null;
  } catch {
    // not a git repo
  }

  // ─── FULL-SCREEN TUI ──────────────────────────────────────────────
  const tuiApp = new TuiApp({
    provider: active.id,
    model: active.model,
    gitBranch,
    workingDir,
    onSubmit: async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;

      const builtin = parseBuiltin(trimmed);
      if (builtin) {
        await handleBuiltinTui(builtin, agent, providerManager, config, workingDir, tuiApp);
        return;
      }

      tuiApp.getWorkflow().beginStep('thinking', 'Thinking');
      tuiApp.render();

      try {
        if (agent.supportsStreaming()) {
          let fullResponse = '';
          await agent.runTurnStreaming(trimmed, (event) => {
            switch (event.type) {
              case 'text_delta':
                fullResponse += event.delta;
                tuiApp.appendToLast(event.delta);
                break;
              case 'tool_start':
                tuiApp.addToConversation(
                  `\x1B[90m\u2500\u2500 ${event.name}(${event.argsPreview})\x1B[39m`,
                  'system',
                );
                tuiApp.getWorkflow().beginStep(event.name, event.name);
                tuiApp.getWorkflow().setStepDetail(event.name, event.argsPreview);
                break;
              case 'tool_result':
                tuiApp.getWorkflow().completeStep(event.name, event.summary);
                if (event.success) {
                  tuiApp.addToConversation(`\x1B[32m\u2714 ${event.summary}\x1B[39m`, 'system');
                } else {
                  tuiApp.addToConversation(`\x1B[31m\u2718 ${event.summary}\x1B[39m`, 'system');
                }
                break;
              case 'tool_error':
                tuiApp.getWorkflow().failStep(event.name, event.message);
                tuiApp.addToConversation(`\x1B[33m\u26A0 ${event.name}: ${event.message}\x1B[39m`, 'system');
                break;
              case 'fatal_error':
                tuiApp.addToConversation(`\x1B[31m\u2718 ${event.message}\x1B[39m`, 'system');
                break;
              case 'turn_complete':
                tuiApp.addToConversation(`\x1B[90m\u2500\u2500\u2500 Turn ${event.turnNumber} \u2500\u2500\u2500\x1B[39m`, 'system');
                break;
            }
            tuiApp.render();
          });

          if (fullResponse) {
            tuiApp.getWorkflow().completeStep('thinking', 'Response generated');
          }
        } else {
          const result = await agent.runTurn(trimmed);
          if (result) {
            tuiApp.addMarkdown(result);
            tuiApp.getWorkflow().completeStep('thinking', 'Response generated');
          }
        }

        const [used, max] = agent.contextUsage();
        const pct = max > 0 ? Math.round((used / max) * 100) : 0;
        tuiApp.setTokenPct(pct);

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        tuiApp.addToConversation(`\x1B[31mError: ${msg}\x1B[39m`, 'system');
        tuiApp.getWorkflow().failStep('thinking', msg);
      }

      tuiApp.render();
    },
    onCancel: () => {
      tuiApp.addToConversation('\x1B[90mSession ended.\x1B[39m', 'system');
      tuiApp.render();
    },
    onCommand: (cmd) => {
      tuiApp.addToConversation(`\x1B[90mCommand: ${cmd}\x1B[39m`, 'system');
    },
  });

  // Handle shutdown gracefully
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    tuiApp.stop();
    process.stdout.write('\n');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Show welcome message
  const welcomeProvider = active.type === 'free' ? 'Free' : active.id;
  tuiApp.addToConversation(
    `\x1B[36m\u250C\u2500\u2500\u2500 LibreCode v${VERSION} \u2500\u2500\u2500\u2510\x1B[39m\n` +
    `\x1B[36m\u2502\x1B[39m Type /help for commands, Ctrl+K for palette\n` +
    `\x1B[36m\u2502\x1B[39m Provider: ${welcomeProvider} | Model: ${modelDisplayName}\n` +
    `\x1B[36m\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\x1B[39m`,
    'system',
  );

  tuiApp.render();
}

function findConfig(): string | null {
  const candidates = [
    path.join(process.cwd(), 'rcode.toml'),
    path.join(process.cwd(), '.rcode.toml'),
    path.join(process.cwd(), '.rcode', 'config.toml'),
    path.join(os.homedir(), '.config', 'librecode', 'config.toml'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function handleBuiltinTui(
  cmd: ReturnType<typeof parseBuiltin>,
  agent: Agent,
  providerManager?: ProviderManager,
  _config?: AgentConfig,
  _workingDir?: string,
  tuiApp?: TuiApp,
): Promise<void> {
  if (!cmd) return;

  switch (cmd.type) {
    case 'help':
      if (tuiApp) {
        const helpText = [
          '**Commands**',
          '',
          '`/help` - Show this help',
          '`/exit` - Exit librecode',
          '`/clear` - Clear conversation',
          '`/status` - Session status',
          '`/tokens` - Token usage',
          '`/cost` - Session cost',
          '`/doctor` - Run diagnostics',
          '`/provider` - Manage providers',
          '`/model` - Switch model',
          '`/git` - Git operations',
          '`/compact` - Compact context',
          '`/workspace` - Workspace info',
          '`/config` - Configuration',
        ].join('\n');
        tuiApp.addMarkdown(helpText);
      }
      break;
    case 'exit':
      if (tuiApp) {
        tuiApp.addToConversation('\x1B[90mShutting down...\x1B[39m', 'system');
        setTimeout(() => {
          if (tuiApp) tuiApp.stop();
          process.exit(0);
        }, 200);
      }
      break;
    case 'clear':
      agent.clearHistory();
      if (tuiApp) {
        tuiApp.getTui().clearScreen();
        tuiApp.render();
      }
      break;
    case 'status': {
      const [used, max] = agent.contextUsage();
      const active = providerManager?.getActiveProvider();
      const pct = max > 0 ? Math.round((used / max) * 100) : 0;
      if (tuiApp) {
        const statusText = [
          '**Session Status**',
          '',
          `- Provider: ${active?.id ?? 'unknown'}`,
          `- Model: ${active?.model ?? 'unknown'}`,
          `- Context: ${used.toLocaleString()} / ${max.toLocaleString()} (${pct}%)`,
          `- Tokens: ${agent.tokenUsage().totalTokens.toLocaleString()} total`,
        ].join('\n');
        tuiApp.addMarkdown(statusText);
      }
      break;
    }
    case 'tokens': {
      const [used, max] = agent.contextUsage();
      const pct = max > 0 ? Math.round((used / max) * 100) : 0;
      if (tuiApp) {
        tuiApp.addToConversation(
          `\x1B[90mContext: ${used.toLocaleString()} / ${max.toLocaleString()} (${pct}%)\x1B[39m`,
          'system',
        );
      }
      break;
    }
    case 'cost':
      if (tuiApp) {
        tuiApp.addToConversation(
          `\x1B[90mTokens: \u2191${agent.tokenUsage().promptTokens.toLocaleString()} \u2193${agent.tokenUsage().completionTokens.toLocaleString()} \u03A3${agent.tokenUsage().totalTokens.toLocaleString()}\x1B[39m`,
          'system',
        );
      }
      break;
    case 'doctor': {
      const doctor = new Doctor();
      const report = await doctor.run();
      if (tuiApp) {
        const lines = report.checks.map((c) => {
          const icon = c.status === 'passed' ? '\u2714' : c.status === 'warning' ? '\u26A0' : '\u2718';
          const color = c.status === 'passed' ? '\x1B[32m' : c.status === 'warning' ? '\x1B[33m' : '\x1B[31m';
          return `${color}${icon}\x1B[39m ${c.name}: ${c.message}`;
        });
        tuiApp.addToConversation(lines.join('\n'), 'system');
      }
      break;
    }
    case 'provider': {
      if (tuiApp) {
        tuiApp.addToConversation(
          `\x1B[90mUse \x1B[33mlibrecode provider <command>\x1B[39m \x1B[90mfrom your terminal to manage providers.\x1B[39m`,
          'system',
        );
      }
      break;
    }
    case 'workspace': {
      const dir = _workingDir ?? process.cwd();
      if (tuiApp) {
        tuiApp.addToConversation(`\x1B[90mWorkspace: ${dir}\x1B[39m`, 'system');
      }
      break;
    }
    case 'compact':
      agent.clearHistory();
      if (tuiApp) {
        tuiApp.addToConversation('\x1B[90mContext compacted.\x1B[39m', 'system');
      }
      break;
    case 'model': {
      const modelArg = (cmd as { type: 'model'; model: string }).model;
      if (tuiApp) {
        if (!modelArg) {
          const fp = providerManager?.getFreeProvider();
          if (fp) {
            const aliases = fp.getAliases();
            const models = await providerManager!.listFreeModels();
            const lines = [
              '**Free Models Available**',
              '',
              '**Aliases:**',
              ...Object.entries(aliases).map(([alias, m]) => `  \`/model ${alias}\` → ${m || 'auto-best'}`),
              '',
              '**Available models:**',
              ...models.map((m) => `  \`${m.id}\``),
            ];
            tuiApp.addMarkdown(lines.join('\n'));
          } else {
            tuiApp.addToConversation('\x1B[90mUse /provider switch <name> to change provider.\x1B[39m', 'system');
          }
        } else {
          const fp = providerManager?.getFreeProvider();
          if (fp && (modelArg === 'auto' || modelArg.endsWith('-free') || modelArg === 'free')) {
            fp.setModel(modelArg);
            const mi = fp.getModel();
            tuiApp.addToConversation(`\x1B[90mSwitched to free model: \x1B[33m${mi.name}\x1B[39m`, 'system');
          } else {
            tuiApp.addToConversation('\x1B[90mUse /provider switch to change providers, or /model auto for free.\x1B[39m', 'system');
          }
        }
      }
      break;
    }
    case 'git':
      if (tuiApp) {
        tuiApp.addToConversation('\x1B[90mGit operations are handled by the AI agent.\x1B[39m', 'system');
      }
      break;
    case 'config':
      if (tuiApp) {
        tuiApp.addToConversation('\x1B[90mConfig is managed automatically.\x1B[39m', 'system');
      }
      break;
    case 'history':
      if (tuiApp) {
        tuiApp.addToConversation('\x1B[90mHistory is managed in the agent context.\x1B[39m', 'system');
      }
      break;
    case 'session':
      if (tuiApp) {
        const [used, max] = agent.contextUsage();
        tuiApp.addToConversation(
          `\x1B[90mContext: ${used.toLocaleString()} / ${max.toLocaleString()}\x1B[39m`,
          'system',
        );
      }
      break;
    case 'tools':
      if (tuiApp) {
        tuiApp.addToConversation('\x1B[90mAll tools are pre-configured. Use /permissions to manage.\x1B[39m', 'system');
      }
      break;
    case 'logs':
      if (tuiApp) {
        const logFile = getLogger().getLogFile();
        tuiApp.addToConversation(`\x1B[90mLog file: ${logFile ?? 'N/A'}\x1B[39m`, 'system');
      }
      break;
    case 'permissions':
      if (tuiApp) {
        tuiApp.addToConversation('\x1B[90mUse /permissions list|allow|deny|reset <tool>\x1B[39m', 'system');
      }
      break;
    case 'setup':
      if (tuiApp) {
        tuiApp.addToConversation('\x1B[90mRun \x1B[33mlibrecode setup\x1B[39m \x1B[90mfrom your terminal.\x1B[39m', 'system');
      }
      break;
    case 'unknown': {
      if (tuiApp) {
        tuiApp.addToConversation(
          `\x1B[90mUnknown command: ${cmd.command}\x1B[39m\n\x1B[90m  Type /help for available commands.\x1B[39m`,
          'system',
        );
      }
      break;
    }
  }

  if (tuiApp) tuiApp.render();
}

async function runSingleTurn(
  agent: Agent,
  renderer: TerminalRenderer,
  prompt: string,
): Promise<void> {
  try {
    if (agent.supportsStreaming()) {
      renderer.startThinking();
      await agent.runTurnStreaming(prompt, (event) => {
        renderer.handleEvent(event);
      });
    } else {
      const result = await agent.runTurn(prompt);
      process.stdout.write(result + '\n');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    renderer.handleEvent({ type: 'fatal_error', message: msg });
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\x1B[31mError: ${msg}\x1B[39m\n`);
  process.stderr.write(`\x1B[33mRun \x1B[1mlibrecode doctor\x1B[22m to diagnose issues.\x1B[39m\n`);
  process.exit(1);
});
