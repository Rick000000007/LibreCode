import { describe, it, expect } from 'vitest';
import {
  truncateText,
  safeTruncate,
  formatArgsPreview,
  formatSize,
  isBinary,
  countTokens,
  countMessageTokens,
  countMessagesTokens,
  sumTokenUsage,
  resolvePath,
  joinPaths,
  getEnvVar,
} from '../index.js';
import type { Message, TokenUsage } from 'librecode-types';

describe('Utils Package - Exported Functions', () => {
  describe('truncateText', () => {
    it('returns original string if under maxLen', () => {
      expect(truncateText('short', 10)).toBe('short');
    });

    it('truncates and adds ellipsis when over maxLen', () => {
      // Note: implementation adds space before ellipsis
      expect(truncateText('this is a long text', 10)).toBe('this is a …');
    });

    it('handles multi-line strings by joining with space', () => {
      expect(truncateText('line1\nline2', 20)).toBe('line1 line2');
    });

    it('handles exact length', () => {
      expect(truncateText('exact', 5)).toBe('exact');
    });
  });

  describe('safeTruncate', () => {
    it('returns original if under maxBytes', () => {
      expect(safeTruncate('hello', 10)).toBe('hello');
    });

    it('truncates at character boundary', () => {
      // Multi-byte character 'é' = 2 bytes, 'café' = 5 bytes total
      // With maxBytes=3, can fit 'caf' (3 bytes) but not 'é' (needs 2 more)
      const str = 'café';
      expect(safeTruncate(str, 3)).toBe('caf...');
      expect(safeTruncate(str, 4)).toBe('café');
    });

    it('handles emoji correctly', () => {
      // Emoji is typically 4 bytes in UTF-8
      const str = 'hello 👋 world';
      expect(safeTruncate(str, 5)).toBe('hello...');
    });
  });

  describe('formatArgsPreview', () => {
    it('formats read_file args', () => {
      expect(formatArgsPreview('read_file', { path: '/home/user/file.ts' })).toBe('/home/user/file.ts');
    });

    it('formats write_file args', () => {
      expect(formatArgsPreview('write_file', { file_path: '/home/user/new.ts' })).toBe('/home/user/new.ts');
    });

    it('formats edit_file args', () => {
      expect(formatArgsPreview('edit_file', { path: '/home/user/edit.ts' })).toBe('/home/user/edit.ts');
    });

    it('formats undo_edit args', () => {
      expect(formatArgsPreview('undo_edit', { path: '/home/user/undo.ts' })).toBe('/home/user/undo.ts');
    });

    it('formats run_command args', () => {
      expect(formatArgsPreview('run_command', { command: 'npm test --verbose' })).toBe('npm test --verbose');
    });

    it('truncates long command', () => {
      const longCmd = 'a'.repeat(100);
      // truncateText adds " …" so length is 60 + 2 = 62, but formatArgsPreview uses truncateText with 60
      expect(formatArgsPreview('run_command', { command: longCmd }).length).toBeLessThanOrEqual(62);
    });

    it('formats search_code args', () => {
      expect(formatArgsPreview('search_code', { pattern: 'function.*test' })).toBe('function.*test');
    });

    it('formats list_directory args', () => {
      expect(formatArgsPreview('list_directory', { path: '/home/user' })).toBe('/home/user');
      expect(formatArgsPreview('list_directory', {})).toBe('.');
    });

    it('formats git args', () => {
      expect(formatArgsPreview('git', { command: 'status' })).toBe('status');
    });

    it('formats web_fetch args', () => {
      expect(formatArgsPreview('web_fetch', { url: 'https://example.com' })).toBe('https://example.com');
    });

    it('returns empty for unknown tool', () => {
      expect(formatArgsPreview('unknown_tool', {})).toBe('');
    });
  });

  describe('formatSize', () => {
    it('formats bytes', () => {
      expect(formatSize(0)).toBe('0B');
      expect(formatSize(512)).toBe('512B');
      expect(formatSize(1023)).toBe('1023B');
    });

    it('formats kilobytes', () => {
      expect(formatSize(1024)).toBe('1.0KB');
      expect(formatSize(1536)).toBe('1.5KB');
      expect(formatSize(1024 * 1023)).toBe('1023.0KB');
    });

    it('formats megabytes', () => {
      expect(formatSize(1024 * 1024)).toBe('1.0MB');
      expect(formatSize(1024 * 1024 * 2.5)).toBe('2.5MB');
    });
  });

  describe('isBinary', () => {
    it('returns false for short arrays', () => {
      expect(isBinary(new Uint8Array([1, 2, 3]))).toBe(false);
    });

    it('returns false for text content', () => {
      const text = new TextEncoder().encode('Hello world this is text');
      expect(isBinary(text)).toBe(false);
    });

    it('returns true for null bytes', () => {
      const binary = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x00, 0x00]);
      expect(isBinary(binary)).toBe(true);
    });

    it('returns true for high null byte ratio', () => {
      const arr = new Uint8Array(100);
      for (let i = 0; i < 10; i++) arr[i] = 0;
      expect(isBinary(arr)).toBe(true);
    });
  });

  describe('countTokens', () => {
    it('counts ASCII characters', () => {
      expect(countTokens('hello')).toBeGreaterThan(0);
      expect(countTokens('hello world')).toBeGreaterThan(countTokens('hello'));
    });

    it('returns same count for same input (caching)', () => {
      const count1 = countTokens('test string');
      const count2 = countTokens('test string');
      expect(count1).toBe(count2);
    });

    it('handles empty string', () => {
      expect(countTokens('')).toBe(0);
    });

    it('handles multi-byte characters', () => {
      const asciiCount = countTokens('a'.repeat(100));
      const unicodeCount = countTokens('é'.repeat(100));
      // Unicode characters typically count as more tokens
      expect(unicodeCount).toBeGreaterThanOrEqual(asciiCount);
    });
  });

  describe('countMessageTokens', () => {
    const msg: Message = { role: 'user', content: 'Hello world' };

    it('counts content tokens', () => {
      expect(countMessageTokens(msg)).toBeGreaterThan(0);
    });

    it('adds overhead based on role', () => {
      const userMsg: Message = { role: 'user', content: 'test' };
      const toolMsg: Message = { role: 'tool', content: 'result', tool_call_id: 'call_1' };
      const assistantMsg: Message = { role: 'assistant', content: 'response' };

      const userTokens = countMessageTokens(userMsg);
      const toolTokens = countMessageTokens(toolMsg);
      const assistantTokens = countMessageTokens(assistantMsg);

      // tool role has overhead of 3, others have 4
      expect(toolTokens).toBeLessThanOrEqual(userTokens);
    });

    it('handles tool calls', () => {
      const msgWithTools: Message = {
        role: 'assistant',
        content: 'I will call a tool',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path": "test.ts"}' } },
        ],
      };
      const tokens = countMessageTokens(msgWithTools);
      expect(tokens).toBeGreaterThan(0);
    });

    it('handles null content', () => {
      const msg: Message = { role: 'assistant', content: null, tool_calls: [] };
      expect(countMessageTokens(msg)).toBeGreaterThanOrEqual(4);
    });
  });

  describe('countMessagesTokens', () => {
    it('sums tokens for multiple messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const total = countMessagesTokens(messages);
      const individual = messages.reduce((sum, m) => sum + countMessageTokens(m), 0);
      expect(total).toBe(individual);
    });

    it('handles empty array', () => {
      expect(countMessagesTokens([])).toBe(0);
    });
  });

  describe('sumTokenUsage', () => {
    it('sums multiple TokenUsage objects', () => {
      const usages: TokenUsage[] = [
        { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
      ];
      const sum = sumTokenUsage(usages);
      expect(sum.promptTokens).toBe(35);
      expect(sum.completionTokens).toBe(18);
      expect(sum.totalTokens).toBe(53);
    });

    it('returns zeros for empty array', () => {
      const sum = sumTokenUsage([]);
      expect(sum).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    });

    it('handles single element', () => {
      const sum = sumTokenUsage([{ promptTokens: 100, completionTokens: 50, totalTokens: 150 }]);
      expect(sum).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    });
  });

  describe('resolvePath', () => {
    it('returns absolute path as-is', () => {
      expect(resolvePath('/absolute/path', '/cwd')).toBe('/absolute/path');
    });

    it('resolves relative path from working dir', () => {
      expect(resolvePath('relative/path', '/home/user')).toBe('/home/user/relative/path');
    });

    it('handles Windows absolute paths', () => {
      expect(resolvePath('C:\\Users\\test', '/cwd')).toBe('C:\\Users\\test');
    });
  });

  describe('joinPaths', () => {
    it('joins multiple path parts', () => {
      expect(joinPaths('a', 'b', 'c')).toBe('a/b/c');
    });

    it('handles trailing slashes', () => {
      expect(joinPaths('a/', 'b', 'c/')).toBe('a/b/c');
    });

    it('normalizes double slashes', () => {
      expect(joinPaths('a', '//b', 'c')).toBe('a/b/c');
    });

    it('handles single part', () => {
      expect(joinPaths('single')).toBe('single');
    });
  });

  describe('getEnvVar', () => {
    it('returns env var value', () => {
      process.env['TEST_VAR_123'] = 'test_value';
      expect(getEnvVar('TEST_VAR_123')).toBe('test_value');
      delete process.env['TEST_VAR_123'];
    });

    it('returns undefined for missing var', () => {
      expect(getEnvVar('NONEXISTENT_VAR_999')).toBeUndefined();
    });
  });
});