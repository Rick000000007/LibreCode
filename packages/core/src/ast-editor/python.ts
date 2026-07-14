import type { AstProvider } from './provider.js';
import type { AstEditResult, SymbolInfo, EditRange, Language } from './types.js';

export class PythonAstProvider implements AstProvider {
  readonly language: Language = 'python';

  renameSymbol(source: string, oldName: string, newName: string): AstEditResult {
    const refs = this.findReferences(source, oldName);
    if (refs.length === 0) {
      return { success: false, edits: [], newContent: source, warnings: [`Symbol "${oldName}" not found`] };
    }

    const lines = source.split('\n');
    const sorted = [...refs].sort((a, b) => b.startLine - a.startLine || b.startCol - a.startCol);
    for (const r of sorted) {
      const line = lines[r.startLine - 1];
      if (line !== undefined) {
        const before = line.slice(0, r.startCol);
        const after = line.slice(r.endCol);
        lines[r.startLine - 1] = before + newName + after;
      }
    }

    return {
      success: true,
      edits: [{ type: 'rename', description: `Renamed "${oldName}" to "${newName}"` }],
      newContent: lines.join('\n'),
    };
  }

  insertMethod(source: string, parentName: string, methodCode: string, position?: 'before' | 'after' | number): AstEditResult {
    const symbols = this.extractSymbols(source);
    const parent = symbols.find(s => s.name === parentName && s.kind === 'class');
    if (!parent) {
      return { success: false, edits: [], newContent: source, warnings: [`Class "${parentName}" not found`] };
    }

    const lines = source.split('\n');
    const insertLine = typeof position === 'number' ? position :
      position === 'before' ? parent.startLine : parent.endLine;

    const indent = '    ';
    const indented = methodCode.split('\n').map(l => indent + l).join('\n');
    lines.splice(insertLine, 0, indented);

    return {
      success: true,
      edits: [{ type: 'insert', description: `Inserted method into "${parentName}"` }],
      newContent: lines.join('\n'),
    };
  }

  deleteDeclaration(source: string, name: string): AstEditResult {
    const symbols = this.extractSymbols(source);
    const target = symbols.find(s => s.name === name);
    if (!target) {
      return { success: false, edits: [], newContent: source, warnings: [`Declaration "${name}" not found`] };
    }

    const lines = source.split('\n');
    const startIdx = target.startLine - 1;
    const endIdx = target.endLine;
    lines.splice(startIdx, endIdx - startIdx);

    return {
      success: true,
      edits: [{ type: 'delete', description: `Deleted "${name}"` }],
      newContent: lines.join('\n'),
    };
  }

  moveDeclaration(source: string, name: string, targetLine: number): AstEditResult {
    const symbols = this.extractSymbols(source);
    const target = symbols.find(s => s.name === name);
    if (!target) {
      return { success: false, edits: [], newContent: source, warnings: [`Declaration "${name}" not found`] };
    }

    const lines = source.split('\n');
    const startIdx = target.startLine - 1;
    const endIdx = target.endLine;
    const moved = lines.slice(startIdx, endIdx);
    lines.splice(startIdx, endIdx - startIdx);
    const adj = targetLine > target.startLine ? targetLine - (endIdx - startIdx) : targetLine;
    lines.splice(adj, 0, ...moved);

    return {
      success: true,
      edits: [{ type: 'move', description: `Moved "${name}" to line ${targetLine}` }],
      newContent: lines.join('\n'),
    };
  }

  addImport(source: string, importStatement: string): AstEditResult {
    const lines = source.split('\n');
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().startsWith('import ') || lines[i]!.trim().startsWith('from ')) {
        lastImport = i;
      }
    }

    if (lastImport >= 0) {
      lines.splice(lastImport + 1, 0, importStatement);
    } else {
      lines.unshift(importStatement, '');
    }

    return {
      success: true,
      edits: [{ type: 'add_import', description: `Added import: ${importStatement}` }],
      newContent: lines.join('\n'),
    };
  }

  safeFormat(source: string): AstEditResult {
    return {
      success: true,
      edits: [{ type: 'format', description: 'Trimmed trailing whitespace' }],
      newContent: source.split('\n').map(l => l.replace(/\s+$/, '')).join('\n'),
    };
  }

  extractSymbols(source: string, _filePath?: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();

      const classMatch = trimmed.match(/^class\s+(\w+)/);
      if (classMatch) {
        symbols.push({ name: classMatch[1]!, kind: 'class', startLine: i + 1, endLine: this.findPythonBlockEnd(lines, i) });
        continue;
      }

      const defMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
      if (defMatch) {
        symbols.push({ name: defMatch[1]!, kind: 'function', startLine: i + 1, endLine: this.findPythonBlockEnd(lines, i) });
        continue;
      }
    }

    return symbols;
  }

  findReferences(source: string, name: string, _filePath?: string): EditRange[] {
    const ranges: EditRange[] = [];
    const lines = source.split('\n');
    const regex = new RegExp(`\\b${this.escapeRegex(name)}\\b`, 'g');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;

      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        ranges.push({ startLine: i + 1, startCol: match.index, endLine: i + 1, endCol: match.index + name.length });
      }
    }

    return ranges;
  }

  private findPythonBlockEnd(lines: string[], start: number): number {
    const startIndent = lines[start]!.search(/\S/);
    for (let i = start + 1; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed === '') continue;
      const indent = lines[i]!.search(/\S/);
      if (indent <= startIndent && trimmed !== '') {
        return i;
      }
    }
    return lines.length;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
