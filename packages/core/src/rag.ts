import * as fs from 'node:fs';
import * as path from 'node:path';
import * as promises from 'node:fs/promises';

export interface Chunk {
  id: string;
  file: string;
  content: string;
  startLine: number;
  endLine: number;
  type: 'function' | 'class' | 'module' | 'block';
  tokens: number;
  embedding?: number[];
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly dimension: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 1536;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey?: string, model = 'text-embedding-3-small') {
    this.apiKey = apiKey ?? process.env['OPENAI_API_KEY'] ?? '';
    this.model = model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) throw new Error('OpenAI API key not configured');
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: texts, model: this.model }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI embedding API error ${res.status}: ${body}`);
    }
    const json = await res.json() as { data: Array<{ embedding: number[] }> };
    return json.data.map(d => d.embedding);
  }
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl?: string, model = 'nomic-embed-text', dimension = 768) {
    this.baseUrl = baseUrl ?? process.env['OLLAMA_URL'] ?? 'http://localhost:11434';
    this.model = model;
    this.dimension = dimension;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Ollama embedding API error ${res.status}: ${body}`);
      }
      const json = await res.json() as { embedding: number[] };
      results.push(json.embedding);
    }
    return results;
  }
}

const STOP_WORDS = new Set([
  'the', 'this', 'that', 'and', 'or', 'for', 'with', 'from', 'function',
  'return', 'const', 'let', 'var', 'import', 'export', 'class', 'void',
  'null', 'true', 'false', 'if', 'else', 'while', 'for', 'try', 'catch',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9_$]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

export class TfIdfVectorizer {
  private idfCache = new Map<string, number>();
  private documentCount = 0;

  fit(documents: string[]): void {
    const df = new Map<string, number>();
    this.documentCount += documents.length;

    for (const doc of documents) {
      const terms = new Set(tokenize(doc));
      for (const term of terms) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }

    for (const [term, count] of df) {
      const existingIdf = this.idfCache.get(term) ?? 0;
      const newIdf = Math.log((this.documentCount + 1) / (count + 1)) + 1;
      this.idfCache.set(term, Math.max(existingIdf, newIdf));
    }
  }

  transform(text: string): Map<string, number> {
    const terms = tokenize(text);
    if (terms.length === 0) return new Map();

    const tf = new Map<string, number>();
    for (const term of terms) {
      tf.set(term, (tf.get(term) ?? 0) + 1);
    }

    const result = new Map<string, number>();
    for (const [term, count] of tf) {
      const idf = this.idfCache.get(term) ?? Math.log((this.documentCount + 2) / 1);
      result.set(term, (count / terms.length) * idf);
    }
    return result;
  }

  cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (const [term, val] of a) {
      const bVal = b.get(term) ?? 0;
      dot += val * bVal;
      normA += val * val;
    }
    for (const [, val] of b) normB += val * val;
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

export class VectorIndex {
  private chunks: Chunk[] = [];
  private vectorizer: TfIdfVectorizer;
  private vectors = new Map<number, Map<string, number>>();
  private embeddings = new Map<number, number[]>();
  private embeddingProvider: EmbeddingProvider | null = null;

  constructor(embeddingProvider?: EmbeddingProvider) {
    this.vectorizer = new TfIdfVectorizer();
    if (embeddingProvider) {
      this.embeddingProvider = embeddingProvider;
    }
  }

  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

  async index(chunks: Chunk[]): Promise<void> {
    const startIdx = this.chunks.length;
    this.chunks.push(...chunks);
    const texts = chunks.map(c => c.content);
    this.vectorizer.fit(texts);

    for (let i = 0; i < chunks.length; i++) {
      this.vectors.set(startIdx + i, this.vectorizer.transform(chunks[i]!.content));
    }

    if (this.embeddingProvider) {
      try {
        const embeds = await this.embeddingProvider.embed(texts);
        for (let i = 0; i < embeds.length; i++) {
          this.embeddings.set(startIdx + i, embeds[i]!);
        }
      } catch {
      }
    }
  }

  search(query: string, topK: number = 10): SearchResult[] {
    if (this.chunks.length === 0) return [];
    const qVec = this.vectorizer.transform(query);
    if (qVec.size === 0) return [];

    const minScore = 0.01;
    const scored: SearchResult[] = [];

    for (let i = 0; i < this.chunks.length; i++) {
      const cVec = this.vectors.get(i);
      if (!cVec) continue;
      const score = this.vectorizer.cosineSimilarity(qVec, cVec);
      if (score > minScore) {
        scored.push({ chunk: this.chunks[i]!, score });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async hybridSearch(query: string, keywordWeight: number = 0.3, topK: number = 10): Promise<SearchResult[]> {
    const keywordResults = this.search(query, topK);
    if (!this.embeddingProvider || this.embeddings.size === 0) return keywordResults;

    try {
      const qEmbeds = await this.embeddingProvider.embed([query]);
      const qEmbed = qEmbeds[0]!;

      const embeddingScores: Array<{ index: number; score: number }> = [];
      for (const [i, embed] of this.embeddings) {
        const score = this.cosineSimilarityVec(qEmbed, embed);
        embeddingScores.push({ index: i, score });
      }
      embeddingScores.sort((a, b) => b.score - a.score);

      const combined = new Map<number, { chunk: Chunk; keywordScore: number; embeddingScore: number }>();
      for (const r of keywordResults) {
        const idx = this.chunks.indexOf(r.chunk);
        combined.set(idx, { chunk: r.chunk, keywordScore: r.score, embeddingScore: 0 });
      }
      for (const es of embeddingScores) {
        const existing = combined.get(es.index) ?? { chunk: this.chunks[es.index]!, keywordScore: 0, embeddingScore: 0 };
        existing.embeddingScore = es.score;
        if (!combined.has(es.index)) combined.set(es.index, existing);
      }

      const results: SearchResult[] = [];
      for (const [, v] of combined) {
        const score = keywordWeight * v.keywordScore + (1 - keywordWeight) * v.embeddingScore;
        if (score > 0.01) results.push({ chunk: v.chunk, score });
      }
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, topK);
    } catch {
      return keywordResults;
    }
  }

  private cosineSimilarityVec(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  clear(): void {
    this.chunks = [];
    this.vectors.clear();
    this.embeddings.clear();
  }

  size(): number {
    return this.chunks.length;
  }
}

function findJsBlockEnd(lines: string[], start: number): number {
  let depth = 0;
  let started = false;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]!) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; }
    }
    if (started && depth <= 0) return i + 1;
  }
  return lines.length;
}

function findPythonBlockEnd(lines: string[], start: number): number {
  const startIndent = lines[start]!.search(/\S/);
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '') continue;
    const indent = lines[i]!.search(/\S/);
    if (indent <= startIndent) return i;
  }
  return lines.length;
}

function chunkContent(filePath: string, content: string): Chunk[] {
  const chunks: Chunk[] = [];
  const lines = content.split('\n');
  const ext = path.extname(filePath).slice(1);

  const isJsFamily = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext);
  const isPy = ext === 'py';
  const isRs = ext === 'rs';

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    let chunk: Chunk | null = null;

    if (isJsFamily || isRs) {
      const decl = isRs
        ? trimmed.match(/^(?:pub\s+)?(?:unsafe\s+)?(?:fn|struct|enum|trait|impl|mod)\s+(\w+)/)
        : trimmed.match(/^(?:export\s+)?(?:abstract\s+)?(?:class|interface|type|enum|function|async\s+function)\s+(\w+)/);

      if (decl) {
        const kind = isRs ? (trimmed.includes('fn') ? 'function' : 'class') : trimmed.includes('function') ? 'function' : trimmed.includes('class') ? 'class' : 'block';
        const endIdx = trimmed.endsWith('{') || trimmed.endsWith(')') || trimmed.endsWith('=>') ? findJsBlockEnd(lines, i) : i + 1;
        const block = lines.slice(i, endIdx);
        chunk = {
          id: `${filePath}:${kind}:${decl[1]}`,
          file: filePath,
          content: block.join('\n'),
          startLine: i + 1,
          endLine: endIdx,
          type: kind as 'function' | 'class' | 'block',
          tokens: block.join(' ').split(/\s+/).length,
        };
        i = endIdx;
      } else {
        i++;
      }
    } else if (isPy) {
      const classMatch = trimmed.match(/^class\s+(\w+)/);
      if (classMatch) {
        const endIdx = findPythonBlockEnd(lines, i);
        chunk = {
          id: `${filePath}:class:${classMatch[1]}`,
          file: filePath,
          content: lines.slice(i, endIdx).join('\n'),
          startLine: i + 1,
          endLine: endIdx,
          type: 'class',
          tokens: 0,
        };
        i = endIdx;
      } else {
        const defMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
        if (defMatch) {
          const endIdx = findPythonBlockEnd(lines, i);
          chunk = {
            id: `${filePath}:fn:${defMatch[1]}`,
            file: filePath,
            content: lines.slice(i, endIdx).join('\n'),
            startLine: i + 1,
            endLine: endIdx,
            type: 'function',
            tokens: 0,
          };
          i = endIdx;
        } else {
          i++;
        }
      }
    } else {
      const blockSize = 50;
      const block = lines.slice(i, i + blockSize);
      chunk = {
        id: `${filePath}:${i + 1}`,
        file: filePath,
        content: block.join('\n'),
        startLine: i + 1,
        endLine: Math.min(i + blockSize, lines.length),
        type: 'block',
        tokens: block.join(' ').split(/\s+/).length,
      };
      i += blockSize;
    }

    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

export class CodeIndexer {
  private index: VectorIndex;
  private fileTimestamps = new Map<string, number>();
  private indexing = false;

  constructor(embeddingProvider?: EmbeddingProvider) {
    this.index = new VectorIndex(embeddingProvider);
  }

  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.index.setEmbeddingProvider(provider);
  }

  async indexDirectory(dir: string): Promise<void> {
    if (this.indexing) return;
    this.indexing = true;
    try {
      const files = await this.findSourceFiles(dir);
      await this.indexFiles(files);
    } finally {
      this.indexing = false;
    }
  }

  async indexFile(filePath: string): Promise<void> {
    try {
      const stat = fs.statSync(filePath);
      this.fileTimestamps.set(filePath, stat.mtimeMs);
      const content = fs.readFileSync(filePath, 'utf-8');
      const chunks = chunkContent(filePath, content);
      await this.index.index(chunks);
    } catch {
    }
  }

  async search(query: string, topK?: number): Promise<SearchResult[]> {
    return this.index.search(query, topK);
  }

  needsReindex(filePath: string): boolean {
    try {
      const stat = fs.statSync(filePath);
      return (this.fileTimestamps.get(filePath) ?? 0) !== stat.mtimeMs;
    } catch {
      return true;
    }
  }

  clear(): void {
    this.index.clear();
    this.fileTimestamps.clear();
  }

  size(): number {
    return this.index.size();
  }

  private async indexFiles(files: string[]): Promise<void> {
    const batchSize = 50;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(f => this.indexFile(f).catch(() => {})));
    }
  }

  private async findSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const walk = async (current: string) => {
      let items: fs.Dirent[];
      try {
        items = await promises.readdir(current, { withFileTypes: true });
      } catch { return; }
      for (const item of items) {
        const full = path.join(current, item.name);
        if (item.isDirectory() && !item.name.startsWith('.') && !['node_modules', 'target', 'dist', 'build', '.git'].includes(item.name)) {
          await walk(full);
        } else if (item.isFile() && /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go)$/.test(item.name)) {
          files.push(full);
        }
      }
    };
    await walk(dir);
    return files;
  }
}
