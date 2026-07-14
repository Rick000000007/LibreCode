import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { resolvePath, truncateText } from 'librecode-utils';
import {
  computeFileDiff,
  renderTerminalDiff,
  applyMultiFilePatch,
  type FileDiff,
  type MultiFilePatch,
  type MultiFilePatchResult,
} from 'librecode-utils';
import { SafetyChecker } from './safety.js';

export type DiffApprovalDecision = 'approve_all' | 'reject_all' | 'approve_file' | 'reject_file';

export interface DiffApprovalOptions {
  autoApprove?: boolean;
  promptFn?: (diffs: FileDiff[]) => Promise<DiffApprovalDecision[]>;
}

interface PendingChange {
  filePath: string;
  originalContent: string;
  newContent: string;
  diff: FileDiff;
}

export class DiffApprovalManager {
  private pendingChanges: Map<string, PendingChange> = new Map();
  private options: Required<DiffApprovalOptions>;

  constructor(options?: DiffApprovalOptions) {
    this.options = {
      autoApprove: false,
      promptFn: this.defaultPrompt.bind(this),
      ...options,
    };
  }

  async prepareWrite(filePath: string, content: string, workingDir: string): Promise<string> {
    const fullPath = resolvePath(filePath, workingDir);
    let originalContent = '';

    try {
      originalContent = await fsp.readFile(fullPath, 'utf-8');
    } catch {
      originalContent = '';
    }

    const diff = computeFileDiff(fullPath, fullPath, originalContent, content);

    this.pendingChanges.set(fullPath, {
      filePath: fullPath,
      originalContent,
      newContent: content,
      diff,
    });

    const displayDiff = renderTerminalDiff(diff);
    return `Changes pending for ${fullPath}. Awaiting approval. Preview:\n${displayDiff}`;
  }

  async prepareEdit(
    filePath: string,
    edits: Array<[string, string]>,
    workingDir: string,
  ): Promise<string> {
    const fullPath = resolvePath(filePath, workingDir);
    const content = await fsp.readFile(fullPath, 'utf-8').catch(() => '');

    let currentContent = content;
    for (const [oldStr, newStr] of edits) {
      if (currentContent.includes(oldStr)) {
        currentContent = currentContent.replace(oldStr, newStr);
      }
    }

    const diff = computeFileDiff(fullPath, fullPath, content, currentContent);

    this.pendingChanges.set(fullPath, {
      filePath: fullPath,
      originalContent: content,
      newContent: currentContent,
      diff,
    });

    const displayDiff = renderTerminalDiff(diff);
    return `Changes pending for ${fullPath}. Awaiting approval. Preview:\n${displayDiff}`;
  }

  getPendingDiffs(): FileDiff[] {
    return Array.from(this.pendingChanges.values()).map(p => p.diff);
  }

  getPendingChanges(): PendingChange[] {
    return Array.from(this.pendingChanges.values());
  }

  hasPendingChanges(): boolean {
    return this.pendingChanges.size > 0;
  }

  async requestApproval(): Promise<boolean> {
    if (this.pendingChanges.size === 0) return true;
    if (this.options.autoApprove) {
      return this.applyAll();
    }

    const diffs = this.getPendingDiffs();
    const decisions = await this.options.promptFn(diffs);

    if (decisions.length === 0) return false;

    const firstDecision = decisions[0];
    if (!firstDecision) return false;

    switch (firstDecision) {
      case 'approve_all':
        return this.applyAll();
      case 'reject_all':
        this.pendingChanges.clear();
        return false;
      case 'approve_file': {
        const approved = await this.applyApproved(diffs);
        return approved;
      }
      case 'reject_file': {
        this.pendingChanges.clear();
        return false;
      }
      default:
        return false;
    }
  }

  private async applyAll(): Promise<boolean> {
    const patch: MultiFilePatch = {
      files: this.getPendingDiffs(),
    };

    const fileContents = new Map<string, string>();
    for (const [filePath, pending] of this.pendingChanges) {
      fileContents.set(filePath, pending.originalContent);
    }

    const result = applyMultiFilePatch(patch, fileContents);
    if (!result.success) {
      this.pendingChanges.clear();
      return false;
    }

    for (const [filePath, fileResult] of result.results) {
      const dir = path.dirname(filePath);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(filePath, fileResult.patchedContent, 'utf-8');
    }

    this.pendingChanges.clear();
    return true;
  }

  private async applyApproved(diffs: FileDiff[]): Promise<boolean> {
    const pending = this.getPendingChanges();
    let allApplied = true;

    for (const p of pending) {
      const safety = new SafetyChecker();
      const writeCheck = safety.checkWrite(p.filePath, p.newContent.length);
      if (writeCheck.kind === 'blocked') {
        allApplied = false;
        continue;
      }

      const dir = path.dirname(p.filePath);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(p.filePath, p.newContent, 'utf-8');
    }

    this.pendingChanges.clear();
    return allApplied;
  }

  cancelAll(): void {
    this.pendingChanges.clear();
  }

  private async defaultPrompt(diffs: FileDiff[]): Promise<DiffApprovalDecision[]> {
    console.error('\n\x1b[1;33m─── Changes Pending Approval ───\x1b[0m');

    for (const diff of diffs) {
      console.error(renderTerminalDiff(diff));
    }

    console.error('\n\x1b[1;36mApprove all changes? [y/N/a/d]\x1b[0m');
    console.error('  y = approve all');
    console.error('  N = reject all');
    console.error('  a = approve individual files');
    console.error('  d = show detailed diff per file');

    try {
      const buf = Buffer.alloc(1024);
      const bytesRead = fs.readSync(process.stdin.fd, buf, 0, 1024, null);
      const answer = buf.toString('utf-8', 0, bytesRead).trim().toLowerCase();

      switch (answer) {
        case 'y':
        case 'yes':
          return ['approve_all'];
        case 'n':
        case 'no':
          return ['reject_all'];
        case 'a':
          return ['approve_file'];
        default:
          return ['reject_all'];
      }
    } catch {
      return ['approve_all'];
    }
  }
}
