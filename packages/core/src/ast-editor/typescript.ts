import type { AstProvider } from './provider.js';
import type { AstEditResult, SymbolInfo, EditRange, Language } from './types.js';

export class TypeScriptAstProvider implements AstProvider {
  readonly language: Language = 'typescript';

  renameSymbol(source: string, oldName: string, newName: string): AstEditResult {
    const edits = this.findReferences(source, oldName);
    if (edits.length === 0) {
      return { success: false, edits: [], newContent: source, warnings: [`Symbol "${oldName}" not found`] };
    }

    const lines = source.split('\n');
    const sorted = [...edits].sort((a, b) => b.startLine - a.startLine || b.startCol - a.startCol);

    for (const range of sorted) {
      const line = lines[range.startLine - 1];
      if (line !== undefined) {
        const before = line.slice(0, range.startCol);
        const after = line.slice(range.endCol);
        lines[range.startLine - 1] = before + newName + after;
      }
    }

    return {
      success: true,
      edits: [{ type: 'rename', description: `Renamed "${oldName}" to "${newName}"`, oldText: oldName, newText: newName }],
      newContent: lines.join('\n'),
    };
  }

  insertMethod(source: string, parentName: string, methodCode: string, position?: 'before' | 'after' | number): AstEditResult {
    const symbols = this.extractSymbols(source);
    const parent = symbols.find(s => s.name === parentName && (s.kind === 'class' || s.kind === 'interface'));
    if (!parent) {
      return { success: false, edits: [], newContent: source, warnings: [`Parent "${parentName}" not found`] };
    }

    const lines = source.split('\n');
    let insertLine: number;

    if (typeof position === 'number') {
      insertLine = position;
    } else if (position === 'before') {
      insertLine = parent.startLine;
    } else {
      insertLine = parent.endLine;
    }

    const indent = this.detectIndent(lines, parent.startLine);
    const indentedMethod = methodCode.split('\n').map(l => indent + l).join('\n');

    lines.splice(insertLine, 0, indentedMethod);

    return {
      success: true,
      edits: [{ type: 'insert', description: `Inserted method into "${parentName}"`, newText: methodCode }],
      newContent: lines.join('\n'),
    };
  }

  deleteDeclaration(source: string, name: string): AstEditResult {
    const symbols = this.extractSymbols(source);
    const target = symbols.find(s => s.name === name && s.kind !== 'import');
    if (!target) {
      return { success: false, edits: [], newContent: source, warnings: [`Declaration "${name}" not found`] };
    }

    const lines = source.split('\n');
    const startIdx = target.startLine - 1;
    const endIdx = target.endLine;
    lines.splice(startIdx, endIdx - startIdx);

    return {
      success: true,
      edits: [{ type: 'delete', description: `Deleted declaration "${name}"` }],
      newContent: lines.join('\n'),
    };
  }

  moveDeclaration(source: string, name: string, targetLine: number): AstEditResult {
    const symbols = this.extractSymbols(source);
    const target = symbols.find(s => s.name === name && s.kind !== 'import');
    if (!target) {
      return { success: false, edits: [], newContent: source, warnings: [`Declaration "${name}" not found`] };
    }

    const lines = source.split('\n');
    const startIdx = target.startLine - 1;
    const endIdx = target.endLine;
    const movedLines = lines.slice(startIdx, endIdx);

    lines.splice(startIdx, endIdx - startIdx);
    const adjustedTarget = targetLine > target.startLine ? targetLine - (endIdx - startIdx) : targetLine;
    lines.splice(adjustedTarget, 0, ...movedLines);

    return {
      success: true,
      edits: [{ type: 'move', description: `Moved "${name}" to line ${targetLine}` }],
      newContent: lines.join('\n'),
    };
  }

  addImport(source: string, importStatement: string): AstEditResult {
    const lines = source.split('\n');
    const lastImportIdx = this.findLastImportLine(lines);

    if (lastImportIdx >= 0) {
      lines.splice(lastImportIdx + 1, 0, importStatement);
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
    const lines = source.split('\n');
    const formatted = lines.map(l => l.replace(/\s+$/, ''));
    return {
      success: true,
      edits: [{ type: 'format', description: 'Trimmed trailing whitespace' }],
      newContent: formatted.join('\n'),
    };
  }

  extractSymbols(source: string, _filePath?: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();

      const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) {
        const endLine = this.findBlockEnd(lines, i);
        symbols.push({ name: classMatch[1]!, kind: 'class', startLine: i + 1, endLine, visibility: trimmed.startsWith('export') ? 'exported' : 'public' });
        continue;
      }

      const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+(\w+)/);
      if (interfaceMatch) {
        const endLine = this.findBlockEnd(lines, i);
        symbols.push({ name: interfaceMatch[1]!, kind: 'interface', startLine: i + 1, endLine });
        continue;
      }

      const typeMatch = trimmed.match(/^(?:export\s+)?type\s+(\w+)/);
      if (typeMatch) {
        symbols.push({ name: typeMatch[1]!, kind: 'type', startLine: i + 1, endLine: i + 1 });
        continue;
      }

      const fnMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (fnMatch) {
        const endLine = line.includes('{') ? this.findBlockEnd(lines, i) : i;
        symbols.push({ name: fnMatch[1]!, kind: 'function', startLine: i + 1, endLine });
        continue;
      }

      const arrowFnMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
      if (arrowFnMatch) {
        const endLine = this.findBlockEnd(lines, i);
        symbols.push({ name: arrowFnMatch[1]!, kind: 'function', startLine: i + 1, endLine });
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
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        if (!this.isCommentLine(line)) {
          ranges.push({
            startLine: i + 1,
            startCol: match.index,
            endLine: i + 1,
            endCol: match.index + name.length,
          });
        }
      }
    }

    return ranges;
  }

  private findBlockEnd(lines: string[], start: number): number {
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

  private findLastImportLine(lines: string[]): number {
    let lastIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().startsWith('import ')) {
        lastIdx = i;
      }
    }
    return lastIdx;
  }

  private detectIndent(lines: string[], lineNum: number): string {
    const line = lines[lineNum - 1] ?? '';
    const match = line.match(/^(\s*)/);
    return (match?.[1] ?? '') + '  ';
  }

  private isCommentLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
