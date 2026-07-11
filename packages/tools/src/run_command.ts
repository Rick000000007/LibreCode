import { BaseTool } from './index.js';
import { SafetyChecker } from './safety.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export class RunCommandTool extends BaseTool {
  name(): string {
    return 'run_command';
  }

  description(): string {
    return 'Execute a shell command and return its output. Use for running builds, tests, git commands, etc.';
  }

  parametersSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        timeout_seconds: {
          type: 'integer',
          description: 'Timeout in seconds (default: 60, max: 300)',
        },
      },
      required: ['command'],
    };
  }

  async execute(args: Record<string, unknown>, workingDir: string): Promise<string> {
    const command = args['command'] as string | undefined;
    if (!command) throw new Error("Missing 'command' parameter");

    const timeoutSec = Number(args['timeout_seconds'] ?? 60);
    const timeout = Number.isFinite(timeoutSec) ? Math.min(timeoutSec, 300) : 60;

    const safety = new SafetyChecker();
    const check = safety.checkCommand(command);
    if (check.kind === 'blocked' || check.kind === 'warning') {
      throw new Error(
        `Safety check: ${check.reason} — Command '${command}' was blocked.\nIf you need this command, run it manually in your terminal.`,
      );
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout: timeout * 1000,
        maxBuffer: 10 * 1024 * 1024,
      });

      let output = '';
      if (stdout) output += stdout;
      if (stderr) {
        if (output) output += '\n--- stderr ---\n';
        output += stderr;
      }

      if (!output) output = 'Command completed successfully';

      // Truncate long output
      const maxLen = 10000;
      if (output.length > maxLen) {
        output = output.slice(0, maxLen) + `\n\n... output truncated (${output.length} bytes total)`;
      }

      return output;
    } catch (e: unknown) {
      const err = e as { killed?: boolean; signal?: string; stdout?: string; stderr?: string };
      if (err.killed) {
        throw new Error(`Command timed out after ${timeout} seconds`);
      }
      let output = '';
      if (err.stdout) output += err.stdout;
      if (err.stderr) {
        if (output) output += '\n--- stderr ---\n';
        output += err.stderr;
      }
      if (!output) {
        throw new Error(`Failed to execute command: ${(e as Error).message}`);
      }
      return output;
    }
  }
}
