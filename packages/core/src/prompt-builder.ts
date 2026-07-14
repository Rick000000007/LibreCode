import type { ToolDefinition, Message, ProviderConfig } from 'librecode-types';

export interface PromptBuilderOptions {
  workingDir: string;
  repoMap?: string;
  toolDefinitions?: ToolDefinition[];
  providerName?: string;
  providerModel?: string;
  providerConfig?: ProviderConfig;
  userPreferences?: Record<string, string>;
  conversationHistory?: Message[];
  maxTokens?: number;
}

export type PromptSection = (options: PromptBuilderOptions) => string;

export class PromptBuilder {
  private sections: PromptSection[] = [];

  constructor(sections?: PromptSection[]) {
    if (sections) {
      this.sections = sections;
    }
  }

  use(section: PromptSection): this {
    this.sections.push(section);
    return this;
  }

  removeAll(): this {
    this.sections = [];
    return this;
  }

  build(options: PromptBuilderOptions): string {
    const parts = this.sections.map(fn => fn(options)).filter(Boolean);
    return parts.join('\n\n');
  }
}

export const defaultSections: PromptSection[] = [
  identitySection,
  capabilitiesSection,
  workingDirSection,
  repositorySection,
  guidelinesSection,
  responseFormatSection,
  preferencesSection,
  modelCapabilitiesSection,
];

export function identitySection(options: PromptBuilderOptions): string {
  const { providerName, providerModel } = options;
  const providerPart = providerName ? ` using ${providerName}/${providerModel ?? 'default'}` : '';
  return `You are an AI coding agent${providerPart}. You help users with software engineering tasks.`;
}

export function capabilitiesSection(options: PromptBuilderOptions): string {
  const defs = options.toolDefinitions;
  if (!defs || defs.length === 0) {
    return `## Capabilities
You have access to tools that let you:
- Read, write, and edit files
- Search codebases
- Run shell commands
- Use git
- Fetch web content`;
  }

  const toolLines = defs.map(t => {
    const fn = t.function;
    return `- \`${fn.name}\`: ${fn.description.split('\n')[0] ?? ''}`;
  });

  return `## Available Tools\n${toolLines.join('\n')}`;
}

export function workingDirSection(options: PromptBuilderOptions): string {
  return `## Working Directory\n${options.workingDir}`;
}

export function repositorySection(options: PromptBuilderOptions): string {
  if (!options.repoMap) return '';
  return `## Repository Structure\nThe following is a symbol-level map of the codebase:\n\n\`\`\`\n${options.repoMap}\n\`\`\`\n\nUse this to understand the codebase structure before making changes.`;
}

export function guidelinesSection(_options: PromptBuilderOptions): string {
  return `## Guidelines
1. Read files before modifying them to understand the existing code
2. Make targeted, minimal changes
3. Always verify your changes compile or work correctly
4. Use search to find relevant code before making changes
5. When editing files, provide the exact old_string to replace
6. Run tests after making changes when possible
7. Be concise in your responses
8. If a tool returns an error, try a different approach
9. When you encounter a bug, first understand it thoroughly before fixing it
10. Use git commits with clear, descriptive messages`;
}

export function responseFormatSection(_options: PromptBuilderOptions): string {
  return `## Response Format
- Think step by step about what needs to be done
- Use tools to gather information before making changes
- Explain what you did after completing a task
- If something fails, explain why and try again
- When making multi-file changes, plan the order of operations`;
}

export function preferencesSection(options: PromptBuilderOptions): string {
  const prefs = options.userPreferences;
  if (!prefs || Object.keys(prefs).length === 0) return '';
  const lines = Object.entries(prefs)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  return `## User Preferences\n${lines}`;
}

export function modelCapabilitiesSection(options: PromptBuilderOptions): string {
  const config = options.providerConfig;
  if (!config) return '';

  const caps: string[] = [];
  if (config.maxTokens) caps.push(`Maximum output tokens: ${config.maxTokens}`);
  if (config.temperature !== undefined) caps.push(`Temperature: ${config.temperature}`);

  if (caps.length === 0) return '';
  return `## Model Configuration\n${caps.join('\n')}`;
}

export function createDefaultPromptBuilder(): PromptBuilder {
  const builder = new PromptBuilder();
  for (const section of defaultSections) {
    builder.use(section);
  }
  return builder;
}

export function buildSystemPrompt(options: PromptBuilderOptions): string {
  const builder = createDefaultPromptBuilder();
  return builder.build(options);
}
