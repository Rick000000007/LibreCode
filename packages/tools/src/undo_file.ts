import { BaseTool } from './index.js';
import { resolvePath } from '@rcode/utils';
import * as fs from 'node:fs/promises';

export class UndoFileTool extends BaseTool {
  name(): string {
    return 'undo_edit';
  }

  description(): string {
    return 'Undo the last edit to a file by restoring from backup.';
  }

  parametersSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file to restore (will restore from .bak backup)',
        },
      },
      required: ['path'],
    };
  }

  async execute(args: Record<string, unknown>, workingDir: string): Promise<string> {
    const filePath = args['path'] as string | undefined;
    if (!filePath) throw new Error("Missing 'path' parameter");

    const fullPath = resolvePath(filePath, workingDir);
    const backupPath = fullPath + '.bak';

    try {
      await fs.access(backupPath);
    } catch {
      throw new Error(`No backup found for ${fullPath} at ${backupPath}`);
    }

    const backupContent = await fs.readFile(backupPath, 'utf-8');
    const lineCount = backupContent.split('\n').length;

    await fs.copyFile(backupPath, fullPath);
    await fs.unlink(backupPath);

    return `Restored ${fullPath} from backup (${lineCount} lines)`;
  }
}
