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
  action: () => void | Promise<void>;
}

export interface PaletteGroup {
  name: string;
  items: PaletteItem[];
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

  for (let i = 0; i < t.length; i++) {
    if (q.includes(t[i]!) && t.slice(i, i + q.length) === q) {
      if (i > lastIdx) result.push(text.slice(lastIdx, i));
      result.push(`${theme.accent}${theme.bold}${text.slice(i, i + q.length)}${theme.reset}`);
      i += q.length - 1;
      lastIdx = i + 1;
    }
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

  constructor() {
    this.filteredItems = [];
  }

  setItems(items: PaletteItem[]): void {
    this.items = items;
    this.groupItems();
  }

  setGroups(groups: PaletteGroup[]): void {
    this.groups = groups;
    this.rebuildFlatItems();
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
    const scored = this.items.map((item) => ({
      item,
      score: Math.max(
        fuzzyScore(query, item.label),
        fuzzyScore(query, item.description),
        fuzzyScore(query, item.category),
      ),
    }));
    this.filteredItems = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  open(onSelect?: (item: PaletteItem) => void): void {
    this.visible = true;
    this.query = '';
    this.selectedIndex = 0;
    this.filteredItems = this.items.map((item) => ({ item, score: 1 }));
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

  async executeSelected(): Promise<void> {
    const selected = this.getSelected();
    if (!selected) return;
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
    const width = Math.min(cap.width, 80);
    const maxItems = Math.min(this.filteredItems.length, Math.max(5, cap.height - 10));
    const lines: string[] = [];

    // Input line
    const prefix = `${theme.primary}>${theme.reset} `;
    lines.push(`${prefix}${this.query}${cap.isTTY ? ' ▊' : ''}`);

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

      if (isSelected) {
        const selBg = cap.colorDepth >= 256 ? '\x1B[48;5;237m' : '\x1B[7m';
        lines.push(`${selBg}${prefix2} ${category} ${label} ${desc}${shortcut}${theme.reset}`);
      } else {
        lines.push(` ${prefix2} ${category} ${label} ${desc}${shortcut}`);
      }
    }

    const output = lines.join('\n');
    // Save cursor, print, restore
    process.stdout.write('\x1B[s');
    process.stdout.write(`\x1B[${maxItems + 3}A`);
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
