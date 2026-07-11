import type { ToolDefinition } from 'librecode-types';

export interface Tool {
  name(): string;
  description(): string;
  parametersSchema(): Record<string, unknown>;
  execute(args: Record<string, unknown>, workingDir: string): Promise<string>;
  definition(): ToolDefinition;
}

export abstract class BaseTool implements Tool {
  abstract name(): string;
  abstract description(): string;
  abstract parametersSchema(): Record<string, unknown>;
  abstract execute(args: Record<string, unknown>, workingDir: string): Promise<string>;

  definition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name(),
        description: this.description(),
        parameters: this.parametersSchema(),
      },
    };
  }
}
