import * as fs from 'node:fs';
import * as path from 'node:path';
import { BaseTool } from './base.js';
import { resolvePath } from 'librecode-utils';

const DEFAULT_EXTS = new Set([
  'rs', 'ts', 'js', 'jsx', 'tsx', 'py', 'go', 'java', 'c',
  'cpp', 'h', 'toml', 'json', 'yaml', 'yml', 'md', 'sql', 'sh',
]);

export class SearchCodeTool extends BaseTool {
  name(): string {
    return 'search_code';
  }

  description(): string {
    return 'Search for a regex pattern across files in the codebase. Returns matching lines with file paths and line numbers.';
  }

  parametersSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'Directory to search in (defaults to current directory)',
        },
        include: {
          type: 'string',
          description: "File pattern to include (e.g., '*.rs', '*.ts')",
        },
        max_results: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 50)',
        },
      },
      required: ['pattern'],
    };
  }

  async execute(args: Record<string, unknown>, workingDir: string): Promise<string> {
    const pattern = args['pattern'] as string | undefined;
    if (!pattern) throw new Error("Missing 'pattern' parameter");

    const searchPath = args['path'] as string | undefined;
    const include = args['include'] as string | undefined;
    const maxResults = (args['max_results'] as number) ?? 50;

    const fullPath = resolvePath(searchPath || '.', workingDir);
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'g');
    } catch {
      return `Invalid regex pattern: ${pattern}`;
    }

    const results: { file: string; line: number; text: string }[] = [];

    function matchesGlob(filename: string, glob: string): boolean {
      const reStr = '^' + glob.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      return new RegExp(reStr).test(filename);
    }

    function walkDir(dir: string): void {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(full);
        } else if (entry.isFile()) {
          if (include) {
            if (!matchesGlob(entry.name, include)) continue;
          } else {
            const ext = path.extname(entry.name).slice(1).toLowerCase();
            if (!DEFAULT_EXTS.has(ext)) continue;
          }
          try {
            const content = fs.readFileSync(full, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i]!)) {
                results.push({
                  file: path.relative(fullPath, full) || entry.name,
                  line: i + 1,
                  text: lines[i]!.trim(),
                });
                if (results.length >= maxResults) return;
                regex.lastIndex = 0;
              }
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i]!)) {
            results.push({ file: path.basename(fullPath), line: i + 1, text: lines[i]!.trim() });
            if (results.length >= maxResults) break;
            regex.lastIndex = 0;
          }
        }
      } else {
        walkDir(fullPath);
      }

      if (results.length === 0) return 'No matches found';

      const output = results.map(r => `${r.file}:${r.line}:${r.text}`).join('\n');
      const total = results.length;

      if (total >= maxResults) {
        return output + `\n\n... and ${total} total results (showing ${maxResults})`;
      }

      return output;
    } catch {
      return 'No matches found';
    }
  }
}
