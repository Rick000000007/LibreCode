import type { Agent } from 'librecode-core';
import type { ProviderManager } from 'librecode-providers';
import type { AgentConfig } from 'librecode-types';

export interface CommandContext {
  agent: Agent;
  providerManager?: ProviderManager;
  config?: AgentConfig;
  workingDir?: string;
  tuiApp?: any;
  args: string[];
}

export interface CommandMetadata {
  name: string;
  description: string;
  usage: string;
  examples: string[];
  aliases?: string[];
  permissions?: string[];
}

export type CommandMiddleware = (
  ctx: CommandContext,
  next: () => Promise<void>
) => Promise<void> | void;

export interface CommandLifecycle {
  beforeExecute?: (ctx: CommandContext) => Promise<boolean | void> | boolean | void;
  afterExecute?: (ctx: CommandContext) => Promise<void> | void;
}

export interface Command extends CommandLifecycle {
  metadata: CommandMetadata;
  execute(ctx: CommandContext): Promise<void> | void;
  validate?(ctx: CommandContext): Promise<string | null> | string | null;
}

export class CommandRegistry {
  private commands = new Map<string, Command>();
  private aliases = new Map<string, string>();
  private middlewares: CommandMiddleware[] = [];

  register(command: Command): void {
    const name = command.metadata.name.toLowerCase();
    this.commands.set(name, command);
    if (command.metadata.aliases) {
      for (const alias of command.metadata.aliases) {
        this.aliases.set(alias.toLowerCase(), name);
      }
    }
  }

  use(middleware: CommandMiddleware): void {
    this.middlewares.push(middleware);
  }

  getCommand(name: string): Command | undefined {
    const lowerName = name.toLowerCase();
    const resolvedName = this.aliases.get(lowerName) ?? lowerName;
    return this.commands.get(resolvedName);
  }

  getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  getAutocompleteOptions(prefix: string): string[] {
    const lowerPrefix = prefix.toLowerCase();
    const matches: string[] = [];
    for (const name of this.commands.keys()) {
      if (name.startsWith(lowerPrefix)) {
        matches.push(`/${name}`);
      }
    }
    for (const alias of this.aliases.keys()) {
      if (alias.startsWith(lowerPrefix)) {
        matches.push(`/${alias}`);
      }
    }
    return matches.sort();
  }

  async executeCommand(name: string, ctx: CommandContext): Promise<void> {
    const command = this.getCommand(name);
    if (!command) {
      if (ctx.tuiApp) {
        ctx.tuiApp.addToConversation(
          `\x1B[31mUnknown command: /${name}\x1B[39m\n\x1B[90m  Type /help for available commands.\x1B[39m`,
          'system'
        );
      }
      return;
    }

    // 1. Validation
    if (command.validate) {
      const valError = await command.validate(ctx);
      if (valError) {
        if (ctx.tuiApp) {
          ctx.tuiApp.addToConversation(
            `\x1B[31mValidation Error: ${valError}\x1B[39m\n\x1B[90mUsage: ${command.metadata.usage}\x1B[39m`,
            'system'
          );
        }
        return;
      }
    }

    // 2. Lifecycle: beforeExecute
    if (command.beforeExecute) {
      const shouldProceed = await command.beforeExecute(ctx);
      if (shouldProceed === false) {
        return;
      }
    }

    // 3. Middlewares + Execute + afterExecute
    let idx = 0;
    const runner = async () => {
      if (idx < this.middlewares.length) {
        const mw = this.middlewares[idx++];
        if (mw) {
          await mw(ctx, runner);
        }
      } else {
        await command.execute(ctx);
        if (command.afterExecute) {
          await command.afterExecute(ctx);
        }
      }
    };

    await runner();
  }
}

export const globalCommandRegistry = new CommandRegistry();
