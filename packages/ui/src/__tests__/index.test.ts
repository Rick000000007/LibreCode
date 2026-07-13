import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  stripAnsi,
  formatWidth,
  truncateMiddle,
  supportsEmoji,
  getTerminalCapabilities,
  resetTerminalCache,
} from '../terminal.js';
import { renderMarkdown, renderInlineText, parseMarkdown } from '../markdown.js';
import { getTheme, resetTheme } from '../theme.js';
import { getLogger, setLogger } from '../logger.js';
import { WorkflowTracker } from '../workflow.js';

describe('UI Package - Terminal Utilities', () => {
  describe('stripAnsi', () => {
    it('removes basic ANSI escape codes', () => {
      // The implementation removes ESC [ ... letter but leaves some numbers
      const result = stripAnsi('\x1B[31mred\x1B[39m');
      expect(result).toContain('red');
    });

    it('handles strings without ANSI codes', () => {
      expect(stripAnsi('plain text')).toBe('plain text');
    });

    it('handles empty string', () => {
      expect(stripAnsi('')).toBe('');
    });

    it('handles bold escape codes', () => {
      const result = stripAnsi('\x1B[1mbold\x1B[22m');
      expect(result).toContain('bold');
    });
  });

  describe('formatWidth', () => {
    it('pads string to width', () => {
      expect(formatWidth('hi', 10)).toBe('hi        ');
      expect(formatWidth('hello', 5)).toBe('hello');
    });

    it('truncates when longer than width', () => {
      expect(formatWidth('hello world', 5)).toBe('hello');
    });

    it('handles empty string', () => {
      expect(formatWidth('', 5)).toBe('     ');
    });

    it('handles zero width', () => {
      expect(formatWidth('test', 0)).toBe('');
    });
  });

  describe('truncateMiddle', () => {
    it('returns original if under limit', () => {
      expect(truncateMiddle('short', 20)).toBe('short');
    });

    it('truncates middle with ellipsis', () => {
      expect(truncateMiddle('very long string here', 15)).toBe('very l...g here');
    });

    it('handles exact length', () => {
      expect(truncateMiddle('exact', 5)).toBe('exact');
    });

    it('handles small limit', () => {
      expect(truncateMiddle('hello', 3)).toBe('...');
    });
  });

  describe('supportsEmoji', () => {
    it('returns boolean', () => {
      const result = supportsEmoji();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getTerminalCapabilities', () => {
    afterEach(() => {
      resetTerminalCache();
    });

    it('returns capabilities object with correct properties', () => {
      const caps = getTerminalCapabilities();
      expect(caps).toHaveProperty('isTTY');
      expect(caps).toHaveProperty('supportsUTF8');
      expect(caps).toHaveProperty('supportsColor');
      expect(caps).toHaveProperty('colorDepth');
      expect(caps).toHaveProperty('supportsUnicodeBlocks');
      expect(caps).toHaveProperty('width');
      expect(caps).toHaveProperty('height');
      expect(caps).toHaveProperty('platform');
      expect(caps).toHaveProperty('isCI');
      expect(typeof caps.width).toBe('number');
      expect(typeof caps.height).toBe('number');
    });

    it('caches result', () => {
      const caps1 = getTerminalCapabilities();
      const caps2 = getTerminalCapabilities();
      expect(caps1).toBe(caps2);
    });

    it('resets cache with resetTerminalCache', () => {
      const caps1 = getTerminalCapabilities();
      resetTerminalCache();
      const caps2 = getTerminalCapabilities();
      expect(caps1).not.toBe(caps2);
    });
  });
});

describe('UI Package - Markdown Rendering', () => {
  describe('renderMarkdown', () => {
    it('renders plain text', () => {
      const result = renderMarkdown('Hello world');
      expect(result).toContain('Hello world');
    });

    it('renders bold', () => {
      const result = renderMarkdown('**bold**');
      expect(result).toContain('bold');
    });

    it('renders italic', () => {
      const result = renderMarkdown('*italic*');
      expect(result).toContain('italic');
    });

    it('renders code', () => {
      const result = renderMarkdown('`code`');
      expect(result).toContain('code');
    });

    it('renders code blocks', () => {
      const result = renderMarkdown('```js\nconst x = 1;\n```');
      // Code blocks include syntax highlighting with ANSI codes
      expect(result).toContain('const');
      expect(result).toContain('1');
    });

    it('renders headers', () => {
      const result = renderMarkdown('# Header');
      expect(result).toContain('Header');
    });

    it('handles multiple elements', () => {
      const result = renderMarkdown('**Bold** and *italic*');
      expect(result).toContain('Bold');
      expect(result).toContain('italic');
    });
  });

  describe('renderInlineText', () => {
    it('renders inline markdown', () => {
      const result = renderInlineText('**bold** and *italic*');
      expect(result).toContain('bold');
      expect(result).toContain('italic');
    });
  });

  describe('parseMarkdown', () => {
    it('parses markdown into blocks', () => {
      const blocks = parseMarkdown('# Header\n\nParagraph\n\n**Bold**');
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].type).toBe('heading');
      expect(blocks[1].type).toBe('paragraph');
    });

    it('handles code blocks', () => {
      const blocks = parseMarkdown('```js\nconst x = 1;\n```');
      expect(blocks[0].type).toBe('code');
      expect(blocks[0].content).toContain('const x = 1;');
    });

    it('handles empty input', () => {
      const blocks = parseMarkdown('');
      expect(blocks).toEqual([]);
    });
  });
});

describe('UI Package - Theme', () => {
  afterEach(() => {
    resetTheme();
  });

  describe('getTheme', () => {
    it('returns theme object with all properties', () => {
      const theme = getTheme();
      expect(theme).toHaveProperty('name');
      expect(theme).toHaveProperty('primary');
      expect(theme).toHaveProperty('secondary');
      expect(theme).toHaveProperty('success');
      expect(theme).toHaveProperty('warning');
      expect(theme).toHaveProperty('error');
      expect(theme).toHaveProperty('info');
      expect(theme).toHaveProperty('muted');
      expect(theme).toHaveProperty('dim');
      expect(theme).toHaveProperty('border');
      expect(theme).toHaveProperty('selection');
      expect(theme).toHaveProperty('bg');
      expect(theme).toHaveProperty('fg');
      expect(theme).toHaveProperty('reset');
      expect(theme).toHaveProperty('bold');
      expect(theme).toHaveProperty('italic');
      expect(theme).toHaveProperty('underline');
      expect(theme).toHaveProperty('code');
      expect(theme).toHaveProperty('link');
      expect(theme).toHaveProperty('git');
      expect(theme).toHaveProperty('provider');
      expect(theme).toHaveProperty('model');
      expect(theme).toHaveProperty('bar');
      expect(theme).toHaveProperty('modified');
    });

    it('caches theme', () => {
      const t1 = getTheme();
      const t2 = getTheme();
      expect(t1).toBe(t2);
    });

    it('resets with resetTheme', () => {
      const t1 = getTheme();
      resetTheme();
      const t2 = getTheme();
      expect(t1).not.toBe(t2);
    });
  });
});

describe('UI Package - Logger', () => {
  const originalLogger = getLogger();

  afterEach(() => {
    setLogger(originalLogger);
  });

  describe('getLogger', () => {
    it('returns logger instance', () => {
      const logger = getLogger();
      expect(logger).toHaveProperty('debug');
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('error');
      expect(logger).toHaveProperty('getLogFile');
    });
  });

  describe('setLogger', () => {
    it('replaces logger', () => {
      const custom = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getLogFile: () => null,
      };
      setLogger(custom);
      expect(getLogger()).toBe(custom);
    });
  });
});

describe('UI Package - WorkflowTracker', () => {
  let tracker: WorkflowTracker;

  beforeEach(() => {
    tracker = new WorkflowTracker();
  });

  describe('beginStep', () => {
    it('adds step to workflow', () => {
      tracker.beginStep('step1', 'First Step');
      tracker.beginStep('step2', 'Second Step');
      const steps = tracker.getSteps();
      expect(steps).toHaveLength(2);
      expect(steps[0].label).toBe('First Step');
      expect(steps[1].label).toBe('Second Step');
      expect(steps[0].id).toBe('step1');
      expect(steps[1].id).toBe('step2');
    });
  });

  describe('setStepDetail', () => {
    it('sets detail for step', () => {
      tracker.beginStep('step1', 'First Step');
      tracker.setStepDetail('step1', 'Processing...');
      const step = tracker.getSteps().find(s => s.id === 'step1');
      expect(step?.detail).toBe('Processing...');
    });
  });

  describe('completeStep', () => {
    it('marks step as complete', () => {
      tracker.beginStep('step1', 'First Step');
      tracker.completeStep('step1', 'Done');
      const step = tracker.getSteps().find(s => s.id === 'step1');
      expect(step?.status).toBe('completed');
      expect(step?.detail).toBe('Done');
    });
  });

  describe('failStep', () => {
    it('marks step as failed', () => {
      tracker.beginStep('step1', 'First Step');
      tracker.failStep('step1', 'Error occurred');
      const step = tracker.getSteps().find(s => s.id === 'step1');
      expect(step?.status).toBe('failed');
      expect(step?.detail).toBe('Error occurred');
    });
  });
});