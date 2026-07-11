import { BaseTool } from './index.js';
import { resolvePath, isBinary } from '@rcode/utils';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const MAX_FILE_SIZE = 1_000_000;

export class ReadFileTool extends BaseTool {
  name(): string {
    return 'read_file';
  }

  description(): string {
    return 'Read the contents of a file at the given path. Returns the file content with line numbers. Rejects binary files and files larger than 1MB.';
  }

  parametersSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to read',
        },
        start_line: {
          type: 'integer',
          description: 'Line number to start reading from (1-indexed, optional)',
        },
        end_line: {
          type: 'integer',
          description: 'Line number to stop reading at (inclusive, optional)',
        },
      },
      required: ['path'],
    };
  }

  async execute(args: Record<string, unknown>, workingDir: string): Promise<string> {
    const filePath = args['path'] as string | undefined;
    if (!filePath) return Promise.reject(new Error("Missing 'path' parameter"));

    const fullPath = resolvePath(filePath, workingDir);

    const stat = await fs.stat(fullPath).catch((e) => {
      throw new Error(`Failed to stat ${fullPath}: ${e.message}`);
    });

    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${fullPath} (${stat.size} bytes, max ${MAX_FILE_SIZE} bytes)`,
      );
    }

    const bytes = await fs.readFile(fullPath).catch((e) => {
      throw new Error(`Failed to read ${fullPath}: ${e.message}`);
    });

    if (isBinary(new Uint8Array(bytes))) {
      throw new Error(`File appears to be binary: ${fullPath}`);
    }

    const content = bytes.toString('utf-8');
    const lines = content.split('\n');
    const start = ((args['start_line'] as number) ?? 1) - 1;
    const end = (args['end_line'] as number) ?? lines.length;

    const selected = lines
      .slice(Math.max(0, start), Math.min(end, lines.length))
      .map((line, i) => `${start + i + 1}: ${line}`);

    return selected.join('\n');
  }
}
