import type { ToolDefinition } from 'librecode-types';
import { ReadFileTool } from './read_file.js';
import { WriteFileTool } from './write_file.js';
import { EditFileTool } from './edit_file.js';
import { UndoFileTool } from './undo_file.js';
import { ListDirTool } from './list_dir.js';
import { SearchCodeTool } from './search_code.js';
import { RunCommandTool } from './run_command.js';
import { GitTool } from './git.js';
import { WebFetchTool } from './web_fetch.js';

import type { Tool } from './base.js';
export type { Tool } from './base.js';
export { BaseTool } from './base.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name(), tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  definitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition());
  }

  async execute(name: string, args: Record<string, unknown>, workingDir: string): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(args, workingDir);
  }

  static defaultRegistry(): ToolRegistry {
    const registry = new ToolRegistry();
    registry.register(new ReadFileTool());
    registry.register(new WriteFileTool());
    registry.register(new EditFileTool());
    registry.register(new UndoFileTool());
    registry.register(new ListDirTool());
    registry.register(new SearchCodeTool());
    registry.register(new RunCommandTool());
    registry.register(new GitTool());
    registry.register(new WebFetchTool());
    return registry;
  }
}

export type { SafetyLevel } from './safety.js';
export { SafetyChecker } from './safety.js';
export type { PermissionLevel } from './permissions.js';
export { PermissionChecker, SAFE_TOOLS } from './permissions.js';
export { ReadFileTool } from './read_file.js';
export { WriteFileTool } from './write_file.js';
export { EditFileTool, findFuzzyMatch, suggestContext } from './edit_file.js';
export { UndoFileTool } from './undo_file.js';
export { ListDirTool } from './list_dir.js';
export { SearchCodeTool } from './search_code.js';
export { RunCommandTool } from './run_command.js';
export { GitTool } from './git.js';
export { WebFetchTool } from './web_fetch.js';
