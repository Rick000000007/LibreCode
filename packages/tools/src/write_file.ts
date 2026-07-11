import { BaseTool } from './base.js';
import { SafetyChecker } from './safety.js';
import { resolvePath } from 'librecode-utils';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class WriteFileTool extends BaseTool {
  name(): string {
    return 'write_file';
  }

  description(): string {
    return 'Write content to a file at the given path. Creates the file if it does not exist, overwrites if it does.';
  }

  parametersSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['path', 'content'],
    };
  }

  async execute(args: Record<string, unknown>, workingDir: string): Promise<string> {
    const filePath = args['path'] as string | undefined;
    const content = args['content'] as string | undefined;

    if (!filePath) throw new Error("Missing 'path' parameter");
    if (content === undefined) throw new Error("Missing 'content' parameter");

    const fullPath = resolvePath(filePath, workingDir);
    const safety = new SafetyChecker();

    const writeCheck = safety.checkWrite(fullPath, content.length);
    if (writeCheck.kind === 'blocked') {
      throw new Error(
        `Safety check: ${writeCheck.reason} — Write to '${fullPath}' was blocked.`,
      );
    }
    if (writeCheck.kind === 'warning') {
      throw new Error(
        `Safety check: ${writeCheck.reason} — Write to '${fullPath}' was blocked.\nIf you need to write this file, do it manually.`,
      );
    }

    const traversalCheck = safety.checkPathTraversal(fullPath, workingDir);
    if (traversalCheck.kind !== 'safe') {
      throw new Error(
        `Safety check: ${traversalCheck.reason} — Cannot write to '${fullPath}'.`,
      );
    }

    const parentDir = path.dirname(fullPath);
    await fs.mkdir(parentDir, { recursive: true });

    await fs.writeFile(fullPath, content, 'utf-8');

    const lines = content.split('\n').length;
    return `Successfully wrote ${content.length} bytes (${lines} lines) to ${fullPath}`;
  }
}
