import type { FileDiff, MultiFilePatch } from './diff';

export interface RendererTheme {
  header: string;
  add: string;
  remove: string;
  context: string;
  hunkHeader: string;
  reset: string;
  dim: string;
}

const defaultTheme: RendererTheme = {
  header: '\x1b[1;36m',
  add: '\x1b[32m',
  remove: '\x1b[31m',
  context: '\x1b[90m',
  hunkHeader: '\x1b[34m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
};

export function renderFileDiff(diff: FileDiff, theme?: Partial<RendererTheme>): string {
  const t = { ...defaultTheme, ...theme };
  const lines: string[] = [];
  const label = diff.isNew ? diff.newPath : diff.isDeleted ? diff.oldPath : `${diff.oldPath} → ${diff.newPath}`;

  lines.push(`${t.header}━━━ ${label} ${diff.isNew ? '(new)' : diff.isDeleted ? '(deleted)' : ''}${t.reset}`);

  for (const hunk of diff.hunks) {
    if (hunk.lines.length === 0) continue;
    lines.push(`${t.hunkHeader}@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${t.reset}`);

    for (const line of hunk.lines) {
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      const color = line.type === 'add' ? t.add : line.type === 'remove' ? t.remove : t.context;
      lines.push(`${color}${prefix}${line.content}${t.reset}`);
    }
  }

  return lines.join('\n');
}

export function renderMultiFilePatch(patch: MultiFilePatch, theme?: Partial<RendererTheme>): string {
  const parts = patch.files.map(f => renderFileDiff(f, theme));
  return parts.join('\n\n');
}

export function renderDiffSummary(patch: MultiFilePatch): string {
  const files = patch.files.length;
  const totalAdds = patch.files.reduce((s, f) =>
    s + f.hunks.reduce((h, hk) => h + hk.lines.filter(l => l.type === 'add').length, 0),
  0);
  const totalRemoves = patch.files.reduce((s, f) =>
    s + f.hunks.reduce((h, hk) => h + hk.lines.filter(l => l.type === 'remove').length, 0),
  0);

  const fileList = patch.files.map(f => {
    const label = f.isNew ? '(new)' : f.isDeleted ? '(deleted)' : '(modified)';
    return `  ${f.newPath} ${label}`;
  }).join('\n');

  return `📦 ${files} file${files !== 1 ? 's' : ''}, ${totalAdds} additions, ${totalRemoves} deletions\n${fileList}\n`;
}
