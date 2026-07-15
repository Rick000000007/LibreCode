import { getTerminalCapabilities } from './terminal.js';
import { getTheme } from './theme.js';

export interface PaletteItem {
  id: string;
  category: string;
  label: string;
  description: string;
  shortcut?: string;
  icon?: string;
  args?: string[];
  detail?: string;
  action: () => void | Promise<void>;
}

export interface PaletteGroup {
  name: string;
  items: PaletteItem[];
}

export interface PaletteSearchOptions {
  includeFileSearch?: boolean;
  includeSymbolSearch?: boolean;
  fileSearchFn?: (query: string) => Promise<PaletteItem[]>;
  symbolSearchFn?: (query: string) => Promise<PaletteItem[]>;
  recentCommands?: string[];
  aiActions?: PaletteItem[];
}

let recentCommands: string[] = [];
const MAX_RECENT = 10;

export function recordRecentCommand(cmd: string): void {
  recentCommands = [cmd, ...recentCommands.filter((c) => c !== cmd)].slice(0, MAX_RECENT);
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;

  let qi = 0;
  let score = 0;
  let prevMatch = false;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += prevMatch ? 10 : 5;
      if (ti === 0) score += 15;
      qi++;
      prevMatch = true;
    } else {
      prevMatch = false;
    }
  }
  return qi === q.length ? score : 0;
}

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const theme = getTheme();
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const result: string[] = [];
  let lastIdx = 0;

  let i = 0;
  let qi = 0;
  while (i < t.length && qi < q.length) {
    if (t[i] === q[qi]) {
      if (i > lastIdx) result.push(text.slice(lastIdx, i));
      result.push(`${theme.accent}${theme.bold}${text[i]}${theme.reset}`);
      qi++;
      lastIdx = i + 1;
    }
    i++;
  }
  if (lastIdx < text.length) result.push(text.slice(lastIdx));
  return result.join('');
}

export class CommandPalette {
  private items: PaletteItem[] = [];
  private groups: PaletteGroup[] = [];
  private query = '';
  private selectedIndex = 0;
  private visible = false;
  private filteredItems: { item: PaletteItem; score: number }[] = [];
  private onSelect: ((item: PaletteItem) => void) | null = null;
  private searchOptions: PaletteSearchOptions = {};
  private staticSearchResults: PaletteItem[] = [];
  private mode: 'commands' | 'files' | 'symbols' = 'commands';

  constructor() {
    this.filteredItems = [];
  }

  setItems(items: PaletteItem[]): void {
    this.items = items;
    this.mode = 'commands';
    this.groupItems();
  }

  setGroups(groups: PaletteGroup[]): void {
    this.groups = groups;
    this.mode = 'commands';
    this.rebuildFlatItems();
  }

  setSearchOptions(options: PaletteSearchOptions): void {
    this.searchOptions = options;
  }

  private groupItems(): void {
    const groupMap = new Map<string, PaletteItem[]>();
    for (const item of this.items) {
      const group = groupMap.get(item.category) ?? [];
      group.push(item);
      groupMap.set(item.category, group);
    }
    this.groups = Array.from(groupMap.entries()).map(([name, items]) => ({ name, items }));
    this.rebuildFlatItems();
  }

  private rebuildFlatItems(): void {
    this.items = this.groups.flatMap((g) => g.items);
  }

  search(query: string): void {
    this.query = query;
    this.selectedIndex = 0;
    if (!query.trim()) {
      this.filteredItems = this.items.map((item) => ({ item, score: 1 }));
      return;
    }

    // Check for mode prefixes
    if (query.startsWith('> ')) {
      this.mode = 'commands';
      this.doSearch(query.slice(2));
      return;
    }
    if (query.startsWith('. ') && this.searchOptions.includeFileSearch && this.searchOptions.fileSearchFn) {
      this.mode = 'files';
      this.doAsyncSearch(query.slice(2), this.searchOptions.fileSearchFn);
      return;
    }
    if (query.startsWith('# ') && this.searchOptions.includeSymbolSearch && this.searchOptions.symbolSearchFn) {
      this.mode = 'symbols';
      this.doAsyncSearch(query.slice(2), this.searchOptions.symbolSearchFn);
      return;
    }

    this.mode = 'commands';
    this.doSearch(query);
  }

  private doSearch(query: string): void {
    const scored = this.items.map((item) => ({
      item,
      score: Math.max(
        fuzzyScore(query, item.label),
        fuzzyScore(query, item.description),
        fuzzyScore(query, item.category),
        item.shortcut ? fuzzyScore(query, item.shortcut) : 0,
      ),
    }));
    this.filteredItems = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  private async doAsyncSearch(query: string, fn: (q: string) => Promise<PaletteItem[]>): Promise<void> {
    try {
      const results = await fn(query);
      this.filteredItems = results.map((item) => ({ item, score: 100 }));
      this.render();
    } catch {
      this.filteredItems = [];
    }
  }

  open(onSelect?: (item: PaletteItem) => void): void {
    this.visible = true;
    this.query = '';
    this.selectedIndex = 0;
    this.mode = 'commands';

    // Build items with recent commands on top
    const recentItems: PaletteItem[] = [];
    for (const cmd of recentCommands) {
      const existing = this.items.find((i) => i.id === cmd || i.label === cmd);
      if (existing) {
        recentItems.push({ ...existing });
      }
    }

    let allItems = this.items;
    if (recentItems.length > 0) {
      allItems = [
        { id: 'recent', category: 'Recent', label: 'Recent Commands', description: '', action: () => {} },
        ...recentItems,
        ...this.items,
      ];
    }

    this.filteredItems = allItems.map((item) => ({ item, score: 1 }));
    this.onSelect = onSelect ?? null;
    this.render();
  }

  close(): void {
    this.visible = false;
    process.stdout.write('\x1B[2K\r');
    process.stdout.write('\x1B[J');
  }

  isOpen(): boolean {
    return this.visible;
  }

  selectNext(): void {
    if (this.filteredItems.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.filteredItems.length;
    this.render();
  }

  selectPrev(): void {
    if (this.filteredItems.length === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
    this.render();
  }

  getSelected(): PaletteItem | null {
    return this.filteredItems[this.selectedIndex]?.item ?? null;
  }

  getQuery(): string {
    return this.query;
  }

  updateQuery(query: string): void {
    this.query = query;
    this.search(query);
    this.render();
  }

  handleKey(key: { name: string; ctrl: boolean; meta: boolean }): boolean {
    if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
      this.close();
      return true;
    }
    if (key.name === 'enter') {
      this.executeSelected();
      return true;
    }
    if (key.name === 'up') {
      this.selectPrev();
      return true;
    }
    if (key.name === 'down') {
      this.selectNext();
      return true;
    }
    if (key.name === 'backspace') {
      if (this.query.length > 0) {
        this.updateQuery(this.query.slice(0, -1));
      }
      return true;
    }
    if (!key.ctrl && !key.meta && key.name.length === 1) {
      this.updateQuery(this.query + key.name);
      return true;
    }
    return true;
  }

  async executeSelected(): Promise<void> {
    const selected = this.getSelected();
    if (!selected) return;
    if (selected.id !== 'recent') {
      recordRecentCommand(selected.id);
    }
    this.close();
    if (this.onSelect) {
      this.onSelect(selected);
    } else {
      await selected.action();
    }
  }

  private render(): void {
    const cap = getTerminalCapabilities();
    const theme = getTheme();
    const width = Math.min(cap.width, 100);
    const maxItems = Math.min(this.filteredItems.length, Math.max(8, cap.height - 12));
    const lines: string[] = [];

    // Mode hint
    let modeHint = '';
    if (this.mode === 'commands') modeHint = `${theme.dim}> commands${theme.reset}`;
    else if (this.mode === 'files') modeHint = `${theme.dim}. files${theme.reset}`;
    else if (this.mode === 'symbols') modeHint = `${theme.dim}# symbols${theme.reset}`;

    // Input line
    const prefix = `${theme.primary}>${theme.reset} `;
    lines.push(`${prefix}${this.query}${cap.isTTY ? ' ▊' : ''}  ${modeHint}`);

    // Separator
    lines.push(`${theme.dim}${'─'.repeat(width)}${theme.reset}`);

    // Filtered items
    for (let i = 0; i < maxItems; i++) {
      const entry = this.filteredItems[i];
      if (!entry) break;
      const isSelected = i === this.selectedIndex;
      const prefix2 = isSelected ? `${theme.accent}▸${theme.reset}` : ' ';
      const category = `${theme.dim}${entry.item.category}${theme.reset}`;
      const label = highlightMatch(entry.item.label, this.query);
      const desc = `${theme.muted}${entry.item.description.slice(0, width - entry.item.label.length - 20)}${theme.reset}`;
      const shortcut = entry.item.shortcut ? ` ${theme.dim}${entry.item.shortcut}${theme.reset}` : '';
      const detail = entry.item.detail ? ` ${theme.dim}${entry.item.detail}${theme.reset}` : '';

      if (isSelected) {
        const selBg = cap.colorDepth >= 256 ? '\x1B[48;5;237m' : '\x1B[7m';
        lines.push(`${selBg}${prefix2} ${category} ${label} ${desc}${shortcut}${detail}${theme.reset}`);
      } else {
        lines.push(` ${prefix2} ${category} ${label} ${desc}${shortcut}${detail}`);
      }
    }

    // Total count
    const countText = `${this.filteredItems.length} items`;
    lines.push(`${theme.dim}${countText}${theme.reset}`);

    // Mode usage hint
    if (!this.query.startsWith('> ') && !this.query.startsWith('. ') && !this.query.startsWith('# ')) {
      lines.push(`${theme.dim}Use '> ' to filter commands, '. ' to search files, '# ' to search symbols${theme.reset}`);
    }

    const output = lines.join('\n');
    process.stdout.write('\x1B[s');
    process.stdout.write(`\x1B[${maxItems + 5}A`);
    process.stdout.write(output);
    process.stdout.write('\x1B[u');
  }

  renderStatic(): string {
    const cap = getTerminalCapabilities();
    const theme = getTheme();
    const width = Math.min(cap.width, 80);
    const lines: string[] = [];

    lines.push(`${theme.dim}${'─'.repeat(width)}${theme.reset}`);
    lines.push(`  ${theme.bold}Commands${theme.reset}`);
    lines.push('');

    const grouped = new Map<string, { item: PaletteItem; score: number }[]>();
    for (const entry of this.filteredItems) {
      const g = grouped.get(entry.item.category) ?? [];
      g.push(entry);
      grouped.set(entry.item.category, g);
    }

    for (const [category, entries] of grouped) {
      lines.push(`  ${theme.secondary}${category}${theme.reset}`);
      for (const entry of entries.slice(0, 5)) {
        const icon = entry.item.icon ?? ' ';
        const label = entry.item.label;
        const desc = entry.item.description;
        lines.push(`    ${icon} ${theme.accent}/${label}${theme.reset} ${theme.muted}${desc}${theme.reset}`);
        if (entry.item.args) {
          lines.push(`      ${theme.dim}Usage: /${label} ${entry.item.args.join(' ')}${theme.reset}`);
        }
      }
      if (entries.length > 5) {
        lines.push(`    ${theme.dim}... and ${entries.length - 5} more${theme.reset}`);
      }
      lines.push('');
    }

    return lines.join('\n') + '\n';
  }
}
