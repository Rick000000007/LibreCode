import type { PaletteItem } from './palette.js';
import type { Theme } from './theme.js';
import type { Completion, CompletionContext } from './completer.js';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
}

export interface IPlugin {
  manifest: PluginManifest;

  activate?(manager: PluginManager): void | Promise<void>;
  deactivate?(): void | Promise<void>;

  /** Return additional palette items to register */
  getPaletteItems?(): PaletteItem[];

  /** Return additional completions based on input context */
  getCompletions?(input: string, cursorPos: number, context: CompletionContext): Completion[];

  /** Return a custom theme override */
  getTheme?(): Partial<Theme> | null;
}

export class PluginManager {
  private plugins: Map<string, IPlugin> = new Map();
  private paletteItems: PaletteItem[] = [];
  private themeOverrides: Partial<Theme>[] = [];

  register(plugin: IPlugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin "${plugin.manifest.id}" is already registered`);
    }
    this.plugins.set(plugin.manifest.id, plugin);

    const items = plugin.getPaletteItems?.() ?? [];
    this.paletteItems.push(...items);

    const theme = plugin.getTheme?.();
    if (theme) {
      this.themeOverrides.push(theme);
    }

    plugin.activate?.(this);
  }

  unregister(id: string): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.deactivate?.();
      this.plugins.delete(id);

      const items = plugin.getPaletteItems?.() ?? [];
      for (const item of items) {
        const idx = this.paletteItems.indexOf(item);
        if (idx >= 0) this.paletteItems.splice(idx, 1);
      }

      const theme = plugin.getTheme?.();
      if (theme) {
        const idx = this.themeOverrides.indexOf(theme);
        if (idx >= 0) this.themeOverrides.splice(idx, 1);
      }
    }
  }

  getPlugin(id: string): IPlugin | undefined {
    return this.plugins.get(id);
  }

  getAllPlugins(): IPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPaletteItems(): PaletteItem[] {
    return [...this.paletteItems];
  }

  getThemeOverrides(): Partial<Theme>[] {
    return [...this.themeOverrides];
  }

  getCompletions(input: string, cursorPos: number, context: CompletionContext): Completion[] {
    const results: Completion[] = [];
    for (const plugin of this.plugins.values()) {
      const completions = plugin.getCompletions?.(input, cursorPos, context) ?? [];
      results.push(...completions);
    }
    return results;
  }
}
