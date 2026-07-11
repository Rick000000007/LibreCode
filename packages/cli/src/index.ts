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
import { parseBuiltin, printBuiltinHelp, getPromptIndicator } from './commands.js';
import { createRepl } from './repl.js';

const VERSION = '0.1.0';

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
  const renderer = new TerminalRenderer();
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

  // Detect non-TTY mode (pipe) and run single-shot
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

  // Provider manager for the new system
  const providerManager = new ProviderManager();

  // First-run setup wizard - only in interactive mode
  if (providerManager.isFirstRun() && !cliOptions.prompt) {
    renderer.printBanner(VERSION);
    const registry = providerManager.getRegistry();
    const configMgr = new ConfigurationManager();
    const wizard = new SetupWizard(registry, configMgr);
    const configured = await wizard.run();
    if (!configured) {
      process.stdout.write(
        '\n\x1B[33mNo provider configured.\x1B[39m\n' +
        '\x1B[90m  Run \x1B[33mlibrecode provider login\x1B[39m \x1B[90mto configure one, or\x1B[39m\n' +
        '\x1B[90m  run \x1B[33mlibrecode\x1B[39m \x1B[90mto run the setup wizard again. You can also run:\x1B[39m\n' +
        '\x1B[90m  \x1B[33mlibrecode setup\x1B[39m \x1B[90mor\x1B[39m \x1B[33mlibrecode doctor\x1B[39m\n',
      );
      process.exit(0);
    }
  }

  // Initialize provider manager
  const active = await providerManager.initialize();

  if (!active && !cliOptions.prompt) {
    renderer.printBanner(VERSION);
    process.stdout.write(
      '\x1B[33mNo active provider found.\x1B[39m\n' +
      '\x1B[90m  Run \x1B[33mlibrecode setup\x1B[39m \x1B[90mto configure a provider.\x1B[39m\n' +
      '\x1B[90m  Run \x1B[33mlibrecode provider list\x1B[39m \x1B[90mto see configured providers.\x1B[39m\n' +
      '\x1B[90m  Run \x1B[33mlibrecode doctor\x1B[39m \x1B[90mto run diagnostics.\x1B[39m\n',
    );
    process.exit(0);
  }

  if (!active) {
    process.stderr.write('\x1B[31mNo active provider found.\x1B[39m\n');
    process.exit(1);
  }

  renderer.printBanner(VERSION);
  renderer.setStatus(workingDir, active.id, active.model);

  // Show active provider info
  process.stdout.write(
    `\x1B[90mProvider: \x1B[36m${active.id}\x1B[39m \x1B[90mModel: \x1B[36m${active.model}\x1B[39m\n\n`,
  );

  // Build agent using provider manager
  const agent = await Agent.fromProviderManager(
    providerManager,
    tools,
    config,
    workingDir,
    permissionChecker,
  );

  if (!agent) {
    renderer.showErrorWithGuidance(
      'Failed to initialize agent.',
      `Run \`librecode provider test ${active.id}\` to diagnose, or \`librecode doctor\` for full diagnostics.`,
    );
    process.exit(1);
  }

  repoMapper.indexDirectory(workingDir);
  const repoMap = repoMapper.generateMap(4096);
  const prompt = generateSystemPrompt(workingDir, repoMap);
  agent.setSystemPrompt(prompt);

  // Single-shot mode
  if (cliOptions.prompt) {
    await runSingleTurn(agent, renderer, cliOptions.prompt);
    process.exit(0);
  }

  // Interactive REPL mode
  const getPrompt = () => getPromptIndicator(config, active.id, active.model);
  const rl = createRepl(getPrompt());
  let processing = false;

  renderer.printStatus();

  rl.on('line', async (line: string) => {
    if (processing) return;
    processing = true;
    try {
      const trimmed = line.trim();
      if (!trimmed) {
        rl.prompt();
        return;
      }

      const builtin = parseBuiltin(trimmed);
      if (builtin) {
        await handleBuiltin(builtin, agent, renderer, config, rl, getPrompt, providerManager, workingDir);
        return;
      }

      rl.pause();
      try {
        renderer.startThinking();
        if (agent.supportsStreaming()) {
          await agent.runTurnStreaming(trimmed, (event) => {
            renderer.handleEvent(event);
          });
        } else {
          renderer.stopThinking();
          const result = await agent.runTurn(trimmed);
          process.stdout.write(result + '\n');
        }
        renderer.updateContextUsage(...agent.contextUsage());
        renderer.printUsage(agent.tokenUsage());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        renderer.handleEvent({ type: 'fatal_error', message: msg });
      }
      rl.prompt();
      rl.resume();
    } finally {
      processing = false;
    }
  });

  rl.on('close', () => {
    process.stdout.write('\n');
    process.exit(0);
  });
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

async function handleBuiltin(
  cmd: ReturnType<typeof parseBuiltin>,
  agent: Agent,
  renderer: TerminalRenderer,
  config: AgentConfig,
  rl: ReturnType<typeof createRepl>,
  getPrompt: () => string,
  providerManager?: ProviderManager,
  workingDir?: string,
): Promise<void> {
  if (!cmd) return;

  switch (cmd.type) {
    case 'help':
      process.stdout.write(printBuiltinHelp(config));
      break;
    case 'exit':
      rl.close();
      return;
    case 'clear':
      agent.clearHistory();
      process.stdout.write('\x1B[2J\x1B[H');
      break;
    case 'cost':
      renderer.printUsage(agent.tokenUsage());
      break;
    case 'tokens': {
      const [used, max] = agent.contextUsage();
      process.stdout.write(
        `\x1B[90mContext: ${used.toLocaleString()} / ${max.toLocaleString()} tokens (${Math.round((used / max) * 100)}%)\x1B[39m\n`,
      );
      break;
    }
    case 'status': {
      const [used, max] = agent.contextUsage();
      const active = providerManager?.getActiveProvider();
      process.stdout.write('\x1B[1mSession Status\x1B[22m\n');
      process.stdout.write(`  \x1B[90mProvider:\x1B[39m  ${active?.id ?? 'unknown'}\n`);
      process.stdout.write(`  \x1B[90mModel:\x1B[39m     ${active?.model ?? 'unknown'}\n`);
      process.stdout.write(`  \x1B[90mContext:\x1B[39m   ${used.toLocaleString()} / ${max.toLocaleString()}\n`);
      process.stdout.write(`  \x1B[90mTokens:\x1B[39m    ${agent.tokenUsage().totalTokens.toLocaleString()} total\n`);
      if (workingDir) {
        process.stdout.write(`  \x1B[90mWorkspace:\x1B[39m ${workingDir}\n`);
      }
      process.stdout.write('\n');
      break;
    }
    case 'setup': {
      const registry = new ProviderRegistry();
      const configMgr = new ConfigurationManager();
      const wizard = new SetupWizard(registry, configMgr);
      await wizard.run();
      break;
    }
    case 'doctor': {
      const doctor = new Doctor();
      const report = await doctor.run();
      process.stdout.write(formatDoctorReport(report));
      break;
    }
    case 'workspace': {
      const dir = workingDir ?? process.cwd();
      process.stdout.write(`\x1B[90mWorkspace:\x1B[39m ${dir}\n`);
      try {
        const files = fs.readdirSync(dir);
        process.stdout.write(`\x1B[90mFiles:\x1B[39m ${files.length}\n`);
      } catch {
        // ignore
      }
      break;
    }
    case 'session': {
      const [used, max] = agent.contextUsage();
      process.stdout.write('\x1B[1mSession Info\x1B[22m\n');
      process.stdout.write(`  \x1B[90mContext:\x1B[39m    ${used.toLocaleString()} / ${max.toLocaleString()}\n`);
      process.stdout.write(`  \x1B[90mPrompt:\x1B[39m     ${agent.tokenUsage().promptTokens.toLocaleString()}\n`);
      process.stdout.write(`  \x1B[90mCompletion:\x1B[39m ${agent.tokenUsage().completionTokens.toLocaleString()}\n`);
      process.stdout.write(`  \x1B[90mTotal:\x1B[39m      ${agent.tokenUsage().totalTokens.toLocaleString()}\n`);
      break;
    }
    case 'tools': {
      process.stdout.write('\x1B[1mAvailable Tools\x1B[22m\n');
      process.stdout.write('  \x1B[90mAll tools are pre-configured in the tool registry.\x1B[39m\n');
      process.stdout.write('  \x1B[90mUse /permissions list to view tool permissions.\x1B[39m\n');
      break;
    }
    case 'git': {
      process.stdout.write(
        '\x1B[90mGit operations are handled by the AI agent.\x1B[39m\n' +
        '\x1B[90mAsk the agent to run a git command like "show me git status".\x1B[39m\n',
      );
      break;
    }
    case 'config': {
      const sub = cmd.args[0];
      if (sub === 'path') {
        const pm = providerManager ?? new ProviderManager();
        process.stdout.write(`\x1B[90mConfig: ${pm.configFilePath()}\x1B[39m\n`);
      } else {
        process.stdout.write(`\x1B[90mConfig is managed automatically.\x1B[39m\n`);
        process.stdout.write(`\x1B[90mUse /config path to show config file location.\x1B[39m\n`);
      }
      break;
    }
    case 'logs': {
      const logger = getLogger();
      const logFile = logger.getLogFile();
      if (logFile && fs.existsSync(logFile)) {
        process.stdout.write(`\x1B[90mLog file: ${logFile}\x1B[39m\n`);
      } else {
        process.stdout.write('\x1B[90mNo log file available.\x1B[39m\n');
      }
      break;
    }
    case 'history': {
      process.stdout.write('\x1B[90mHistory managed by the agent context.\x1B[39m\n');
      break;
    }
    case 'model': {
      process.stdout.write(`\x1B[90mModel change is managed by the provider system.\x1B[39m\n`);
      process.stdout.write(`\x1B[90mUse \x1B[33mlibrecode provider switch\x1B[39m \x1B[90mto change providers.\x1B[39m\n`);
      break;
    }
    case 'provider': {
      if (providerManager) {
        const registry = providerManager.getRegistry();
        const configMgr = new ConfigurationManager();
        const sub = cmd.provider || 'current';
        if (sub === 'list') {
          process.stdout.write(printProviderList(providerManager.getConfig(), registry));
        } else if (sub === 'current') {
          process.stdout.write(printProviderCurrent(providerManager.getConfig(), registry));
        } else if (sub === 'switch') {
          const rest = cmd.args?.join(' ') ?? '';
          if (rest) {
            await handleProviderSwitch(rest, registry, configMgr);
          } else {
            process.stdout.write('\x1B[33mSpecify a provider to switch to.\x1B[39m\n');
            process.stdout.write('\x1B[90m  /provider switch <name>\x1B[39m\n');
            process.stdout.write('\x1B[90m  Available: openai, anthropic, gemini, ollama, openrouter\x1B[39m\n');
          }
        } else if (sub === 'login') {
          await handleProviderLogin(registry, configMgr);
        } else if (sub === 'logout') {
          const rest = cmd.args?.join(' ') ?? '';
          await handleProviderLogout(rest || undefined, registry, configMgr);
        } else if (sub === 'test') {
          const rest = cmd.args?.join(' ') ?? '';
          if (rest) {
            await handleProviderTest(rest, registry, configMgr);
          } else {
            process.stdout.write('\x1B[33mUsage: /provider test <name>\x1B[39m\n');
          }
        } else {
          process.stdout.write('\x1B[33m/provider subcommands:\x1B[39m\n');
          process.stdout.write('  \x1B[33mlist\x1B[39m       List configured providers\n');
          process.stdout.write('  \x1B[33mcurrent\x1B[39m    Show active provider\n');
          process.stdout.write('  \x1B[33mswitch\x1B[39m     Switch active provider\n');
          process.stdout.write('  \x1B[33mlogin\x1B[39m      Configure a provider\n');
          process.stdout.write('  \x1B[33mlogout\x1B[39m     Remove provider configuration\n');
          process.stdout.write('  \x1B[33mtest\x1B[39m       Test provider connection\n');
        }
      } else {
        process.stdout.write('\x1B[33mProvider management not available in this context.\x1B[39m\n');
      }
      break;
    }
    case 'compact':
      agent.clearHistory();
      process.stdout.write('\x1B[90mContext compacted.\x1B[39m\n');
      break;
    case 'permissions': {
      const perms = agent.listPermissions();
      const toolName = cmd.args[0];
      switch (cmd.sub) {
        case 'list':
          process.stdout.write(
            Object.entries(perms)
              .map(([k, v]) => `  \x1B[90m${k}:\x1B[39m ${v}`)
              .join('\n') + '\n',
          );
          break;
        case 'allow':
          if (!toolName) break;
          agent.setPermission(toolName, true);
          process.stdout.write(`\x1B[90mAllowed: ${toolName}\x1B[39m\n`);
          break;
        case 'deny':
          if (!toolName) break;
          agent.setPermission(toolName, false);
          process.stdout.write(`\x1B[90mDenied: ${toolName}\x1B[39m\n`);
          break;
        case 'reset':
          if (!toolName) break;
          agent.resetPermission(toolName);
          process.stdout.write(`\x1B[90mReset: ${toolName}\x1B[39m\n`);
          break;
        default:
          process.stdout.write('\x1B[90mUnknown permission command. Use: list, allow, deny, reset\x1B[39m\n');
      }
      break;
    }
    case 'unknown': {
      const cmdName = cmd.command.replace(/^\//, '').split(/\s+/)[0] ?? '';
      const suggestions = ['help', 'exit', 'clear', 'cost', 'status', 'setup', 'doctor', 'provider', 'tokens', 'compact', 'workspace'];
      const similar = suggestions.filter((s) => s.startsWith(cmdName) || cmdName.startsWith(s));
      process.stdout.write(`\x1B[90mUnknown command: ${cmd.command}\x1B[39m\n`);
      if (similar.length > 0) {
        process.stdout.write(`\x1B[90m  Did you mean: /${similar[0]}?\x1B[39m\n`);
      }
      process.stdout.write(`\x1B[90m  Type /help for available commands.\x1B[39m\n`);
      break;
    }
  }
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
  process.stderr.write(`\x1B[33mRun \x1B[1mlibrecode doctor\x1B[22m to diagnose issues, or \x1B[1mlibrecode setup\x1B[22m to configure.\x1B[39m\n`);
  process.exit(1);
});
