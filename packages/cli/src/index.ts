#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { loadConfig, type CliOptions } from 'librecode-config';
import {
  Agent,
  WorkflowEngine,
  RepoMapper,
  generateSystemPrompt,
} from 'librecode-core';
import { TerminalRenderer, getLogger } from 'librecode-ui';
import {
  ToolRegistry,
  PermissionChecker,
  ListDirTool,
  ReadFileTool,
  SearchCodeTool,
  EditFileTool,
  WriteFileTool,
  RunCommandTool,
  UndoFileTool,
  GitTool,
  WebFetchTool,
} from 'librecode-tools';
import {
  ProviderManager,
  SetupWizard,
  ProviderRegistry,
  printProviderList,
  printProviderCurrent,
  handleProviderLogin,
  handleProviderLogout,
  handleProviderTest,
  handleProviderSwitch,
  handleProviderModels,
  Doctor,
  formatDoctorReport,
  ConfigurationManager,
} from 'librecode-providers';
import { LibreError } from 'librecode-utils';
import { LlmError } from 'librecode-providers';
import { globalCommandRegistry } from './command-framework.js';
import './commands-impl.js';
import type { AgentEvent } from 'librecode-types';
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

  // Initialize provider
  let active = await providerManager.initialize();

  if (!active) {
    const configMgr = new ConfigurationManager();
    const wizard = new SetupWizard(new ProviderRegistry(), configMgr);
    const configured = await wizard.run();
    if (!configured) {
      process.exit(1);
    }
    // Re-initialize after setup
    active = await providerManager.initialize();
    if (!active) {
      process.exit(1);
    }
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

  const workflowEngine = agent ? new WorkflowEngine(agent, tools) : null;

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

      if (trimmed.startsWith('/')) {
        const parts = trimmed.slice(1).trim().split(/\s+/);
        const name = parts[0]?.toLowerCase() ?? '';
        const args = parts.slice(1);
        try {
          await globalCommandRegistry.executeCommand(name, {
            agent,
            providerManager,
            config,
            workingDir,
            tuiApp,
            args,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          tuiApp.addToConversation(`\x1B[31mError executing command: ${msg}\x1B[39m`, 'system');
        }
        tuiApp.render();
        return;
      }

      tuiApp.getWorkflow().beginStep('thinking', 'Thinking');
      tuiApp.render();

      try {
        const onApproval = async (toolName: string, args: Record<string, unknown>, desc: string) => {
          return await tuiApp.requestApproval(toolName, args, desc);
        };

        if (agent.supportsStreaming()) {
          let fullResponse = '';
          await workflowEngine!.executeGoal(trimmed, (event) => {
            switch (event.type) {
              case 'text_delta':
                fullResponse += event.delta;
                tuiApp.streamTextDelta(event.delta);
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
              case 'workflow_started':
                tuiApp.getWorkflow().beginStep('workflow', 'Workflow Started');
                tuiApp.addToConversation(`\x1B[34m\u25b6 Planned ${event.plan.length} tasks\x1B[39m`, 'system');
                break;
              case 'task_started':
                tuiApp.getWorkflow().beginStep(event.taskId, event.description);
                tuiApp.addToConversation(`\x1B[34m\u25b6 Task: ${event.description}\x1B[39m`, 'system');
                break;
              case 'task_completed':
                tuiApp.getWorkflow().completeStep(event.taskId, event.result);
                tuiApp.addToConversation(`\x1B[32m\u2714 Task Complete: ${event.result}\x1B[39m`, 'system');
                break;
              case 'task_failed':
                tuiApp.getWorkflow().failStep(event.taskId, event.error);
                tuiApp.addToConversation(`\x1B[31m\u2718 Task Failed: ${event.error}\x1B[39m`, 'system');
                break;
              case 'workflow_completed':
                tuiApp.getWorkflow().completeStep('workflow', event.summary);
                break;
              case 'turn_complete':
                tuiApp.addToConversation(`\x1B[90m\u2500\u2500\u2500 Turn ${event.turnNumber} \u2500\u2500\u2500\x1B[39m`, 'system');
                break;
            }
            tuiApp.render();
          }, onApproval);

          if (fullResponse) {
            tuiApp.getWorkflow().completeStep('thinking', 'Response generated');
          }
        } else {
          tuiApp.addToConversation('Processing...', 'system');
          const response = await workflowEngine!.executeGoal(trimmed, () => {}, onApproval);
          tuiApp.addToConversation(response, 'assistant');
          tuiApp.getWorkflow().completeStep('thinking', 'Response generated');
        }

        const [used, max] = agent.contextUsage();
        const pct = max > 0 ? Math.round((used / max) * 100) : 0;
        tuiApp.setTokenPct(pct);

      } catch (err: unknown) {
        let msg = '';
        let causes: string[] = [];
        let actions: string[] = [];

        if (err instanceof LlmError) {
          msg = err.message || `Provider error (${err.code})`;
          if (err.code === 'auth_error') {
            causes = ['Invalid API key', 'API key not set in environment variables'];
            actions = ['/provider', '/setup', 'Check environment variables (e.g. GEMINI_API_KEY)'];
          } else if (err.code === 'unavailable') {
            causes = ['No free providers found', 'Local Ollama server not running', 'Network issue'];
            actions = ['/setup', 'Run `ollama serve`', 'Check your internet connection'];
          } else if (err.code === 'rate_limited') {
            causes = ['You have exceeded the provider quota', 'Too many requests in a short time'];
            actions = ['Wait a moment before trying again', '/model (switch to a different provider)'];
          } else if (err.code === 'model_not_found') {
            causes = ['The requested model does not exist on this provider', 'Typo in model name'];
            actions = ['/model (view available models)', '/provider'];
          } else {
            causes = ['Provider API returned an error', 'Network timeout'];
            actions = ['/doctor', '/provider'];
          }
        } else if (err instanceof LibreError) {
          msg = err.message || `${err.code}: ${err.category}`;
          if (err.recoverySuggestion) actions.push(err.recoverySuggestion);
          actions.push('/doctor');
        } else if (err instanceof Error) {
          msg = err.message || 'Unknown error';
          actions.push('/doctor');
        } else {
          msg = String(err) || 'Unknown error';
          actions.push('/doctor');
        }

        if (!msg) msg = 'An unknown error occurred.';

        tuiApp.addToConversation(`\x1B[31m\u2718 Error: ${msg}\x1B[39m`, 'system');
        
        if (causes.length > 0) {
          tuiApp.addToConversation(`\x1B[90mPossible causes:\x1B[39m\n` + causes.map(c => `\x1B[90m \u2022 ${c}\x1B[39m`).join('\n'), 'system');
        }
        if (actions.length > 0) {
          tuiApp.addToConversation(`\x1B[33mSuggested actions:\x1B[39m\n` + actions.map(a => `\x1B[33m \u2022 ${a}\x1B[39m`).join('\n'), 'system');
        }
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
    `\x1B[36m\u2502\x1B[39m Provider: ${welcomeProvider.padEnd(21)} \x1B[36m\u2502\x1B[39m\n` +
    `\x1B[36m\u2502\x1B[39m Model: ${modelDisplayName.padEnd(24)} \x1B[36m\u2502\x1B[39m\n` +
    `\x1B[36m\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\x1B[39m\n` +
    `\x1B[90mWelcome! Type your question or request below.\x1B[39m\n` +
    `\x1B[90mHelpful commands:\x1B[39m \x1B[36m/help  /model  /provider  /clear  /exit\x1B[39m\n` +
    `\x1B[90mShortcuts:        \x1B[39m\x1B[36mCtrl+K\x1B[39m \x1B[90mfor Command Palette, \x1B[39m\x1B[36mCtrl+C\x1B[39m \x1B[90mto cancel\x1B[39m`,
    'system',
  );

  tuiApp.start();
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

if (process.env['NODE_ENV'] !== 'test' && !process.env['VITEST']) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\x1B[31mError: ${msg}\x1B[39m\n`);
    process.stderr.write(`\x1B[33mRun \x1B[1mlibrecode doctor\x1B[22m to diagnose issues.\x1B[39m\n`);
    process.exit(1);
  });
}
