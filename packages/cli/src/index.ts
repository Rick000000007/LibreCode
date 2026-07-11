#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { type AgentConfig } from 'librecode-types';
import { loadConfig, type CliOptions } from 'librecode-config';
import { Agent, generateSystemPrompt, RepoMapper } from 'librecode-core';
import { TerminalRenderer } from 'librecode-ui';
import { ToolRegistry, PermissionChecker } from 'librecode-tools';
import { ModelRouter, createProvider } from 'librecode-providers';
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

async function main(): Promise<void> {
  const cliOptions = parseArgs(process.argv);

  const configPath = cliOptions.config
    ? path.resolve(cliOptions.config)
    : findConfig();
  const config = loadConfig(configPath
    ? { ...cliOptions, config: configPath }
    : cliOptions,
  );
  const workingDir = cliOptions.dir
    ? path.resolve(cliOptions.dir)
    : process.cwd();

  const tools = ToolRegistry.defaultRegistry();
  const permissionChecker = new PermissionChecker(cliOptions.yes ?? false);
  const provider = buildProvider(config);
  const agent = new Agent(provider, tools, config, workingDir, permissionChecker);
  const renderer = new TerminalRenderer();
  const repoMapper = new RepoMapper();

  renderer.printBanner(VERSION);

  repoMapper.indexDirectory(workingDir);
  const repoMap = repoMapper.generateMap(4096);
  const prompt = generateSystemPrompt(workingDir, repoMap);
  agent.setSystemPrompt(prompt);

  if (cliOptions.prompt) {
    await runSingleTurn(agent, renderer, cliOptions.prompt);
    process.exit(0);
  }

  const getPrompt = () => getPromptIndicator(config);
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
        await handleBuiltin(builtin, agent, renderer, config, rl, getPrompt);
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

function buildProvider(config: AgentConfig): ModelRouter {
  const providerMap = new Map<string, ReturnType<typeof createProvider>>();
  const failoverChain: string[] = [];

  for (const [name, providerConfig] of Object.entries(config.providers)) {
    const provider = createProvider(
      name,
      providerConfig.apiKey,
      providerConfig.baseUrl,
      providerConfig.defaultModel,
    );
    const modelId = `${name}:${providerConfig.defaultModel}`;
    providerMap.set(modelId, provider);
    failoverChain.push(modelId);
  }

  return new ModelRouter(providerMap, failoverChain);
}

async function handleBuiltin(
  cmd: ReturnType<typeof parseBuiltin>,
  agent: Agent,
  renderer: TerminalRenderer,
  config: AgentConfig,
  rl: ReturnType<typeof createRepl>,
  getPrompt: () => string,
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
    case 'model':
      config.model = cmd.model;
      process.stdout.write(`\x1B[90mModel changed to: ${config.model}\x1B[39m\n`);
      rl.setPrompt(getPrompt());
      break;
    case 'provider':
      process.stdout.write('\x1B[90m/provider is not yet supported in-session. Restart rcode with --provider to change.\x1B[39m\n');
      break;
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
