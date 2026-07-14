import { describe, it, expect } from 'vitest';
import {
  computeDiff,
  generateUnifiedDiff,
  applyPatch,
  computeFileDiff,
  renderTerminalDiff,
  applyMultiFilePatch,
  type Hunk,
  type FileDiff,
  type MultiFilePatch,
} from '../diff';

describe('computeDiff', () => {
  it('returns empty hunks for identical content', () => {
    const result = computeDiff('line1\nline2\nline3', 'line1\nline2\nline3');
    expect(result).toEqual([]);
  });

  it('returns empty hunks for empty identical content', () => {
    const result = computeDiff('', '');
    expect(result).toEqual([]);
  });

  it('detects added lines', () => {
    const result = computeDiff('line1\nline2', 'line1\nline2\nline3');
    expect(result.length).toBeGreaterThan(0);
    const adds = result.flatMap(h => h.lines.filter(l => l.type === 'add'));
    expect(adds.some(l => l.content === 'line3')).toBe(true);
  });

  it('detects removed lines', () => {
    const result = computeDiff('line1\nline2\nline3', 'line1\nline3');
    const removes = result.flatMap(h => h.lines.filter(l => l.type === 'remove'));
    expect(removes.some(l => l.content === 'line2')).toBe(true);
  });

  it('detects modified lines', () => {
    const result = computeDiff('line1\nline2\nline3', 'line1\nmodified\nline3');
    const removes = result.flatMap(h => h.lines.filter(l => l.type === 'remove'));
    const adds = result.flatMap(h => h.lines.filter(l => l.type === 'add'));
    expect(removes.some(l => l.content === 'line2')).toBe(true);
    expect(adds.some(l => l.content === 'modified')).toBe(true);
  });

  it('handles completely different content', () => {
    const result = computeDiff('old\ncontent', 'new\ncontent');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('generateUnifiedDiff', () => {
  it('generates unified diff format', () => {
    const result = generateUnifiedDiff('a.txt', 'b.txt', 'line1\nline2\nline3', 'line1\nmodified\nline3');
    expect(result).toContain('--- a/a.txt');
    expect(result).toContain('+++ b/b.txt');
    expect(result).toContain('@@');
    expect(result).toContain('+modified');
    expect(result).toContain('-line2');
  });

  it('returns empty string for identical content', () => {
    const result = generateUnifiedDiff('a.txt', 'b.txt', 'same', 'same');
    expect(result).toBe('');
  });

  it('produces valid unified diff headers', () => {
    const result = generateUnifiedDiff('a.txt', 'b.txt', 'a\nb\nc', 'a\nx\nc');
    expect(result).toMatch(/^---/m);
    expect(result).toMatch(/^\+\+\+/m);
    expect(result).toMatch(/^@@/m);
  });
});

describe('applyPatch', () => {
  it('applies a simple addition', () => {
    const hunks = computeDiff('line1\nline2', 'line1\nline2\nline3');
    const result = applyPatch('line1\nline2', hunks);
    expect(result.success).toBe(true);
    expect(result.patchedContent).toContain('line3');
  });

  it('applies a simple deletion', () => {
    const hunks = computeDiff('line1\nline2\nline3', 'line1\nline3');
    const result = applyPatch('line1\nline2\nline3', hunks);
    expect(result.success).toBe(true);
    expect(result.patchedContent).not.toContain('line2');
  });

  it('applies a modification', () => {
    const hunks = computeDiff('old', 'new');
    const result = applyPatch('old', hunks);
    expect(result.success).toBe(true);
    expect(result.patchedContent).toBe('new');
  });

  it('detects conflicts', () => {
    const hunks = computeDiff('expected', 'new');
    const result = applyPatch('different', hunks);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.success).toBe(false);
  });

  it('computes stats', () => {
    const hunks = computeDiff('a\nb\nc', 'a\nx\ny\nc');
    const result = applyPatch('a\nb\nc', hunks);
    expect(result.stats.added).toBe(2);
    expect(result.stats.removed).toBe(1);
  });
});

describe('computeFileDiff', () => {
  it('marks new files', () => {
    const result = computeFileDiff('new.txt', 'new.txt', '', 'content');
    expect(result.isNew).toBe(true);
    expect(result.isDeleted).toBe(false);
  });

  it('marks deleted files', () => {
    const result = computeFileDiff('old.txt', 'old.txt', 'content', '');
    expect(result.isNew).toBe(false);
    expect(result.isDeleted).toBe(true);
  });

  it('handles modified files', () => {
    const result = computeFileDiff('f.txt', 'f.txt', 'old', 'new');
    expect(result.isNew).toBe(false);
    expect(result.isDeleted).toBe(false);
    expect(result.hunks.length).toBeGreaterThan(0);
  });
});

describe('renderTerminalDiff', () => {
  it('renders diff with colors', () => {
    const diff: FileDiff = {
      oldPath: 'a.txt',
      newPath: 'b.txt',
      hunks: [{
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        lines: [{ type: 'add', content: 'new line' }, { type: 'remove', content: 'old line' }],
      }],
      isNew: false,
      isDeleted: false,
    };
    const result = renderTerminalDiff(diff);
    expect(result).toContain('a.txt');
    expect(result).toContain('b.txt');
    expect(result).toContain('new line');
    expect(result).toContain('old line');
    expect(result).toContain('\x1B[');
  });
});

describe('applyMultiFilePatch', () => {
  it('applies changes to multiple files', () => {
    const patch: MultiFilePatch = {
      files: [
        computeFileDiff('a.txt', 'a.txt', 'old a', 'new a'),
        computeFileDiff('b.txt', 'b.txt', 'old b', 'new b'),
      ],
    };
    const contents = new Map([
      ['a.txt', 'old a'],
      ['b.txt', 'old b'],
    ]);
    const result = applyMultiFilePatch(patch, contents);
    expect(result.success).toBe(true);
    expect(result.results.get('a.txt')?.patchedContent).toContain('new a');
    expect(result.results.get('b.txt')?.patchedContent).toContain('new b');
  });

  it('reports conflicts across files', () => {
    const patch: MultiFilePatch = {
      files: [
        computeFileDiff('a.txt', 'a.txt', 'expected', 'new'),
      ],
    };
    const contents = new Map([['a.txt', 'different']]);
    const result = applyMultiFilePatch(patch, contents);
    expect(result.success).toBe(false);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });
});

describe('edge cases', () => {
  it('handles empty new file', () => {
    const hunks = computeDiff('', 'content');
    expect(hunks.length).toBeGreaterThan(0);
  });

  it('handles deleting to empty', () => {
    const hunks = computeDiff('content', '');
    expect(hunks.length).toBeGreaterThan(0);
  });

  it('handles single line files', () => {
    const hunks = computeDiff('a', 'b');
    const result = applyPatch('a', hunks);
    expect(result.success).toBe(true);
    expect(result.patchedContent).toBe('b');
  });

  it('handles binary-like content with newlines', () => {
    const hunks = computeDiff('a\nb', 'a\nb');
    expect(hunks).toEqual([]);
  });

  it('handles trailing newline changes', () => {
    const hunks = computeDiff('a\n', 'a');
    const result = applyPatch('a\n', hunks);
    expect(result.success).toBe(true);
  });
});
