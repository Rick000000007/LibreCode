#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { type AgentConfig } from 'librecode-types';
import { loadConfig, type CliOptions } from 'librecode-config';
import { Agent, generateSystemPrompt, RepoMapper } from 'librecode-core';
import { TerminalRenderer } from 'librecode-ui';
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

  // Check if running as `librecode provider <command>`
  const providerCmd = parseProviderArgs(process.argv);
  if (providerCmd) {
    const pm = new ProviderManager();
    await handleProviderCommand(providerCmd, pm);
    process.exit(0);
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

  const renderer = new TerminalRenderer();
  const repoMapper = new RepoMapper();
  const tools = ToolRegistry.defaultRegistry();
  const permissionChecker = new PermissionChecker(cliOptions.yes ?? false);

  // Provider manager for the new system
  const providerManager = new ProviderManager();

  // First-run setup wizard
  if (providerManager.isFirstRun()) {
    renderer.printBanner(VERSION);
    const registry = providerManager.getRegistry();
    const configMgr = new ConfigurationManager();
    const wizard = new SetupWizard(registry, configMgr);
    const configured = await wizard.run();
    if (!configured) {
      process.stdout.write(
        '\n\x1B[33mNo provider configured.\x1B[39m\n' +
        '\x1B[90m  Run \x1B[33mlibrecode provider login\x1B[39m \x1B[90mto configure one, or\x1B[39m\n' +
        '\x1B[90m  run \x1B[33mlibrecode\x1B[39m \x1B[90mto run the setup wizard again.\x1B[39m\n',
      );
      process.exit(0);
    }
  }

  // Initialize provider manager
  const active = await providerManager.initialize();

  renderer.printBanner(VERSION);

  if (!active) {
    process.stdout.write(
      '\x1B[33mNo active provider found.\x1B[39m\n' +
      '\x1B[90m  Run \x1B[33mlibrecode provider login\x1B[39m \x1B[90mto configure a provider.\x1B[39m\n' +
      '\x1B[90m  Run \x1B[33mlibrecode provider list\x1B[39m \x1B[90mto see configured providers.\x1B[39m\n',
    );
    process.exit(0);
  }

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
    process.stdout.write(
      '\x1B[31mFailed to initialize agent. Check your provider configuration.\x1B[39m\n' +
      `\x1B[90m  Run \x1B[33mlibrecode provider test ${active.id}\x1B[39m \x1B[90mto diagnose.\x1B[39m\n`,
    );
    process.exit(1);
  }

  repoMapper.indexDirectory(workingDir);
  const repoMap = repoMapper.generateMap(4096);
  const prompt = generateSystemPrompt(workingDir, repoMap);
  agent.setSystemPrompt(prompt);

  if (cliOptions.prompt) {
    await runSingleTurn(agent, renderer, cliOptions.prompt);
    process.exit(0);
  }

  const getPrompt = () => getPromptIndicator(config, active.id, active.model);
  const rl = createRepl(getPrompt());
  let processing = false;
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
        await handleBuiltin(builtin, agent, renderer, config, rl, getPrompt, providerManager);
        return;
      }

      rl.pause();
      try {
        if (agent.supportsStreaming()) {
          renderer.startThinking();
          await agent.runTurnStreaming(trimmed, (event) => {
            renderer.handleEvent(event);
          });
        } else {
          const result = await agent.runTurn(trimmed);
          process.stdout.write(result + '\n');
        }
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
          }
        } else {
          process.stdout.write('\x1B[33m/provider subcommands: list, current, switch <name>\x1B[39m\n');
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
    case 'unknown':
      process.stdout.write(
        `\x1B[90mUnknown command: ${cmd.command}. Type /help for available commands.\x1B[39m\n`,
      );
      break;
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
  process.stderr.write(`\x1B[31mFatal error: ${msg}\x1B[39m\n`);
  process.exit(1);
});
