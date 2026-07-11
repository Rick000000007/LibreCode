import { resolvePath } from '@librecode/utils';
import * as path from 'node:path';

const MAX_WRITE_BYTES = 1_000_000;

const DANGEROUS_COMMANDS: Array<[string, string]> = [
  ['rm -rf /', 'Recursive deletion of root filesystem'],
  ['rm -rf /*', 'Recursive deletion of root filesystem'],
  ['rm -rf ~', 'Recursive deletion of home directory'],
  ['rm -rf .', 'Recursive deletion of current directory'],
  ['dd if=', 'Raw disk write'],
  ['mkfs.', 'Format disk partition'],
  ['chmod -R 777', 'Overly permissive recursive chmod'],
  ['eval ', 'Dynamic code evaluation'],
  ['sudo rm', 'Sudo deletion'],
  ['sudo mv /', 'Sudo move to system paths'],
  ['sudo chmod', 'Sudo permission change'],
  ['sudo chown', 'Sudo ownership change'],
  [':(){ :|:& };:', 'Fork bomb'],
  ['nc -l', 'Open network listener'],
  ['python -m http.server', 'Start HTTP server (potential data exposure)'],
];

const DESTRUCTIVE_GIT: Array<[string, string]> = [
  ['push --force', 'Force push — overwrites remote history'],
  ['push -f', 'Force push — overwrites remote history'],
  ['reset --hard', 'Hard reset — discards all uncommitted changes'],
  ['clean -fd', 'Force clean — deletes untracked files'],
  ['clean -f', 'Force clean — deletes untracked files'],
  ['branch -D', 'Force delete branch — loses unmerged commits'],
  ['checkout -- .', 'Discard all working directory changes'],
  ['checkout -- *', 'Discard all working directory changes'],
  ['restore --staged .', 'Unstage all changes'],
  ['rebase --abort', 'Abort ongoing rebase'],
  ['rebase -i', 'Interactive rebase — rewrites history'],
];

const SENSITIVE_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/root/.ssh',
  '/.git/config',
];

export type SafetyLevel =
  | { kind: 'safe' }
  | { kind: 'warning'; reason: string }
  | { kind: 'blocked'; reason: string };

export class SafetyChecker {
  private maxWriteBytes: number;

  constructor(maxWriteBytes?: number) {
    this.maxWriteBytes = maxWriteBytes ?? MAX_WRITE_BYTES;
  }

  checkCommand(command: string): SafetyLevel {
    const lower = command.toLowerCase().trim();

    if (lower.includes('|')) {
      const parts = lower.split('|');
      if (parts.length > 1) {
        const downloadTool = (p: string): boolean => {
          const t = p.trim();
          return t.includes('curl') || t.includes('wget');
        };
        const shellTool = (p: string): boolean => {
          const t = p.trim();
          return t === 'sh' || t.startsWith('sh ') || t === 'bash' || t.startsWith('bash ') || t === 'zsh' || t.startsWith('zsh ');
        };
        for (let i = 0; i < parts.length; i++) {
          if (downloadTool(parts[i] ?? '')) {
            for (let j = 0; j < parts.length; j++) {
              if (i !== j && shellTool(parts[j] ?? '')) {
                return { kind: 'warning', reason: 'Pipe remote script to shell' };
              }
            }
          }
        }
      }
    }

    for (const [pattern, reason] of DANGEROUS_COMMANDS) {
      if (lower.includes(pattern)) {
        return { kind: 'warning', reason };
      }
    }

    if (lower.startsWith('sudo ')) {
      return { kind: 'warning', reason: 'Command uses sudo' };
    }

    return { kind: 'safe' };
  }

  checkGitOperation(action: string, args: string): SafetyLevel {
    const combinedLower = `${action} ${args}`.toLowerCase();
    const combinedPreserve = `${action} ${args}`;

    for (const [pattern, reason] of DESTRUCTIVE_GIT) {
      const hasUppercase = pattern.split('').some((c) => c !== c.toLowerCase());
      const matches = hasUppercase
        ? combinedPreserve.includes(pattern)
        : combinedLower.includes(pattern);

      if (matches) {
        return { kind: 'warning', reason };
      }
    }

    return { kind: 'safe' };
  }

  checkWrite(filePath: string, contentLen: number): SafetyLevel {
    if (contentLen > this.maxWriteBytes) {
      return {
        kind: 'blocked',
        reason: `Write size ${contentLen} bytes exceeds limit of ${this.maxWriteBytes} bytes`,
      };
    }

    for (const sensitive of SENSITIVE_PATHS) {
      if (filePath.startsWith(sensitive) || filePath === sensitive) {
        return {
          kind: 'warning',
          reason: `Writing to sensitive path: ${filePath}`,
        };
      }
    }

    return { kind: 'safe' };
  }

  checkPathTraversal(filePath: string, workingDir: string): SafetyLevel {
    const resolved = resolvePath(filePath, workingDir);

    if (resolved.includes('..') || resolved.includes('..\\')) {
      return { kind: 'warning', reason: 'Path contains parent directory reference (..)' };
    }

    const normalizedFile = path.resolve(resolved);
    const normalizedWork = path.resolve(workingDir);

    if (!normalizedFile.startsWith(normalizedWork + path.sep) && normalizedFile !== normalizedWork) {
      return {
        kind: 'warning',
        reason: `Path escapes working directory: ${normalizedFile}`,
      };
    }

    return { kind: 'safe' };
  }
}
