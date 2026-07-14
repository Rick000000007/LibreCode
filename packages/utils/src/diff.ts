export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  hunks: Hunk[];
  isNew: boolean;
  isDeleted: boolean;
}

export interface PatchResult {
  success: boolean;
  applied: boolean;
  conflicts: PatchConflict[];
  patchedContent: string;
  stats: { added: number; removed: number; context: number };
}

export interface PatchConflict {
  hunkIndex: number;
  reason: string;
  expectedContent: string;
  actualContent: string;
}

export interface DiffOptions {
  contextLines?: number;
  colorize?: boolean;
  useColor?: boolean;
}

function normalizeLines(content: string): string[] {
  if (content === '') return [];
  const lines = content.split('\n');
  if (content.endsWith('\n') && lines.length > 1) {
    return lines.slice(0, -1).map(l => l.replace(/\r$/, ''));
  }
  return lines.map(l => l.replace(/\r$/, ''));
}

export function computeDiff(
  oldContent: string,
  newContent: string,
  options?: { contextLines?: number },
): Hunk[] {
  const oldLines = normalizeLines(oldContent);
  const newLines = normalizeLines(newContent);
  const contextLines = options?.contextLines ?? 3;

  if (oldLines.length === 0 && newLines.length === 0) return [];
  if (oldContent === newContent) return [];

  const diff = myersDiff(oldLines, newLines);
  if (diff.length === 0) return [];

  return buildHunks(diff, oldLines, newLines, contextLines);
}

export function generateUnifiedDiff(
  oldPath: string,
  newPath: string,
  oldContent: string,
  newContent: string,
  options?: { contextLines?: number },
): string {
  const hunks = computeDiff(oldContent, newContent, options);
  if (hunks.length === 0 && oldContent === newContent) return '';

  const relOld =oldPath.replace(/^.*[/\\]/, '');
  const relNew =newPath.replace(/^.*[/\\]/, '');

  const lines: string[] = [];
  lines.push(`--- a/${relOld}`);
  lines.push(`+++ b/${relNew}`);

  for (const hunk of hunks) {
    lines.push(formatHunkHeader(hunk));
    for (const line of hunk.lines) {
      switch (line.type) {
        case 'context':
          lines.push(` ${line.content}`);
          break;
        case 'add':
          lines.push(`+${line.content}`);
          break;
        case 'remove':
          lines.push(`-${line.content}`);
          break;
      }
    }
  }

  return lines.join('\n') + '\n';
}

export function applyPatch(
  content: string,
  hunks: Hunk[],
): PatchResult {
  const lines = normalizeLines(content);
  if (hunks.length === 0) {
    return {
      success: true,
      applied: true,
      conflicts: [],
      patchedContent: lines.join('\n'),
      stats: { added: 0, removed: 0, context: 0 },
    };
  }

  const conflicts: PatchConflict[] = [];
  const stats = { added: 0, removed: 0, context: 0 };
  let lineOffset = 0;
  let result = [...lines];

  for (let hi = 0; hi < hunks.length; hi++) {
    const hunk = hunks[hi]!;

    if (hunk.lines.length === 0) continue;

    const removeLines = hunk.lines.filter(l => l.type === 'remove');
    const addLines = hunk.lines.filter(l => l.type === 'add');
    const firstChangeIdx = hunk.lines.findIndex(l => l.type !== 'context');
    const lastChangeIdx = hunk.lines.map((l, i) => l.type !== 'context' ? i : -1).filter(i => i >= 0).pop() ?? firstChangeIdx;
    const contextBefore = hunk.lines.slice(0, firstChangeIdx);
    const contextAfter = hunk.lines.slice(lastChangeIdx + 1).filter(l => l.type === 'context');

    let ctxMatch = true;
    for (let i = 0; i < contextBefore.length; i++) {
      const idx = hunk.oldStart - 1 + i + lineOffset;
      const expected = contextBefore[i]!.content;
      if (idx >= lines.length || lines[idx] !== expected) {
        ctxMatch = false;
        conflicts.push({
          hunkIndex: hi,
          reason: `Context line ${i + 1} does not match before change`,
          expectedContent: expected,
          actualContent: idx < lines.length ? lines[idx]! : '<EOF>',
        });
        break;
      }
    }

    if (!ctxMatch) {
      result = [...lines];
      continue;
    }

    const changeStart = hunk.oldStart - 1 + contextBefore.length + lineOffset;
    for (let i = 0; i < removeLines.length; i++) {
      const idx = changeStart + i;
      const expected = removeLines[i]!.content;
      if (idx >= lines.length || lines[idx] !== expected) {
        conflicts.push({
          hunkIndex: hi,
          reason: `Remove line ${i + 1} does not match`,
          expectedContent: expected,
          actualContent: idx < lines.length ? lines[idx]! : '<EOF>',
        });
        break;
      }
    }

    const sliceStart = hunk.oldStart - 1 + lineOffset;
    const sliceEnd = sliceStart + contextBefore.length + removeLines.length;
    const prefix = result.slice(0, sliceStart);
    const suffix = result.slice(sliceEnd);

    result = [...prefix];
    for (const cl of contextBefore) {
      result.push(cl.content);
      stats.context++;
    }
    for (const al of addLines) {
      result.push(al.content);
      stats.added += 1;
    }
    stats.removed += removeLines.length;
    for (const cl of contextAfter) {
      result.push(cl.content);
      stats.context++;
    }
    result.push(...suffix);

    lineOffset += addLines.length - removeLines.length;
  }

  return {
    success: conflicts.length === 0,
    applied: true,
    conflicts,
    patchedContent: result.join('\n'),
    stats,
  };
}

export function computeFileDiff(
  oldPath: string,
  newPath: string,
  oldContent: string,
  newContent: string,
  options?: { contextLines?: number },
): FileDiff {
  const isNew = oldContent === '' && newContent !== '';
  const isDeleted = oldContent !== '' && newContent === '';

  let hunks: Hunk[];
  if (isNew) {
    const newLines = normalizeLines(newContent);
    hunks = [{
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: newLines.length,
      lines: newLines.map(l => ({ type: 'add' as const, content: l, newLineNum: 0 })),
    }];
  } else if (isDeleted) {
    const oldLines = normalizeLines(oldContent);
    hunks = [{
      oldStart: 1,
      oldLines: oldLines.length,
      newStart: 0,
      newLines: 0,
      lines: oldLines.map(l => ({ type: 'remove' as const, content: l, oldLineNum: 0 })),
    }];
  } else {
    hunks = computeDiff(oldContent, newContent, options);
  }

  return { oldPath, newPath, hunks, isNew, isDeleted };
}

export function renderTerminalDiff(
  diff: FileDiff,
  options?: { theme?: { add?: string; remove?: string; header?: string; context?: string; reset?: string } },
): string {
  const theme = options?.theme ?? {
    add: '\x1B[32m',
    remove: '\x1B[31m',
    header: '\x1B[36m',
    context: '\x1B[90m',
    reset: '\x1B[39m',
  };

  const lines: string[] = [];
  const relOld = diff.oldPath.replace(/^.*[/\\]/, '');
  const relNew = diff.newPath.replace(/^.*[/\\]/, '');

  if (!diff.isNew && !diff.isDeleted) {
    lines.push(`${theme.header}─── ${relOld} → ${relNew} ───${theme.reset}`);
  } else {
    lines.push(`${theme.header}─── ${diff.isNew ? relNew : relOld} ───${theme.reset}`);
  }

  for (const hunk of diff.hunks) {
    lines.push(`${theme.header}@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${theme.reset}`);
    for (const line of hunk.lines) {
      switch (line.type) {
        case 'add':
          lines.push(`${theme.add}+${line.content}${theme.reset}`);
          break;
        case 'remove':
          lines.push(`${theme.remove}-${line.content}${theme.reset}`);
          break;
        case 'context':
          lines.push(`${theme.context} ${line.content}${theme.reset}`);
          break;
      }
    }
  }

  return lines.join('\n');
}

export interface MultiFilePatch {
  files: FileDiff[];
}

export interface MultiFilePatchResult {
  success: boolean;
  results: Map<string, PatchResult>;
  conflicts: Array<{ file: string; hunkIndex: number; reason: string }>;
}

export function applyMultiFilePatch(
  patch: MultiFilePatch,
  fileContents: Map<string, string>,
): MultiFilePatchResult {
  const results = new Map<string, PatchResult>();
  const allConflicts: Array<{ file: string; hunkIndex: number; reason: string }> = [];

  for (const fd of patch.files) {
    const content = fileContents.get(fd.newPath) ?? fileContents.get(fd.oldPath) ?? '';
    const result = applyPatch(content, fd.hunks);

    if (fd.isNew) {
      const lines = fd.hunks[0]?.lines ?? [];
      const newContent = lines.map(l => l.content).join('\n');
      results.set(fd.newPath, {
        success: true,
        applied: true,
        conflicts: [],
        patchedContent: newContent,
        stats: { added: lines.length, removed: 0, context: 0 },
      });
    } else {
      results.set(fd.newPath, result);
      if (!result.success) {
        for (const c of result.conflicts) {
          allConflicts.push({ file: fd.newPath, hunkIndex: c.hunkIndex, reason: c.reason });
        }
      }
    }
  }

  return {
    success: allConflicts.length === 0,
    results,
    conflicts: allConflicts,
  };
}

function myersDiff(oldLines: string[], newLines: string[]): Array<{ type: 'keep' | 'remove' | 'add'; oldIdx: number; newIdx: number }> {
  const oldN = oldLines.length;
  const newN = newLines.length;
  const max = oldN + newN;
  const offset = max;
  const v = new Int32Array(2 * max + 1);
  const trace: Int32Array[] = [];

  v[offset + 1] = 0;
  for (let d = 0; d <= max; d++) {
    const snapshot = new Int32Array(v);
    trace.push(snapshot);

    for (let k = -d; k <= d; k += 2) {
      const idx = k + offset;
      let x: number;
      if (k === -d || (k !== d && (v[idx - 1] ?? -1) < (v[idx + 1] ?? -1))) {
        x = v[idx + 1] ?? 0;
      } else {
        x = (v[idx - 1] ?? 0) + 1;
      }
      let y = x - k;

      while (x < oldN && y < newN && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }

      v[idx] = x;

      if (x >= oldN && y >= newN) {
        return backtrack(oldLines, newLines, trace, offset, d);
      }
    }
  }

  return [];
}

function backtrack(
  oldLines: string[],
  newLines: string[],
  trace: Int32Array[],
  offset: number,
  maxD: number,
): Array<{ type: 'keep' | 'remove' | 'add'; oldIdx: number; newIdx: number }> {
  const ops: Array<{ type: 'keep' | 'remove' | 'add'; oldIdx: number; newIdx: number }> = [];
  let x = oldLines.length;
  let y = newLines.length;

  for (let d = maxD; d >= 0; d--) {
    const v = trace[d]!;
    const k = x - y;
    const idx = k + offset;

    let prevK: number;
    let prevX: number;
    let prevY: number;

    const goDown = k === -d || (k !== d && (v[idx - 1] ?? -1) < (v[idx + 1] ?? -1));
    if (goDown) {
      prevK = k + 1;
      prevX = v[idx + 1] ?? 0;
      prevY = prevX - prevK;
    } else {
      prevK = k - 1;
      prevX = v[idx - 1] ?? 0;
      prevY = prevX - prevK;
    }

    while (x > prevX && y > prevY) {
      ops.push({ type: 'keep', oldIdx: x - 1, newIdx: y - 1 });
      x--;
      y--;
    }

    if (d > 0) {
      if (goDown) {
        ops.push({ type: 'add', oldIdx: prevX, newIdx: prevY });
        y--;
      } else {
        ops.push({ type: 'remove', oldIdx: x - 1, newIdx: y });
        x--;
      }
    }
  }

  return ops.reverse();
}

function buildHunks(
  diff: Array<{ type: 'keep' | 'remove' | 'add'; oldIdx: number; newIdx: number }>,
  oldLines: string[],
  newLines: string[],
  contextLines: number,
): Hunk[] {
  const hunks: Hunk[] = [];
  let i = 0;

  while (i < diff.length) {
    while (i < diff.length && diff[i]!.type === 'keep') i++;
    if (i >= diff.length) break;

    const start = Math.max(0, i - contextLines);
    const hunkLines: DiffLine[] = [];
    const oldLineStart = diff[start]!.oldIdx + 1;
    const newLineStart = diff[start]!.newIdx + 1;

    let oldCount = 0;
    let newCount = 0;

    for (let j = start; j < diff.length && (j < i + contextLines || diff[j]!.type !== 'keep'); j++) {
      if (j >= diff.length || (j > i + contextLines && j > start && diff[j]!.type === 'keep' && diff[j - 1]?.type === 'keep')) {
        break;
      }
      const op = diff[j]!;
      const content = op.type === 'add' ? (newLines[op.newIdx] ?? '') : (oldLines[op.oldIdx] ?? '');

      switch (op.type) {
        case 'keep':
          hunkLines.push({ type: 'context', content, oldLineNum: op.oldIdx + 1, newLineNum: op.newIdx + 1 });
          oldCount++;
          newCount++;
          break;
        case 'add':
          hunkLines.push({ type: 'add', content, newLineNum: op.newIdx + 1 });
          newCount++;
          break;
        case 'remove':
          hunkLines.push({ type: 'remove', content, oldLineNum: op.oldIdx + 1 });
          oldCount++;
          break;
      }
    }

    hunks.push({
      oldStart: oldLineStart,
      oldLines: oldCount,
      newStart: newLineStart,
      newLines: newCount,
      lines: hunkLines,
    });

    i += contextLines;
    while (i < diff.length && diff[i]!.type !== 'keep') i++;
  }

  return hunks;
}

function formatHunkHeader(hunk: Hunk): string {
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
}

// Re-export formatUnifiedDiff with a cleaner name for rendering
export { formatHunkHeader };
