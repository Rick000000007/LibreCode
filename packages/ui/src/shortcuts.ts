export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  description: string;
  category: string;
}

export interface ShortcutAction {
  id: string;
  description: string;
  category: string;
  defaultKeys: string[];
  action: () => void | Promise<void>;
}

export class KeyboardManager {
  private actions: Map<string, ShortcutAction> = new Map();
  private customBindings: Map<string, string> = new Map();

  register(action: ShortcutAction): void {
    this.actions.set(action.id, action);
  }

  getActions(): ShortcutAction[] {
    return Array.from(this.actions.values());
  }

  getAction(id: string): ShortcutAction | undefined {
    return this.actions.get(id);
  }

  getKeys(actionId: string): string[] {
    const action = this.actions.get(actionId);
    return action?.defaultKeys ?? [];
  }

  rebind(actionId: string, keys: string[]): void {
    const action = this.actions.get(actionId);
    if (action) {
      action.defaultKeys = keys;
    }
  }

  formatKeybinding(keys: string[]): string {
    return keys.map((k) => {
      const parts: string[] = [];
      const lower = k.toLowerCase();
      if (lower.includes('ctrl+')) parts.push('⌃');
      if (lower.includes('meta+')) parts.push('⌥');
      if (lower.includes('shift+')) parts.push('⇧');
      const key = k.split('+').pop() ?? '';
      if (key.length === 1) parts.push(key.toUpperCase());
      else if (key === 'enter') parts.push('⏎');
      else if (key === 'escape' || key === 'esc') parts.push('⎋');
      else if (key === 'tab') parts.push('⇥');
      else if (key === 'backspace') parts.push('⌫');
      else if (key === 'delete') parts.push('⌦');
      else if (key === 'space') parts.push('␣');
      else if (key === 'up') parts.push('↑');
      else if (key === 'down') parts.push('↓');
      else if (key === 'left') parts.push('←');
      else if (key === 'right') parts.push('→');
      else if (key === 'pageup') parts.push('⇞');
      else if (key === 'pagedown') parts.push('⇟');
      else if (key === 'home') parts.push('↖');
      else if (key === 'end') parts.push('↘');
      else parts.push(key.charAt(0).toUpperCase() + key.slice(1));
      return parts.join('');
    }).join(' ');
  }
}

export const defaultShortcuts: ShortcutAction[] = [
  { id: 'command_palette', description: 'Open Command Palette', category: 'General', defaultKeys: ['ctrl+k'], action: () => {} },
  { id: 'file_search', description: 'Search Files', category: 'Navigation', defaultKeys: ['ctrl+p'], action: () => {} },
  { id: 'prompt_history', description: 'Prompt History', category: 'Editing', defaultKeys: ['ctrl+r'], action: () => {} },
  { id: 'clear_screen', description: 'Clear Screen', category: 'View', defaultKeys: ['ctrl+l'], action: () => {} },
  { id: 'save_draft', description: 'Save Draft', category: 'Editing', defaultKeys: ['ctrl+s'], action: () => {} },
  { id: 'toggle_sidebar', description: 'Toggle Sidebar', category: 'View', defaultKeys: ['ctrl+b'], action: () => {} },
  { id: 'search_conversation', description: 'Search Conversation', category: 'Navigation', defaultKeys: ['ctrl+f'], action: () => {} },
  { id: 'new_session', description: 'New Session', category: 'Session', defaultKeys: ['ctrl+n'], action: () => {} },
  { id: 'cancel', description: 'Cancel Current', category: 'General', defaultKeys: ['ctrl+c'], action: () => {} },
  { id: 'submit', description: 'Submit Prompt', category: 'Editing', defaultKeys: ['enter'], action: () => {} },
  { id: 'newline', description: 'New Line', category: 'Editing', defaultKeys: ['shift+enter'], action: () => {} },
];

let manager: KeyboardManager | null = null;

export function getKeyboardManager(): KeyboardManager {
  if (!manager) {
    manager = new KeyboardManager();
    for (const sc of defaultShortcuts) {
      manager.register(sc);
    }
  }
  return manager;
}

export function parseKeyEvent(input: string): { ctrl: boolean; meta: boolean; shift: boolean; key: string } | null {
  if (!input || input.length === 0) return null;

  const code = input.charCodeAt(0);
  const ctrl = code < 32;
  const key = ctrl
    ? String.fromCharCode(code + 64)
    : input;

  return { ctrl, meta: false, shift: key === key.toUpperCase() && key !== key.toLowerCase(), key };
}
