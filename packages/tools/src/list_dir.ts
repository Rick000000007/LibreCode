import { BaseTool } from './index.js';
import { resolvePath, formatSize } from 'librecode-utils';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class ListDirTool extends BaseTool {
  name(): string {
    return 'list_directory';
  }

  description(): string {
    return 'List files and directories at the given path. Returns a tree-like listing.';
  }

  parametersSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list (defaults to current directory)',
        },
        max_depth: {
          type: 'integer',
          description: 'Maximum directory depth to traverse (default: 2)',
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, workingDir: string): Promise<string> {
    const dirPath = (args['path'] as string) || '.';
    const maxDepth = (args['max_depth'] as number) || 2;

    const fullPath = resolvePath(dirPath, workingDir);

    const entries = this.walkDir(fullPath, '', 0, maxDepth);

    if (entries.length === 0) return '(empty directory)';
    return entries.join('\n');
  }

  private walkDir(
    dir: string,
    prefix: string,
    depth: number,
    maxDepth: number,
  ): string[] {
    if (depth >= maxDepth) return [];

    const entries: string[] = [];

    let items: fs.Dirent[];
    try {
      items = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => !e.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return entries;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const isLast = i === items.length - 1;
      const connector = isLast ? '└── ' : '├── ';

      if (item.isDirectory()) {
        entries.push(`${prefix}${connector}${item.name}/`);
        const newPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
        const sub = this.walkDir(
          path.join(dir, item.name),
          newPrefix,
          depth + 1,
          maxDepth,
        );
        entries.push(...sub);
      } else {
        let sizeStr = '';
        try {
          const stat = fs.statSync(path.join(dir, item.name));
          sizeStr = ` (${formatSize(stat.size)})`;
        } catch {
          // skip size
        }
        entries.push(`${prefix}${connector}${item.name}${sizeStr}`);
      }
    }

    return entries;
  }
}
