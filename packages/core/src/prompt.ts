import { buildSystemPrompt } from './prompt-builder.js';

export function generateSystemPrompt(
  workingDir: string,
  repoMap: string,
): string {
  return buildSystemPrompt({ workingDir, repoMap });
}
