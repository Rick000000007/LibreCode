import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export const SAFE_TOOLS = [
  'read_file',
  'list_directory',
  'search_code',
  'web_fetch',
  'undo_edit',
];

export type PermissionLevel = 'allow' | 'deny' | 'always_allow';

interface PermissionStore {
  tools: Record<string, PermissionLevel>;
}

export class PermissionChecker {
  private permissions: Map<string, PermissionLevel> = new Map();
  private storePath: string;
  private autoApprove: boolean;

  constructor(autoApprove: boolean) {
    this.autoApprove = autoApprove;
    this.storePath = path.join(os.homedir(), '.config', 'rcode', 'permissions.json');
    this.loadStore();
  }

  private loadStore(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const content = fs.readFileSync(this.storePath, 'utf-8');
        const store = JSON.parse(content) as PermissionStore;
        if (store.tools) {
          for (const [key, val] of Object.entries(store.tools)) {
            this.permissions.set(key, val);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private saveStore(): void {
    try {
      const store: PermissionStore = {
        tools: Object.fromEntries(this.permissions),
      };
      const dir = path.dirname(this.storePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  }

  check(toolName: string, _args: Record<string, unknown>): boolean {
    if (SAFE_TOOLS.includes(toolName)) {
      return true;
    }

    if (this.autoApprove) {
      return true;
    }

    const level = this.permissions.get(toolName);
    if (level === 'always_allow') return true;
    if (level === 'deny') return false;

    return this.promptUser(toolName, _args);
  }

  private promptUser(toolName: string, args: Record<string, unknown>): boolean {
    if (process.env['RCODE_NO_PERMISSION_PROMPT']) {
      return true;
    }

    const description = this.describeAction(toolName, args);

    console.error('\n' + `  Tool: ${toolName}`);
    console.error(`  Action: ${description}`);
    console.error('  Allow? (y/N): ');

    if (!process.stdin.isTTY) {
      return true;
    }

    try {
      const buf = Buffer.alloc(1024);
      const bytesRead = fs.readSync(process.stdin.fd, buf, 0, 1024, null);
      const answer = buf.toString('utf-8', 0, bytesRead).trim().toLowerCase();
      return answer === 'y' || answer === 'yes';
    } catch {
      return true;
    }
  }

  setAlwaysAllow(toolName: string): void {
    this.permissions.set(toolName, 'always_allow');
    this.saveStore();
  }

  setDeny(toolName: string): void {
    this.permissions.set(toolName, 'deny');
    this.saveStore();
  }

  resetTool(toolName: string): void {
    this.permissions.delete(toolName);
    this.saveStore();
  }

  listPermissions(): Record<string, PermissionLevel> {
    return Object.fromEntries(this.permissions);
  }

  private describeAction(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case 'run_command': {
        const cmd = (args['command'] as string) ?? 'unknown';
        const extra = (args['args'] as string) ?? '';
        if (extra) return `Run command: ${cmd} ${extra}`;
        return `Run command: ${cmd}`;
      }
      case 'write_file': {
        const filePath = (args['path'] as string) ?? 'unknown';
        const content = (args['content'] as string) ?? '';
        const preview = content.length > 80 ? content.slice(0, 80) + '...' : content;
        return `Write to ${filePath}: "${preview}"`;
      }
      case 'edit_file': {
        const filePath = (args['path'] as string) ?? 'unknown';
        const oldStr = (args['old_string'] as string) ?? '';
        const newStr = (args['new_string'] as string) ?? '';
        const oldPreview = oldStr.length > 40 ? oldStr.slice(0, 40) + '...' : oldStr;
        const newPreview = newStr.length > 40 ? newStr.slice(0, 40) + '...' : newStr;
        return `Edit ${filePath}: replace "${oldPreview}" with "${newPreview}"`;
      }
      case 'git': {
        const action = (args['action'] as string) ?? 'unknown';
        const extra = (args['args'] as string) ?? '';
        if (extra) return `Git ${action} ${extra}`;
        return `Git ${action}`;
      }
      default:
        return `Execute ${toolName}`;
    }
  }
}
