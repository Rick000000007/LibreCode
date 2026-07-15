import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface MacroArgument {
  name: string;
  type?: 'string' | 'number' | 'boolean';
  default?: unknown;
  required?: boolean;
  description?: string;
  validator?: string;
}

export interface MacroStep {
  type: 'command' | 'shell' | 'ai_prompt' | 'tool' | 'macro' | 'condition';
  command?: string;
  shell?: string;
  prompt?: string;
  tool?: string;
  toolArgs?: Record<string, string>;
  macro?: string;
  condition?: {
    if: string;
    then: MacroStep[];
    else?: MacroStep[];
  };
  variables?: Record<string, string>;
  env?: Record<string, string>;
  description?: string;
}

export interface MacroDefinition {
  name: string;
  description?: string;
  arguments?: MacroArgument[];
  steps: MacroStep[];
  variables?: Record<string, string>;
  env?: Record<string, string>;
  timeout?: number;
}

export interface MacroContext {
  args: Record<string, unknown>;
  variables: Record<string, string>;
  env: Record<string, string>;
  workingDir: string;
}

export class MacroEngine {
  private macros = new Map<string, MacroDefinition>();
  private externalMacroDir: string;

  constructor(macroDir?: string) {
    this.externalMacroDir = macroDir ?? path.join(process.cwd(), '.librecode', 'macros');
    this.loadExternalMacros();
  }

  register(macro: MacroDefinition): void {
    this.macros.set(macro.name, macro);
  }

  unregister(name: string): boolean {
    return this.macros.delete(name);
  }

  get(name: string): MacroDefinition | undefined {
    return this.macros.get(name);
  }

  list(): MacroDefinition[] {
    return Array.from(this.macros.values());
  }

  async execute(name: string, args: Record<string, unknown> = {}): Promise<string> {
    const macro = this.macros.get(name);
    if (!macro) throw new Error(`Macro "${name}" not found`);

    const validated = this.validateArgs(macro, args);
    const context: MacroContext = {
      args: validated,
      variables: { ...macro.variables },
      env: { ...macro.env },
      workingDir: process.cwd(),
    };

    let result = '';
    for (const step of macro.steps) {
      result = await this.executeStep(step, context);
    }
    return result;
  }

  saveToFile(macro: MacroDefinition, filePath?: string): void {
    const dir = filePath ? path.dirname(filePath) : this.externalMacroDir;
    fs.mkdirSync(dir, { recursive: true });
    const outPath = filePath ?? path.join(dir, `${macro.name}.yaml`);
    const content = this.serializeMacro(macro);
    fs.writeFileSync(outPath, content, 'utf-8');
  }

  loadFromFile(filePath: string): MacroDefinition {
    const content = fs.readFileSync(filePath, 'utf-8');
    const macro = this.deserializeMacro(content);
    macro.name = macro.name ?? path.basename(filePath, path.extname(filePath));
    this.register(macro);
    return macro;
  }

  exportToJson(macro: MacroDefinition): string {
    return JSON.stringify(macro, null, 2);
  }

  importFromJson(json: string): MacroDefinition {
    const macro = JSON.parse(json) as MacroDefinition;
    this.register(macro);
    return macro;
  }

  private loadExternalMacros(): void {
    try {
      if (!fs.existsSync(this.externalMacroDir)) return;
      const files = fs.readdirSync(this.externalMacroDir);
      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json')) {
          try {
            this.loadFromFile(path.join(this.externalMacroDir, file));
          } catch { /* skip invalid */ }
        }
      }
    } catch { /* skip */ }
  }

  private validateArgs(macro: MacroDefinition, args: Record<string, unknown>): Record<string, unknown> {
    const validated: Record<string, unknown> = { ...args };
    for (const arg of macro.arguments ?? []) {
      if (arg.required && validated[arg.name] === undefined) {
        throw new Error(`Macro "${macro.name}": required argument "${arg.name}" is missing`);
      }
      if (validated[arg.name] === undefined && arg.default !== undefined) {
        validated[arg.name] = arg.default;
      }
      if (validated[arg.name] !== undefined && arg.type === 'number') {
        validated[arg.name] = Number(validated[arg.name]);
      }
      if (validated[arg.name] !== undefined && arg.type === 'boolean') {
        validated[arg.name] = String(validated[arg.name]).toLowerCase() === 'true';
      }
    }
    return validated;
  }

  private async executeStep(step: MacroStep, context: MacroContext): Promise<string> {
    const interpolate = (text: string): string => {
      return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        return String(context.args[key] ?? context.variables[key] ?? context.env[key] ?? '');
      });
    };

    if (step.condition) {
      const condResult = interpolate(step.condition.if);
      const isTrue = condResult === 'true' || condResult === '1' || condResult.toLowerCase() === 'yes';
      if (isTrue) {
        for (const s of step.condition.then) await this.executeStep(s, context);
      } else if (step.condition.else) {
        for (const s of step.condition.else) await this.executeStep(s, context);
      }
      return '';
    }

    if (step.type === 'shell' && step.shell) {
      const cmd = interpolate(step.shell);
      const result = spawnSync(cmd, [], {
        cwd: context.workingDir,
        env: { ...process.env, ...context.env },
        shell: true,
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const output = result.stdout?.toString() ?? '';
      if (result.status !== 0) {
        throw new Error(`Shell step failed: ${result.stderr?.toString() ?? output}`);
      }
      return output;
    }

    if (step.type === 'command' && step.command) {
      const cmd = interpolate(step.command);
      return `Execute command: ${cmd}`;
    }

    if (step.type === 'ai_prompt' && step.prompt) {
      return interpolate(step.prompt);
    }

    if (step.type === 'tool' && step.tool) {
      return `Execute tool: ${step.tool}`;
    }

    if (step.type === 'macro' && step.macro) {
      const subArgs: Record<string, unknown> = {};
      if (step.toolArgs) {
        for (const [k, v] of Object.entries(step.toolArgs)) {
          subArgs[k] = interpolate(v);
        }
      }
      return this.execute(step.macro, subArgs);
    }

    return '';
  }

  private serializeMacro(macro: MacroDefinition): string {
    const lines: string[] = [];
    lines.push(`# Macro: ${macro.name}`);
    if (macro.description) lines.push(`# ${macro.description}`);
    lines.push('');
    lines.push(`name: ${macro.name}`);
    if (macro.description) lines.push(`description: ${macro.description}`);
    if (macro.timeout) lines.push(`timeout: ${macro.timeout}`);

    if (macro.arguments && macro.arguments.length > 0) {
      lines.push('arguments:');
      for (const arg of macro.arguments) {
        lines.push(`  - name: ${arg.name}`);
        if (arg.type) lines.push(`    type: ${arg.type}`);
        if (arg.required) lines.push(`    required: true`);
        if (arg.default !== undefined) lines.push(`    default: ${arg.default}`);
        if (arg.description) lines.push(`    description: "${arg.description}"`);
      }
    }

    lines.push('steps:');
    for (const step of macro.steps) {
      lines.push(`  - type: ${step.type}`);
      if (step.description) lines.push(`    description: "${step.description}"`);
      if (step.shell) lines.push(`    shell: "${step.shell}"`);
      if (step.command) lines.push(`    command: "${step.command}"`);
      if (step.prompt) lines.push(`    prompt: "${step.prompt}"`);
      if (step.tool) lines.push(`    tool: "${step.tool}"`);
      if (step.macro) lines.push(`    macro: "${step.macro}"`);
    }

    return lines.join('\n');
  }

  private deserializeMacro(content: string): MacroDefinition {
    try {
      return JSON.parse(content) as MacroDefinition;
    } catch { /* not JSON, try YAML-like */ }

    const lines = content.split('\n');
    const macro: MacroDefinition = { name: '', steps: [] };
    let currentSection = '';
    let currentArg: Partial<MacroArgument> | null = null;
    let currentStep: Partial<MacroStep> | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const nameMatch = line.match(/^name:\s*(.+)/);
      if (nameMatch) { macro.name = nameMatch[1]!.trim(); continue; }

      const descMatch = line.match(/^description:\s*"?(.+?)"?$/);
      if (descMatch) { macro.description = descMatch[1]!.trim(); continue; }

      const timeoutMatch = line.match(/^timeout:\s*(\d+)/);
      if (timeoutMatch) { macro.timeout = parseInt(timeoutMatch[1]!, 10); continue; }

      if (line === 'arguments:') { currentSection = 'args'; continue; }
      if (line === 'steps:') { currentSection = 'steps'; continue; }

      if (currentSection === 'args') {
        const argNameMatch = line.match(/^-\s*name:\s*(.+)/);
        if (argNameMatch) {
          if (currentArg && currentArg.name) macro.arguments ??= [];
          currentArg = { name: argNameMatch[1]!.trim() };
          macro.arguments ??= [];
          macro.arguments.push(currentArg as MacroArgument);
          continue;
        }
        if (currentArg) {
          const typeMatch = line.match(/type:\s*(.+)/);
          if (typeMatch) currentArg.type = typeMatch[1]!.trim() as MacroArgument['type'];
          const reqMatch = line.match(/required:\s*(true|false)/);
          if (reqMatch) currentArg.required = reqMatch[1] === 'true';
          const defMatch = line.match(/default:\s*(.+)/);
          if (defMatch) currentArg.default = defMatch[1]!.trim();
        }
      }

      if (currentSection === 'steps') {
        const stepTypeMatch = line.match(/^-\s*type:\s*(.+)/);
        if (stepTypeMatch) {
          if (currentStep && currentStep.type) macro.steps.push(currentStep as MacroStep);
          currentStep = { type: stepTypeMatch[1]!.trim() as MacroStep['type'] };
          continue;
        }
        if (currentStep) {
          const shellMatch = line.match(/shell:\s*"(.+?)"/);
          if (shellMatch) currentStep.shell = shellMatch[1]!;
          const cmdMatch = line.match(/command:\s*"(.+?)"/);
          if (cmdMatch) currentStep.command = cmdMatch[1]!;
          const promptMatch = line.match(/prompt:\s*"(.+?)"/);
          if (promptMatch) currentStep.prompt = promptMatch[1]!;
          const toolMatch = line.match(/tool:\s*"(.+?)"/);
          if (toolMatch) currentStep.tool = toolMatch[1]!;
          const macroMatch = line.match(/macro:\s*"(.+?)"/);
          if (macroMatch) currentStep.macro = macroMatch[1]!;
          const descStepMatch = line.match(/description:\s*"(.+?)"/);
          if (descStepMatch) currentStep.description = descStepMatch[1]!;
        }
      }
    }

    if (currentStep && currentStep.type) macro.steps.push(currentStep as MacroStep);
    return macro;
  }
}
