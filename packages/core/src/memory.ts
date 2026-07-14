export interface MemoryEntry {
  id: string;
  type: 'pattern' | 'preference' | 'fact' | 'project_knowledge' | 'error';
  content: string;
  source: string;
  confidence: number;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface PatternMatch {
  entry: MemoryEntry;
  score: number;
  context: string;
}

type TokenSet = Set<string>;

function tokenize(text: string): TokenSet {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9_]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1),
  );
}

function jaccardSimilarity(a: TokenSet, b: TokenSet): number {
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection / union.size;
}

export class LearningMemory {
  private entries: MemoryEntry[] = [];
  private decayRate = 0.9;
  private maxEntries = 5000;
  private tokenCache = new Map<string, TokenSet>();

  remember(
    type: MemoryEntry['type'],
    content: string,
    source: string,
    confidence: number = 0.5,
    tags: string[] = [],
  ): string {
    const id = crypto.randomUUID();
    this.entries.push({
      id,
      type,
      content,
      source,
      confidence,
      createdAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
      tags,
      metadata: {},
    });

    if (this.entries.length > this.maxEntries) {
      this.evictLeastUsed();
    }

    return id;
  }

  recall(query: string, topK: number = 5): PatternMatch[] {
    const qTokens = this.getTokens(query);
    const scored: PatternMatch[] = [];

    for (const entry of this.entries) {
      if (entry.confidence < 0.01) continue;
      const eTokens = this.getTokens(entry.content);
      const score = jaccardSimilarity(qTokens, eTokens) * entry.confidence;

      this.entryAccess(entry);

      if (score > 0.01) {
        const matchTokens = Array.from(qTokens).filter(t => eTokens.has(t));
        scored.push({
          entry,
          score,
          context: matchTokens.join(' '),
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  recallByType(type: MemoryEntry['type'], topK: number = 10): PatternMatch[] {
    return this.entries
      .filter(e => e.type === type && e.confidence >= 0.01)
      .map(e => {
        this.entryAccess(e);
        return { entry: e, score: e.confidence, context: e.content };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  updateConfidence(id: string, delta: number): boolean {
    const entry = this.entries.find(e => e.id === id);
    if (!entry) return false;
    entry.confidence = Math.max(0, Math.min(1, entry.confidence + delta));
    this.entryAccess(entry);
    return true;
  }

  consolidate(): number {
    let consolidated = 0;
    const threshold = 0.8;
    const batches = this.groupByType();
    const allMerged = new Set<number>();
    let offset = 0;

    for (const batch of batches) {
      const merged = new Set<number>();
      for (let i = 0; i < batch.length; i++) {
        if (merged.has(i)) continue;
        for (let j = i + 1; j < batch.length; j++) {
          if (merged.has(j)) continue;
          const a = batch[i]!;
          const b = batch[j]!;
          const sim = jaccardSimilarity(this.getTokens(a.content), this.getTokens(b.content));
          if (sim >= threshold) {
            a.confidence = Math.max(a.confidence, b.confidence);
            a.lastAccessed = new Date(Math.max(a.lastAccessed.getTime(), b.lastAccessed.getTime()));
            a.accessCount += b.accessCount;
            merged.add(j);
            consolidated++;
          }
        }
      }
      for (const idx of merged) allMerged.add(offset + idx);
      offset += batch.length;
    }

    if (consolidated > 0) {
      const keepIndices = new Set<number>();
      for (let i = 0; i < this.entries.length; i++) {
        if (!allMerged.has(i)) keepIndices.add(i);
      }
      this.entries = this.entries.filter((_, i) => keepIndices.has(i));
    }

    return consolidated;
  }

  forget(threshold: number = 0.2): number {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.confidence >= threshold);
    this.tokenCache.clear();
    return before - this.entries.length;
  }

  stats(): { total: number; byType: Record<string, number>; avgConfidence: number } {
    const byType: Record<string, number> = {};
    let totalConf = 0;
    for (const e of this.entries) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
      totalConf += e.confidence;
    }
    return {
      total: this.entries.length,
      byType,
      avgConfidence: this.entries.length > 0 ? totalConf / this.entries.length : 0,
    };
  }

  clear(): void {
    this.entries = [];
    this.tokenCache.clear();
  }

  private groupByType(): MemoryEntry[][] {
    const groups = new Map<string, MemoryEntry[]>();
    for (const entry of this.entries) {
      const list = groups.get(entry.type) ?? [];
      list.push(entry);
      groups.set(entry.type, list);
    }
    return Array.from(groups.values());
  }

  private entryAccess(entry: MemoryEntry): void {
    entry.lastAccessed = new Date();
    entry.accessCount++;
    entry.confidence *= this.decayRate;
  }

  private evictLeastUsed(): void {
    this.entries.sort((a, b) => a.accessCount - b.accessCount);
    this.entries = this.entries.slice(-Math.floor(this.maxEntries * 0.8));
    this.tokenCache.clear();
  }

  private getTokens(text: string): TokenSet {
    const cached = this.tokenCache.get(text);
    if (cached) return cached;
    const tokens = tokenize(text);
    if (this.tokenCache.size > this.maxEntries * 2) {
      this.tokenCache.clear();
    }
    this.tokenCache.set(text, tokens);
    return tokens;
  }
}
