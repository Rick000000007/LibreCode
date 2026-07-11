import { BaseTool } from './index.js';
import { resolvePath } from '@librecode/utils';
import { execSync } from 'node:child_process';

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

    try {
      let cmd = 'grep -rn';

      if (include) {
        cmd += ` --include='${include.replace(/'/g, "'\\''")}'`;
      } else {
        const exts = [
          'rs', 'ts', 'js', 'jsx', 'tsx', 'py', 'go', 'java', 'c',
          'cpp', 'h', 'toml', 'json', 'yaml', 'yml', 'md', 'sql', 'sh',
        ];
        cmd += exts.map((ext) => ` --include='*.${ext}'`).join('');
      }

      cmd += ` --regexp='${pattern.replace(/'/g, "'\\''")}' '${fullPath.replace(/'/g, "'\\''")}' 2>/dev/null || true`;

      const output = execSync(cmd, { encoding: 'utf-8', timeout: 60000, maxBuffer: 10 * 1024 * 1024 });

      if (!output.trim()) return 'No matches found';

      const lines = output.trim().split('\n');
      const total = lines.length;
      const shown = lines.slice(0, maxResults);

      let result = shown.join('\n');
      if (total > maxResults) {
        result += `\n\n... and ${total - maxResults} more results (showing ${maxResults} of ${total})`;
      }

      return result;
    } catch {
      return 'No matches found';
    }
  }
}
