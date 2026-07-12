import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSystemPrompt } from '../prompt.js';
import { RepoMapper } from '../repo_map.js';

describe('Core Package - generateSystemPrompt', () => {
  it('generates a system prompt with working directory and repo map', () => {
    const prompt = generateSystemPrompt('/home/user/project', '- file1.ts\n- file2.ts');
    expect(prompt).toContain('/home/user/project');
    expect(prompt).toContain('file1.ts');
    expect(prompt).toContain('file2.ts');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('handles empty repo map', () => {
    const prompt = generateSystemPrompt('/home/user/project', '');
    expect(prompt).toContain('/home/user/project');
  });
});

describe('RepoMapper', () => {
  let tmpDir: string;
  let repoMapper: RepoMapper;

  beforeEach(() => {
    tmpDir = vi.fn().mockImplementation(() => '/tmp/test-repo') as any;
    repoMapper = new RepoMapper();
  });

  describe('indexDirectory', () => {
    it('does not throw for non-existent directory', () => {
      expect(() => repoMapper.indexDirectory('/non/existent/path')).not.toThrow();
    });
  });

  describe('generateMap', () => {
    it('returns empty string for unindexed directory', () => {
      const map = repoMapper.generateMap(1000);
      expect(map).toBe('');
    });
  });
});