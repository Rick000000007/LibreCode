import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Checkpoint {
  id: string;
  version: number;
  timestamp: Date;
  description: string;
  files: Map<string, string>;
  metadata: Record<string, unknown>;
  parent?: string;
  tags?: string[];
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  targetVersion: string;
  deadline?: Date;
  checkpoints: string[];
  completed: boolean;
  completionDate?: Date;
}

function toPlainObject(map: Map<string, string>): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [k, v] of map) obj[k] = v;
  return obj;
}

export class CheckpointManager {
  private checkpoints: Checkpoint[] = [];
  private milestones: Milestone[] = [];
  private currentVersion = 0;
  private storageDir: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir ?? path.join(process.cwd(), '.rcode-checkpoints');
  }

  saveCheckpoint(description: string, files?: string[]): Checkpoint {
    const fileContents = new Map<string, string>();
    if (files) {
      for (const file of files) {
        try {
          fileContents.set(file, fs.readFileSync(file, 'utf-8'));
        } catch { /* skip missing files */ }
      }
    }

    const checkpoint: Checkpoint = {
      id: crypto.randomUUID(),
      version: ++this.currentVersion,
      timestamp: new Date(),
      description,
      files: fileContents,
      metadata: {},
      parent: this.checkpoints[this.checkpoints.length - 1]?.id,
    };

    this.checkpoints.push(checkpoint);
    this.persist(checkpoint);
    return checkpoint;
  }

  restore(checkpointId: string, targetDir?: string): number {
    const cp = this.checkpoints.find(c => c.id === checkpointId);
    if (!cp) throw new Error(`Checkpoint ${checkpointId} not found`);
    let restored = 0;
    for (const [file, content] of cp.files) {
      const outPath = targetDir ? path.join(targetDir, file) : file;
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, content, 'utf-8');
      restored++;
    }
    return restored;
  }

  createMilestone(name: string, description: string, targetVersion: string, deadline?: Date): Milestone {
    const milestone: Milestone = {
      id: crypto.randomUUID(),
      name,
      description,
      targetVersion,
      deadline,
      checkpoints: [],
      completed: false,
    };
    this.milestones.push(milestone);
    return milestone;
  }

  linkCheckpointToMilestone(milestoneId: string, checkpointId: string): boolean {
    const ms = this.milestones.find(m => m.id === milestoneId);
    const cp = this.checkpoints.find(c => c.id === checkpointId);
    if (!ms || !cp) return false;
    ms.checkpoints.push(checkpointId);
    return true;
  }

  completeMilestone(milestoneId: string): boolean {
    const ms = this.milestones.find(m => m.id === milestoneId);
    if (!ms) return false;
    ms.completed = true;
    ms.completionDate = new Date();
    return true;
  }

  getLatestCheckpoint(): Checkpoint | undefined {
    return this.checkpoints[this.checkpoints.length - 1];
  }

  listCheckpoints(tag?: string): Checkpoint[] {
    if (!tag) return [...this.checkpoints];
    return this.checkpoints.filter(c => c.tags?.includes(tag));
  }

  listMilestones(): Milestone[] {
    return [...this.milestones];
  }

  clear(): void {
    this.checkpoints = [];
    this.milestones = [];
    this.currentVersion = 0;
  }

  private persist(checkpoint: Checkpoint): void {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const data = {
        id: checkpoint.id,
        version: checkpoint.version,
        timestamp: checkpoint.timestamp.toISOString(),
        description: checkpoint.description,
        files: toPlainObject(checkpoint.files),
        metadata: checkpoint.metadata,
        parent: checkpoint.parent,
      };
      fs.writeFileSync(
        path.join(this.storageDir, `${checkpoint.id}.json`),
        JSON.stringify(data),
        'utf-8',
      );
    } catch { /* persistence is best-effort */ }
  }
}

export function createDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const lcs = buildLcs(oldLines, newLines);

  const result: string[] = [];
  let oi = 0, ni = 0, li = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi < oldLines.length && ni < newLines.length && oldLines[oi] === lcs[li] && newLines[ni] === lcs[li]) {
      result.push(` ${oldLines[oi]}`);
      oi++; ni++; li++;
    } else {
      if (oi < oldLines.length && (li >= lcs.length || oldLines[oi] !== lcs[li])) {
        result.push(`-${oldLines[oi]}`);
        oi++;
      }
      if (ni < newLines.length && (li >= lcs.length || newLines[ni] !== lcs[li])) {
        result.push(`+${newLines[ni]}`);
        ni++;
      }
    }
  }

  return result.join('\n');
}

function buildLcs(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }

  const result: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]!);
      i--; j--;
    } else if (dp[i - 1]![j]! > dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}
