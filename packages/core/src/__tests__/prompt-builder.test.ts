import { describe, it, expect } from 'vitest';
import {
  PromptBuilder,
  buildSystemPrompt,
  identitySection,
  guidelinesSection,
  workingDirSection,
  repositorySection,
  capabilitiesSection,
  preferencesSection,
  modelCapabilitiesSection,
} from '../prompt-builder';

describe('PromptBuilder', () => {
  it('builds a prompt from sections', () => {
    const builder = new PromptBuilder([
      () => 'section one',
      () => 'section two',
    ]);
    const result = builder.build({ workingDir: '/test' });
    expect(result).toContain('section one');
    expect(result).toContain('section two');
  });

  it('adds sections with use()', () => {
    const builder = new PromptBuilder();
    builder.use(() => 'dynamic');
    expect(builder.build({ workingDir: '/' })).toBe('dynamic');
  });

  it('removes all sections', () => {
    const builder = new PromptBuilder([() => 'gone']);
    builder.removeAll();
    expect(builder.build({ workingDir: '/' })).toBe('');
  });

  it('filters out empty sections', () => {
    const builder = new PromptBuilder([
      () => 'visible',
      () => '',
      () => 'also visible',
    ]);
    const result = builder.build({ workingDir: '/' });
    expect(result).toBe('visible\n\nalso visible');
  });
});

describe('buildSystemPrompt', () => {
  it('includes working directory', () => {
    const result = buildSystemPrompt({ workingDir: '/my/project' });
    expect(result).toContain('/my/project');
  });

  it('includes repo map when provided', () => {
    const result = buildSystemPrompt({ workingDir: '/p', repoMap: 'src/index.ts' });
    expect(result).toContain('src/index.ts');
  });

  it('omits repo map section when empty', () => {
    const result = buildSystemPrompt({ workingDir: '/p' });
    expect(result).not.toContain('Repository Structure');
  });

  it('includes provider name when provided', () => {
    const result = buildSystemPrompt({ workingDir: '/p', providerName: 'openai', providerModel: 'gpt-4' });
    expect(result).toContain('openai');
  });

  it('includes tool definitions', () => {
    const tools = [
      { type: 'function', function: { name: 'read_file', description: 'Read file contents', parameters: {} } },
    ];
    const result = buildSystemPrompt({ workingDir: '/p', toolDefinitions: tools });
    expect(result).toContain('read_file');
    expect(result).toContain('Available Tools');
  });

  it('produces valid output matching generateSystemPrompt compat', () => {
    const result = buildSystemPrompt({ workingDir: '/test', repoMap: 'file1.ts\nfile2.ts' });
    expect(result).toContain('AI coding agent');
    expect(result).toContain('Working Directory');
    expect(result).toContain('Guidelines');
    expect(result).toContain('Response Format');
    expect(result).toContain('Repository Structure');
  });
});

describe('sections', () => {
  it('identitySection includes provider info when given', () => {
    const result = identitySection({ workingDir: '/', providerName: 'anthropic', providerModel: 'claude' });
    expect(result).toContain('anthropic');
    expect(result).toContain('claude');
  });

  it('identitySection works without provider info', () => {
    const result = identitySection({ workingDir: '/' });
    expect(result).toContain('AI coding agent');
  });

  it('guidelinesSection returns guidelines', () => {
    const result = guidelinesSection({ workingDir: '/' });
    expect(result).toContain('Read files before modifying');
    expect(result).toContain('Run tests after making changes');
  });

  it('workingDirSection returns the directory', () => {
    const result = workingDirSection({ workingDir: '/app' });
    expect(result).toContain('/app');
  });

  it('repositorySection returns content when repoMap given', () => {
    const result = repositorySection({ workingDir: '/', repoMap: 'foo.ts\nbar.ts' });
    expect(result).toContain('foo.ts');
    expect(result).toContain('Repository Structure');
  });

  it('repositorySection returns empty when no repoMap', () => {
    const result = repositorySection({ workingDir: '/' });
    expect(result).toBe('');
  });

  it('capabilitiesSection shows tool list when given', () => {
    const tools = [
      { type: 'function', function: { name: 'write_file', description: 'Write to a file', parameters: {} } },
      { type: 'function', function: { name: 'search_code', description: 'Search codebase', parameters: {} } },
    ];
    const result = capabilitiesSection({ workingDir: '/', toolDefinitions: tools });
    expect(result).toContain('write_file');
    expect(result).toContain('search_code');
    expect(result).toContain('Available Tools');
  });

  it('capabilitiesSection shows default when no tools', () => {
    const result = capabilitiesSection({ workingDir: '/' });
    expect(result).toContain('Read, write, and edit files');
  });

  it('preferencesSection returns empty when no preferences', () => {
    const result = preferencesSection({ workingDir: '/' });
    expect(result).toBe('');
  });

  it('preferencesSection shows preferences when given', () => {
    const result = preferencesSection({ workingDir: '/', userPreferences: { language: 'TypeScript', style: 'concise' } });
    expect(result).toContain('language');
    expect(result).toContain('TypeScript');
    expect(result).toContain('User Preferences');
  });

  it('modelCapabilitiesSection returns empty when no config', () => {
    const result = modelCapabilitiesSection({ workingDir: '/' });
    expect(result).toBe('');
  });

  it('modelCapabilitiesSection shows config when given', () => {
    const result = modelCapabilitiesSection({ workingDir: '/', providerConfig: { defaultModel: 'gpt-4', maxTokens: 4096 } });
    expect(result).toContain('4096');
    expect(result).toContain('Model Configuration');
  });
});
