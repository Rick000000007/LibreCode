import { BaseTool } from './base.js';
import { SafetyChecker } from './safety.js';
import { resolvePath, truncateText } from 'librecode-utils';
import * as fs from 'node:fs/promises';

export class EditFileTool extends BaseTool {
  name(): string {
    return 'edit_file';
  }

  description(): string {
    return 'Edit a file by replacing content. Supports exact match and fuzzy matching. Creates a backup before editing. Can perform multiple edits in one call.';
  }

  parametersSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'The exact string to find and replace (must match exactly)',
        },
        new_string: {
          type: 'string',
          description: 'The string to replace it with',
        },
        edits: {
          type: 'array',
          description:
            'Multiple edits to perform in order (alternative to old_string/new_string)',
          items: {
            type: 'object',
            properties: {
              old_string: { type: 'string' },
              new_string: { type: 'string' },
            },
            required: ['old_string', 'new_string'],
          },
        },
      },
      required: ['path'],
    };
  }

  async execute(args: Record<string, unknown>, workingDir: string): Promise<string> {
    const filePath = args['path'] as string | undefined;
    if (!filePath) throw new Error("Missing 'path' parameter");

    const fullPath = resolvePath(filePath, workingDir);

    const safety = new SafetyChecker();
    const traversalCheck = safety.checkPathTraversal(fullPath, workingDir);
    if (traversalCheck.kind !== 'safe') {
      throw new Error(
        `Safety check: ${traversalCheck.reason} — Cannot edit '${fullPath}'.`,
      );
    }

    const content = await fs.readFile(fullPath, 'utf-8').catch((e) => {
      throw new Error(`Failed to read ${fullPath}: ${e.message}`);
    });

    const backupPath = fullPath + '.bak';
    await fs.writeFile(backupPath, content, 'utf-8');

    const edits: Array<[string, string]> = [];

    if (Array.isArray(args['edits'])) {
      for (const edit of args['edits'] as Array<Record<string, unknown>>) {
        const oldStr = edit['old_string'] as string | undefined;
        const newStr = edit['new_string'] as string | undefined;
        if (!oldStr || newStr === undefined) {
          throw new Error("Missing 'old_string' or 'new_string' in edit");
        }
        edits.push([oldStr, newStr]);
      }
    } else if (
      args['old_string'] !== undefined &&
      args['new_string'] !== undefined
    ) {
      edits.push([args['old_string'] as string, args['new_string'] as string]);
    } else {
      throw new Error(
        "Provide either 'edits' array or 'old_string'/'new_string' pair",
      );
    }

    if (edits.length === 0) {
      throw new Error('No edits provided');
    }

    let currentContent = content;
    let appliedCount = 0;
    const errors: string[] = [];

    for (const [oldString, newString] of edits) {
      const count = currentContent.split(oldString).length - 1;

      if (count === 0) {
        const hint = findFuzzyMatch(currentContent, oldString);
        let msg: string;
        if (hint) {
          const [lineNum, lineContent] = hint;
          msg = `old_string not found. Possible match at line ${lineNum}: "${truncateText(lineContent, 100)}"`;
        } else {
          const snippet = suggestContext(currentContent, oldString);
          msg = `old_string not found.${snippet}`;
        }
        errors.push(msg);
        continue;
      }

      if (count > 1) {
        errors.push(
          `Found ${count} matches for old_string — provide more surrounding context to make it unique`,
        );
        continue;
      }

      currentContent = currentContent.replace(oldString, newString);
      appliedCount++;
    }

    if (appliedCount === 0) {
      await fs.unlink(backupPath).catch(() => {});
      throw new Error(errors.join('\n'));
    }

    try {
      await fs.writeFile(fullPath, currentContent, 'utf-8');
    } catch (e) {
      // Restore from backup
      await fs.writeFile(fullPath, content, 'utf-8').catch(() => {});
      await fs.unlink(backupPath).catch(() => {});
      throw new Error(`Failed to write ${fullPath}: ${(e as Error).message}`);
    }

    let result = `Successfully edited ${fullPath} (${appliedCount} edit${appliedCount === 1 ? '' : 's'}, backup at ${backupPath})`;

    if (errors.length > 0) {
      result += `\nSkipped edits:\n${errors.join('\n')}`;
    }

    return result;
  }
}

export function findFuzzyMatch(
  content: string,
  target: string,
): [number, string] | null {
  const targetTrimmed = target.trim();
  if (targetTrimmed.length < 5) return null;

  const lines = content.split('\n');

  // Exact line match (trimmed)
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === targetTrimmed) {
      return [i + 1, lines[i] ?? ''];
    }
  }

  // Whitespace-agnostic match
  const targetClean = targetTrimmed.replace(/\s+/g, '');
  if (targetClean.length >= 5) {
    for (let i = 0; i < lines.length; i++) {
      const lineClean = (lines[i] ?? '').replace(/\s+/g, '');
      if (lineClean === targetClean) {
        return [i + 1, lines[i] ?? ''];
      }
    }
  }

  // Word overlap match
  const targetWords = targetTrimmed.split(/\s+/);
  if (targetWords.length >= 2) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const matchingWords = targetWords.filter((w) => line.includes(w)).length;
      if (matchingWords / targetWords.length > 0.7) {
        return [i + 1, line];
      }
    }
  }

  return null;
}

export function suggestContext(content: string, target: string): string {
  const firstWord = target.split(/\s+/)[0]?.trim();
  if (!firstWord || firstWord.length < 3) return '';

  const lines = content.split('\n');
  const matches: Array<[number, string]> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.includes(firstWord)) {
      matches.push([i + 1, truncateText(line, 80)]);
      if (matches.length >= 3) break;
    }
  }

  if (matches.length === 0) return '';

  const suggestions = matches
    .map(([num, text]) => `  Line ${num}: ${text}`)
    .join('\n');

  return `\nSimilar lines found:\n${suggestions}`;
}
