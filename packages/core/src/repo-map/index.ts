import * as fs from 'node:fs';
import * as path from 'node:path';
import { countTokens } from 'librecode-utils';
import type { SymbolEntry, ProjectInfo, DependencyEdge, CrossReference } from './types.js';
export type { SymbolEntry, ProjectInfo, DependencyEdge, CrossReference } from './types.js';
export { IGNORE_PATTERNS, SOURCE_EXTENSIONS } from './types.js';
import { detectProject, getRecentFiles } from './project-utils.js';
import { extractSymbols } from './symbol-extractors.js';
import { isIgnored } from './walk-utils.js';

export class RepoMapper {
  private entries: Map<string, SymbolEntry[]> = new Map();
  private projectInfo: ProjectInfo | null = null;
  private dependencyGraph: Map<string, DependencyEdge[]> = new Map();
  private crossReferences: Map<string, CrossReference> = new Map();
  private fileTimestamps: Map<string, number> = new Map();
  private indexedAt: number = 0;
  private cacheTTL: number = 30_000;

  indexDirectory(dir: string): void {
    this.indexedAt = Date.now();
    this.projectInfo = detectProject(dir);
    this.entries.clear();
    this.dependencyGraph.clear();
    this.crossReferences.clear();
    this.fileTimestamps.clear();

    this.walkDirectory(dir, dir);
    this.lastIndexed = Date.now();
  }

  private lastIndexed: number = 0;

  private walkDirectory(baseDir: string, currentPath: string): void {
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch { return; }

    for (const item of items) {
      const itemPath = path.join(currentPath, item.name);
      if (isIgnored(itemPath)) continue;

      if (item.isDirectory()) {
        this.walkDirectory(baseDir, itemPath);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).slice(1);
        if (!['rs', 'ts', 'js', 'jsx', 'tsx', 'py', 'go', 'java', 'c', 'cpp', 'h'].includes(ext)) continue;

        const stat = fs.statSync(itemPath);
        this.fileTimestamps.set(itemPath, stat.mtimeMs);
        const symbols = extractSymbols(itemPath, ext);
        if (symbols.length > 0) {
          const rel = path.relative(baseDir, itemPath);
          this.entries.set(rel, symbols);
          this.buildDependencies(rel, symbols);
          this.buildCrossReferences(rel, symbols);
        }
      }
    }
  }

  needsReindex(dir: string): boolean {
    if (Date.now() - this.indexedAt > this.cacheTTL) return true;
    return this.checkTimestamps(dir);
  }

  private checkTimestamps(dir: string): boolean {
    const walkDir = (currentPath: string): boolean => {
      let items: fs.Dirent[];
      try {
        items = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch { return false; }
      for (const item of items) {
        const itemPath = path.join(currentPath, item.name);
        if (isIgnored(itemPath)) continue;
        if (item.isDirectory()) {
          if (walkDir(itemPath)) return true;
        } else if (item.isFile()) {
          const ext = path.extname(item.name).slice(1);
          if (['rs', 'ts', 'js', 'jsx', 'tsx', 'py', 'go', 'java', 'c', 'cpp', 'h'].includes(ext)) {
            const stat = fs.statSync(itemPath);
            if (this.fileTimestamps.get(itemPath) !== stat.mtimeMs) return true;
          }
        }
      }
      return false;
    };
    return walkDir(dir);
  }

  generateMap(maxTokens: number): string {
    let output = '';
    let tokenCount = 0;

    if (this.projectInfo) {
      const header = `Project: ${this.projectInfo.name} (${this.projectInfo.language})\n${this.projectInfo.description ?? ''}\n\n`;
      const tokens = countTokens(header);
      if (tokenCount + tokens <= maxTokens) {
        output += header;
        tokenCount += tokens;
      }
      if (this.projectInfo.dependencies.length > 0) {
        const deps = `Dependencies: ${this.projectInfo.dependencies.join(', ')}\n\n`;
        const tokens = countTokens(deps);
        if (tokenCount + tokens <= maxTokens) {
          output += deps;
          tokenCount += tokens;
        }
      }
    }

    const sortedEntries = Array.from(this.entries.entries()).sort((a, b) => {
      const aImports = a[1].some((s) => s.kind === 'use' || s.kind === 'import');
      const bImports = b[1].some((s) => s.kind === 'use' || s.kind === 'import');
      return Number(bImports) - Number(aImports);
    });

    for (const [file, symbols] of sortedEntries) {
      const header = `${file}:\n`;
      const headerTokens = countTokens(header);
      if (tokenCount + headerTokens > maxTokens) break;

      let fileContent = header;
      let fileTokenCount = headerTokens;
      let truncated = false;

      const imports = symbols.filter((s) => s.kind === 'use' || s.kind === 'import');
      if (imports.length > 0) {
        const importLine = `  imports: ${imports.map((s) => s.name).join(', ')}\n`;
        const tokens = countTokens(importLine);
        if (tokenCount + fileTokenCount + tokens <= maxTokens) {
          fileContent += importLine;
          fileTokenCount += tokens;
        } else { truncated = true; }
      }

      for (const sym of symbols) {
        if (sym.kind === 'use' || sym.kind === 'import') continue;
        const exportMarker = sym.exports ? 'export ' : '';
        const line = `  ${exportMarker}${sym.kind} ${sym.name}${sym.signature ? ' ' + sym.signature : ''}\n`;
        const lineTokens = countTokens(line);
        if (tokenCount + fileTokenCount + lineTokens > maxTokens) { truncated = true; break; }
        fileContent += line;
        fileTokenCount += lineTokens;
      }
      if (truncated) fileContent = fileContent.replace(':\n', ': (...)\n');
      output += fileContent;
      tokenCount += fileTokenCount;
    }
    return output;
  }

  getDependencyGraph(): DependencyEdge[] {
    const allEdges: DependencyEdge[] = [];
    for (const edges of this.dependencyGraph.values()) allEdges.push(...edges);
    return allEdges;
  }

  getDependencies(file: string): DependencyEdge[] {
    return this.dependencyGraph.get(file) ?? [];
  }

  getCrossReferences(symbol: string): CrossReference | undefined {
    return this.crossReferences.get(symbol);
  }

  findSymbol(name: string): Array<{ file: string; kind: string; line: number }> {
    const results: Array<{ file: string; kind: string; line: number }> = [];
    for (const [file, symbols] of this.entries) {
      for (const sym of symbols) {
        if (sym.name === name) results.push({ file, kind: sym.kind, line: sym.line });
      }
    }
    return results;
  }

  getRecentFiles(dir: string): string[] {
    return getRecentFiles(dir);
  }

  private buildDependencies(file: string, symbols: SymbolEntry[]): void {
    const edges: DependencyEdge[] = [];
    for (const sym of symbols) {
      if (sym.imports) {
        for (const imported of sym.imports) edges.push({ from: file, to: imported, kind: 'import' });
      }
    }
    this.dependencyGraph.set(file, edges);
  }

  private buildCrossReferences(file: string, symbols: SymbolEntry[]): void {
    for (const sym of symbols) {
      if (sym.kind === 'import' || sym.kind === 'use') continue;
      const existing = this.crossReferences.get(sym.name) ?? { symbol: sym.name, references: [] };
      existing.references.push({ file, line: sym.line, column: sym.column ?? 0 });
      this.crossReferences.set(sym.name, existing);
    }
  }
}
