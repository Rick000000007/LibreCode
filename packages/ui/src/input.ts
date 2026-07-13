import { TuiEngine, type KeyEvent } from './tui.js';
import { Completer, type Completion } from './completer.js';
import { getTerminalCapabilities } from './terminal.js';
import { getTheme } from './theme.js';

export interface InputState {
  buffer: string;
  cursor: number;
  history: string[];
  historyIndex: number;
}

export interface InputOptions {
  prompt: string;
  completer: Completer;
  tui: TuiEngine;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  onCommandPalette?: () => void;
  multiLine?: boolean;
  isPassword?: boolean;
}

export class InputHandler {
  private options: InputOptions;
  private buffer = '';
  private cursor = 0;
  private history: string[] = [];
  private historyIndex = -1;
  private suggestTimer: ReturnType<typeof setTimeout> | null = null;
  private showSuggestions = false;
  private suggestions: Completion[] = [];
  private selectedSuggestion = -1;
  private tui: TuiEngine;
  private completer: Completer;
  private multiLine = false;
  private multiLineBuffer: string[] = [];
  private isPasting = false;

  constructor(options: InputOptions) {
    this.options = options;
    this.tui = options.tui;
    this.completer = options.completer;
    this.multiLine = options.multiLine ?? false;
  }

  getState(): InputState {
    return {
      buffer: this.buffer,
      cursor: this.cursor,
      history: [...this.history],
      historyIndex: this.historyIndex,
    };
  }

  setState(state: InputState): void {
    this.buffer = state.buffer;
    this.cursor = state.cursor;
    this.history = state.history;
    this.historyIndex = state.historyIndex;
  }

  handleKey(key: KeyEvent): boolean {
    const { name, ctrl } = key;

    if (ctrl && name === 'c') {
      this.cancel();
      return true;
    }

    if (ctrl && name === 'd' && this.buffer.length === 0) {
      this.cancel();
      return true;
    }

    if (ctrl && name === 'k') {
      this.options.onCommandPalette?.();
      return true;
    }

    if (name === 'escape') {
      if (this.showSuggestions) {
        this.hideSuggestions();
        return true;
      }
      if (this.multiLine && this.multiLineBuffer.length > 0) {
        this.clearAll();
        return true;
      }
      return false;
    }

    if (name === 'enter') {
      if (this.showSuggestions && this.selectedSuggestion >= 0) {
        this.applySuggestion();
        return true;
      }
      if (this.multiLine) {
        if (ctrl) {
          this.multiLineBuffer.push(this.buffer);
          this.buffer = '';
          this.cursor = 0;
          const fullInput = this.multiLineBuffer.join('\n');
          if (fullInput.trim()) {
            this.history.push(fullInput);
            this.historyIndex = this.history.length;
            this.options.onSubmit(fullInput);
            this.multiLineBuffer = [];
            this.hideSuggestions();
          }
          this.renderInput();
        } else {
          this.multiLineBuffer.push(this.buffer);
          this.buffer = '';
          this.cursor = 0;
          this.renderInput();
        }
        return true;
      }
      this.submit();
      return true;
    }

    if (name === 'tab') {
      if (this.suggestions.length > 0) {
        if (this.selectedSuggestion < 0 || this.selectedSuggestion >= this.suggestions.length - 1) {
          this.selectedSuggestion = 0;
        } else {
          this.selectedSuggestion++;
        }
        this.renderSuggestions();
        return true;
      }
      this.fetchCompletions();
      return true;
    }

    if (name === 'up') {
      if (this.showSuggestions) {
        this.selectedSuggestion = Math.max(0, this.selectedSuggestion - 1);
        this.renderSuggestions();
        return true;
      }
      this.historyPrev();
      return true;
    }

    if (name === 'down') {
      if (this.showSuggestions) {
        this.selectedSuggestion = Math.min(this.suggestions.length - 1, this.selectedSuggestion + 1);
        this.renderSuggestions();
        return true;
      }
      this.historyNext();
      return true;
    }

    if (name === 'backspace') {
      if (this.cursor > 0) {

        const before = Array.from(this.buffer.slice(0, this.cursor));
        const removed = before.pop();
        if (removed) {
          this.cursor -= removed.length;
          this.buffer = before.join('') + this.buffer.slice(this.cursor + removed.length);
          this.onChange();
        }
      }
      return true;
    }

    if (name === 'delete') {
      if (this.cursor < this.buffer.length) {
        const after = Array.from(this.buffer.slice(this.cursor));
        const removed = after.shift();
        if (removed) {
          this.buffer = this.buffer.slice(0, this.cursor) + after.join('');
          this.onChange();
        }
      }
      return true;
    }

    if (name === 'home' || (ctrl && name === 'a')) {
      this.cursor = 0;
      this.renderInput();
      return true;
    }

    if (name === 'end' || (ctrl && name === 'e')) {
      this.cursor = this.buffer.length;
      this.renderInput();
      return true;
    }

    if (ctrl && name === 'w') {
      const before = this.buffer.slice(0, this.cursor);
      const match = before.match(/\S*$/);
      if (match) {
        const deleteLen = match[0]?.length ?? 0;
        if (deleteLen > 0) {
          this.buffer = this.buffer.slice(0, this.cursor - deleteLen) + this.buffer.slice(this.cursor);
          this.cursor -= deleteLen;
          this.onChange();
        }
      }
      return true;
    }

    if (ctrl && name === 'u') {
      this.buffer = this.buffer.slice(this.cursor);
      this.cursor = 0;
      this.onChange();
      return true;
    }

    if (ctrl && name === 'k') {
      this.buffer = this.buffer.slice(0, this.cursor);
      this.onChange();
      return true;
    }

    if (ctrl && name === 'l') {
      this.tui.clearScreen();
      this.renderInput();
      return true;
    }

    if (ctrl && name === 'p') {
      // File search - could trigger palette
      return true;
    }

    if (ctrl && name === 'r') {
      // History search
      this.triggerHistorySearch();
      return true;
    }

    if (ctrl && name === 'n') {
      this.historyNext();
      return true;
    }

    if (name === 'left' || (ctrl && name === 'b')) {
      if (ctrl && name === 'left') {
        // Jump word left
        const before = this.buffer.slice(0, this.cursor);
        const match = before.match(/\S+\s*$/) || before.match(/\s+$/);
        if (match) {
          this.cursor -= match[0].length;
        } else {
          this.cursor = 0;
        }
      } else if (this.cursor > 0) {
        const charsBefore = Array.from(this.buffer.slice(0, this.cursor));
        const lastChar = charsBefore.pop();
        if (lastChar) this.cursor -= lastChar.length;
      }
      this.renderInput();
      return true;
    }

    if (name === 'right' || (ctrl && name === 'f')) {
      if (ctrl && name === 'right') {
        // Jump word right
        const after = this.buffer.slice(this.cursor);
        const match = after.match(/^\s*\S+/) || after.match(/^\s+/);
        if (match) {
          this.cursor += match[0].length;
        } else {
          this.cursor = this.buffer.length;
        }
      } else if (this.cursor < this.buffer.length) {
        const charsAfter = Array.from(this.buffer.slice(this.cursor));
        const firstChar = charsAfter.shift();
        if (firstChar) this.cursor += firstChar.length;
      }
      this.renderInput();
      return true;
    }

    if (name === 'paste_start') {
      this.isPasting = true;
      return true;
    }
    if (name === 'paste_end') {
      this.isPasting = false;
      this.onChange();
      return true;
    }

    if (!ctrl && !key.meta && Array.from(name).length === 1) {
      this.buffer = this.buffer.slice(0, this.cursor) + name + this.buffer.slice(this.cursor);
      this.cursor += name.length;
      this.onChange();
      return true;
    }

    return false;
  }

  private onChange(): void {
    if (this.isPasting) return;
    this.renderInput();

    if (this.suggestTimer) clearTimeout(this.suggestTimer);
    this.suggestTimer = setTimeout(() => {
      this.fetchCompletions();
    }, 150);
  }

  private fetchCompletions(): void {
    const completions = this.completer.getCompletions(this.buffer, this.cursor);
    if (completions.length > 0) {
      this.suggestions = completions;
      this.selectedSuggestion = -1;
      this.showSuggestions = true;
      this.renderSuggestions();
    } else {
      this.hideSuggestions();
    }
  }

  private hideSuggestions(): void {
    this.showSuggestions = false;
    this.suggestions = [];
    this.selectedSuggestion = -1;
    this.clearSuggestionArea();
  }

  private applySuggestion(): void {
    if (this.selectedSuggestion < 0 || this.selectedSuggestion >= this.suggestions.length) return;
    const completion = this.suggestions[this.selectedSuggestion]!;

    const beforeCursor = this.buffer.slice(0, this.cursor);
    const afterCursor = this.buffer.slice(this.cursor);

    const triggerIdx = Math.max(
      beforeCursor.lastIndexOf('/'),
      beforeCursor.lastIndexOf('@'),
      beforeCursor.lastIndexOf('#'),
      beforeCursor.lastIndexOf('$'),
      beforeCursor.lastIndexOf('!'),
    );

    if (triggerIdx >= 0) {
      this.buffer = beforeCursor.slice(0, triggerIdx) + completion.text + afterCursor;
      this.cursor = triggerIdx + completion.text.length;
    }

    this.hideSuggestions();
    this.renderInput();
  }

  private submit(): void {
    const input = this.buffer.trim();
    if (!input) return;

    this.history.push(input);
    this.historyIndex = this.history.length;
    this.options.onSubmit(input);
    this.buffer = '';
    this.cursor = 0;
    this.multiLineBuffer = [];
    this.hideSuggestions();
    this.renderInput();
  }

  private cancel(): void {
    this.options.onCancel?.();
  }

  private historyPrev(): void {
    if (this.history.length === 0) return;
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    this.buffer = this.history[this.historyIndex] ?? '';
    this.cursor = this.buffer.length;
    this.renderInput();
  }

  private historyNext(): void {
    if (this.historyIndex >= this.history.length - 1) {
      this.buffer = '';
      this.cursor = 0;
      this.historyIndex = this.history.length;
    } else {
      this.historyIndex++;
      this.buffer = this.history[this.historyIndex] ?? '';
      this.cursor = this.buffer.length;
    }
    this.renderInput();
  }

  private triggerHistorySearch(): void {
    const theme = getTheme();
    this.tui.cursorTo(0, this.tui.height - 1);
    this.tui.write(`\x1B[2K\r${theme.dim}(history-search) ${theme.reset}`);
  }

  renderInput(): void {
    if (this.isPasting) return;
    const y = this.tui.height - 1;
    const prompt = this.options.prompt;

    this.tui.cursorTo(0, y);
    if (this.buffer === '') {
      const placeholder = this.options.isPassword ? '' : '\x1B[90mType a request or /help. Ctrl+K for menu.\x1B[39m';
      this.tui.write(`\x1B[2K\r${prompt}${placeholder}`);
    } else {
      const displayBuffer = this.options.isPassword ? '*'.repeat(this.buffer.length) : this.buffer;
      this.tui.write(`\x1B[2K\r${prompt}${displayBuffer}`);
    }

    // Position cursor at the right spot
    const cursorX = stripAnsiLen(prompt) + this.cursor;
    this.tui.cursorTo(cursorX, y);
  }

  renderSuggestions(): void {
    const cap = getTerminalCapabilities();
    const theme = getTheme();
    const inputLines = Math.max(1, Math.ceil(stripAnsiLen(this.buffer) / this.tui.width));
    const maxItems = Math.min(this.suggestions.length, 6);
    const totalLines = maxItems + 1;
    const y = this.tui.height - inputLines - totalLines;

    const lines: string[] = [];

    // Draw border
    const width = Math.min(cap.width, 80);
    lines.push(`${theme.dim}${'─'.repeat(width)}${theme.reset}`);

    for (let i = 0; i < maxItems; i++) {
      const s = this.suggestions[i]!;
      const isSelected = i === this.selectedSuggestion;
      const icon = s.icon ?? ' ';
      const prefix = isSelected ? `${theme.accent}▸${theme.reset}` : ' ';
      const bg = isSelected
        ? (cap.colorDepth >= 256 ? '\x1B[48;5;237m' : '\x1B[7m')
        : '';
      const label = s.label.padEnd(25).slice(0, 25);
      lines.push(`${bg}${prefix} ${icon} ${theme.accent}${label}${theme.reset} ${theme.dim}${s.description}${theme.reset}${bg ? '\x1B[49m' : ''}`);
    }

    // Clear and draw suggestion area
    for (let i = 0; i < totalLines; i++) {
      this.tui.cursorTo(0, y + i);
      this.tui.write('\x1B[2K' + lines[i]);
    }
    
    // Restore cursor position for input

    this.renderInput();
  }

  clearSuggestionArea(): void {
    const inputLines = Math.max(1, Math.ceil(stripAnsiLen(this.buffer) / this.tui.width));
    // Clear up to 7 lines above the input
    const maxLines = 7;
    const y = this.tui.height - inputLines - maxLines;
    for (let i = 0; i < maxLines; i++) {
      this.tui.cursorTo(0, y + i);
      this.tui.write('\x1B[2K');
    }
  }

  clearAll(): void {
    this.buffer = '';
    this.cursor = 0;
    this.multiLineBuffer = [];
    this.hideSuggestions();
    this.renderInput();
  }

  focus(): void {
    this.renderInput();
  }
}

const ESC_LITERAL = '\u001B';

function stripAnsiLen(text: string): number {
  return text.replace(new RegExp(ESC_LITERAL + '\\[[0-9;]*[a-zA-Z]', 'g'), '').length;
}
