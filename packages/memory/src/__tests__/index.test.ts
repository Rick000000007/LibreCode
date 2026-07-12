import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../index.js';
import type { Message } from 'librecode-types';

describe('ContextManager', () => {
  let manager: ContextManager;

  beforeEach(() => {
    manager = new ContextManager(10000, 0.8);
  });

  describe('needsCompaction', () => {
    it('returns false when under threshold', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      expect(manager.needsCompaction(messages)).toBe(false);
    });

    it('returns true when over threshold', () => {
      const longContent = 'x'.repeat(20000);
      const messages: Message[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
      ];
      expect(manager.needsCompaction(messages)).toBe(true);
    });

    it('handles empty messages', () => {
      expect(manager.needsCompaction([])).toBe(false);
    });
  });

  describe('countTokens', () => {
    it('counts tokens for messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello world' },
      ];
      const count = manager.countTokens(messages);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('compact', () => {
    it('returns original if less than 4 messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Hello' },
      ];
      const result = manager.compact(messages);
      expect(result).toEqual(messages);
    });

    it('compacts by keeping system and recent messages', () => {
      // Need enough messages so that oldMessages is not empty
      // recentMessageCount = 6, so need at least 1 + 6*2 + 1 = 14 messages
      const messages: Message[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Message 2' },
        { role: 'assistant', content: 'Response 2' },
        { role: 'user', content: 'Message 3' },
        { role: 'assistant', content: 'Response 3' },
        { role: 'user', content: 'Message 4' },
        { role: 'assistant', content: 'Response 4' },
        { role: 'user', content: 'Message 5' },
        { role: 'assistant', content: 'Response 5' },
        { role: 'user', content: 'Message 6' },
        { role: 'assistant', content: 'Response 6' },
        { role: 'user', content: 'Message 7' },
        { role: 'assistant', content: 'Response 7' },
      ];
      const result = manager.compact(messages);

      expect(result[0].role).toBe('system');
      expect(result[0].content).toBe('System prompt');

      const hasSummary = result.some(m => m.content?.includes('Conversation summary'));
      expect(hasSummary).toBe(true);

      expect(result.length).toBeLessThanOrEqual(messages.length);
    });

    it('includes user messages in summary', () => {
      // Need enough messages for compaction
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Primary request: build a feature' },
        { role: 'assistant', content: 'OK' },
        { role: 'user', content: 'Follow up: add tests' },
        { role: 'assistant', content: 'Done' },
        { role: 'user', content: 'Another request' },
        { role: 'assistant', content: 'Done' },
        { role: 'user', content: 'Another request' },
        { role: 'assistant', content: 'Done' },
        { role: 'user', content: 'Another request' },
        { role: 'assistant', content: 'Done' },
        { role: 'user', content: 'Another request' },
        { role: 'assistant', content: 'Done' },
        { role: 'user', content: 'Another request' },
        { role: 'assistant', content: 'Done' },
        { role: 'user', content: 'Final request' },
        { role: 'assistant', content: 'Done' },
      ];
      const result = manager.compact(messages);

      const summaryMsg = result.find(m => m.content?.includes('Conversation summary'));
      expect(summaryMsg).toBeDefined();
      if (summaryMsg?.content) {
        expect(summaryMsg.content).toContain('Primary request');
        expect(summaryMsg.content).toContain('build a feature');
      }
    });

    it('includes tool results in summary', () => {
      // Need enough messages for compaction
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Read file' },
        { role: 'assistant', content: '', tool_calls: [{ id: '1', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
        { role: 'tool', content: 'File content here', tool_call_id: '1' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
      ];
      const result = manager.compact(messages);

      const summaryMsg = result.find(m => m.content?.includes('Conversation summary'));
      expect(summaryMsg).toBeDefined();
      if (summaryMsg?.content) {
        expect(summaryMsg.content).toContain('Key tool results');
        expect(summaryMsg.content).toContain('File content here');
      }
    });

    it('includes assistant actions in summary', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Task' },
        { role: 'assistant', content: 'I will read the file', tool_calls: [{ id: '1', type: 'function', function: { name: 'read_file', arguments: '{"path": "test.ts"}' } }] },
        { role: 'tool', content: 'File content', tool_call_id: '1' },
        { role: 'user', content: 'Follow up' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
      ];
      const result = manager.compact(messages);

      const summaryMsg = result.find(m => m.content?.includes('Conversation summary'));
      expect(summaryMsg).toBeDefined();
      if (summaryMsg?.content) {
        expect(summaryMsg.content).toContain('Actions taken');
      }
    });

    it('includes decisions/notes in summary', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Task' },
        { role: 'assistant', content: 'OK' },
        { role: 'user', content: 'Follow up' },
        { role: 'assistant', content: 'IMPORTANT: This is a key decision' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'NOTE: Remember this' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Another' },
        { role: 'assistant', content: 'Completed the task' },
      ];
      const result = manager.compact(messages);

      const summaryMsg = result.find(m => m.content?.includes('Conversation summary'));
      expect(summaryMsg).toBeDefined();
      if (summaryMsg?.content) {
        expect(summaryMsg.content).toContain('Key decisions/notes');
      }
    });

    it('iteratively reduces if still over threshold', () => {
      const longContent = 'x'.repeat(5000);
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
      ];
      const result = manager.compact(messages);
      expect(result.length).toBeLessThanOrEqual(messages.length);
    });
  });
});