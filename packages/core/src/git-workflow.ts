import { execFileSync } from 'node:child_process';

export interface GitStatus {
  branch: string;
  modified: string[];
  staged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  hasConflicts: boolean;
}

export interface CommitSuggestion {
  type: 'feat' | 'fix' | 'refactor' | 'docs' | 'test' | 'chore';
  scope?: string;
  description: string;
  body?: string;
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

function gitSafe(args: string[], cwd: string): string | null {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

export class GitWorkflow {
  constructor(private workingDir: string) {}

  getStatus(): GitStatus {
    const branch = gitSafe(['rev-parse', '--abbrev-ref', 'HEAD'], this.workingDir) ?? 'unknown';
    const modified = (gitSafe(['diff', '--name-only'], this.workingDir) ?? '').split('\n').filter(Boolean);
    const staged = (gitSafe(['diff', '--cached', '--name-only'], this.workingDir) ?? '').split('\n').filter(Boolean);
    const untracked = (gitSafe(['ls-files', '--others', '--exclude-standard'], this.workingDir) ?? '').split('\n').filter(Boolean);

    let ahead = 0;
    let behind = 0;
    const branchInfo = gitSafe(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], this.workingDir);
    if (branchInfo) {
      const parts = branchInfo.split(/\s+/).map(Number);
      ahead = parts[0] ?? 0;
      behind = parts[1] ?? 0;
    }

    const hasConflicts = gitSafe(['diff', '--check'], this.workingDir) === null;

    return { branch, modified, staged, untracked, ahead, behind, hasConflicts };
  }

  suggestBranch(feature: string): string {
    const clean = feature
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    return `feat/${clean}`;
  }

  generateCommitMessage(diff: string): string {
    const lines = diff.split('\n');
    const changedFiles = lines
      .filter(l => l.startsWith('diff --git'))
      .map(l => l.split(' b/')[1] ?? '');

    const additions = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
    const deletions = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;

    let type: CommitSuggestion['type'] = 'chore';
    if (changedFiles.some(f => f.includes('test'))) type = 'test';
    else if (additions > deletions * 2) type = 'feat';
    else if (deletions > additions * 2) type = 'refactor';
    else if (changedFiles.some(f => f.includes('fix') || f.includes('bug'))) type = 'fix';
    else if (changedFiles.some(f => f.includes('doc') || f.endsWith('.md'))) type = 'docs';

    const description = `${type}: update ${changedFiles.length} file${changedFiles.length !== 1 ? 's' : ''}`;

    return `${description}\n\n${changedFiles.slice(0, 10).map(f => `- ${f}`).join('\n')}\n\n(+${additions}, -${deletions})`;
  }

  generatePRDescription(branch: string, commits: string): string {
    const lines = commits.split('\n').filter(Boolean);
    const type = branch.startsWith('fix') ? 'Bug fix' :
                 branch.startsWith('feat') ? 'Feature' :
                 branch.startsWith('refactor') ? 'Refactoring' : 'Update';

    return `## ${type}\n\n### Changes\n${lines.slice(0, 20).map(l => `- ${l}`).join('\n')}\n\n### Testing\n- [ ] Unit tests pass\n- [ ] Manual verification complete\n\n### Related Issues\nCloses #\n`;
  }

  createBranch(name: string): boolean {
    return gitSafe(['checkout', '-b', name], this.workingDir) !== null;
  }

  commit(message: string): boolean {
    return gitSafe(['commit', '-m', message], this.workingDir) !== null;
  }

  safeRollback(steps: number = 1): boolean {
    return gitSafe(['reset', '--soft', `HEAD~${steps}`], this.workingDir) !== null;
  }

  getWorkingDir(): string {
    return this.workingDir;
  }
}
