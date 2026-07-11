import { BaseTool } from './base.js';
import { SafetyChecker } from './safety.js';
import { execSync } from 'node:child_process';

export class GitTool extends BaseTool {
  name(): string {
    return 'git';
  }

  description(): string {
    return 'Run git commands. Supports: status, diff, log, add, commit, branch, checkout, and arbitrary git commands.';
  }

  parametersSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'status',
            'diff',
            'log',
            'add',
            'commit',
            'branch',
            'checkout',
            'run',
          ],
          description: 'The git action to perform',
        },
        args: {
          type: 'string',
          description:
            "Additional arguments (e.g., file paths for 'add', commit message for 'commit', branch name for 'checkout')",
        },
      },
      required: ['action'],
    };
  }

  async execute(args: Record<string, unknown>, workingDir: string): Promise<string> {
    const action = args['action'] as string | undefined;
    if (!action) throw new Error("Missing 'action' parameter");

    let extraArgs = (args['args'] as string) || '';
    extraArgs = extraArgs.replace(/[;&|`$(){}]/g, '');

    const safety = new SafetyChecker();
    const check = safety.checkGitOperation(action, extraArgs);
    if (check.kind !== 'safe') {
      throw new Error(
        `Safety check: ${check.reason} — git ${action} ${extraArgs} was blocked.\nIf you need this operation, run it manually in your terminal.`,
      );
    }

    try {
      let cmd = 'git';

      switch (action) {
        case 'status':
          cmd += ' status';
          break;
        case 'diff':
          cmd += ` diff ${extraArgs}`;
          break;
        case 'log':
          cmd += ` log --oneline -20 ${extraArgs}`;
          break;
        case 'add':
          cmd += ` add ${extraArgs || '.'}`;
          break;
        case 'commit':
          if (!extraArgs) {
            throw new Error(
              "Commit requires a message. Pass it in the 'args' field.",
            );
          }
          cmd += ` commit -m "${extraArgs.replace(/"/g, '\\"')}"`;
          break;
        case 'branch':
          cmd += ` branch ${extraArgs}`;
          break;
        case 'checkout':
          if (!extraArgs) {
            throw new Error(
              "Checkout requires a branch name. Pass it in the 'args' field.",
            );
          }
          cmd += ` checkout ${extraArgs}`;
          break;
        case 'run':
          if (!extraArgs) {
            throw new Error(
              "Run requires git arguments. Pass them in the 'args' field.",
            );
          }
          cmd += ` ${extraArgs}`;
          break;
        default:
          throw new Error(
            `Unknown git action: ${action}. Supported: status, diff, log, add, commit, branch, checkout, run`,
          );
      }

      const output = execSync(cmd, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (output.trim()) return output.trim();
      return `Git ${action} completed successfully`;
    } catch (e: unknown) {
      const err = e as { stderr?: string; stdout?: string; message: string };
      const errorOutput = err.stderr || err.stdout || err.message;
      throw new Error(`Git command failed: ${errorOutput}`);
    }
  }
}
