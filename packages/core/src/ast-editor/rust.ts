import type { AstProvider } from './provider.js';
import type { AstEditResult, AstEdit, EditRange, SymbolInfo } from './types.js';

function posToLineCol(source: string, pos: number): { line: number; col: number } {
  const before = source.slice(0, pos);
  const lines = before.split('\n');
  return { line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

export class RustAstProvider implements AstProvider {
  readonly language = 'rust' as const;

  extractSymbols(source: string, _filePath?: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();
      const fnMatch = trimmed.match(/^(?:pub\s+)?(?:unsafe\s+)?fn\s+(\w+)/);
      if (fnMatch) {
        const endLine = this.findBlockEnd(lines, i);
        symbols.push({ name: fnMatch[1]!, kind: 'function', startLine: i + 1, endLine });
        continue;
      }
      const structMatch = trimmed.match(/^(?:pub\s+)?struct\s+(\w+)/);
      if (structMatch) {
        const endLine = trimmed.endsWith(';') ? i + 1 : this.findBlockEnd(lines, i);
        symbols.push({ name: structMatch[1]!, kind: 'struct', startLine: i + 1, endLine });
        continue;
      }
      const traitMatch = trimmed.match(/^(?:pub\s+)?trait\s+(\w+)/);
      if (traitMatch) {
        const endLine = this.findBlockEnd(lines, i);
        symbols.push({ name: traitMatch[1]!, kind: 'trait', startLine: i + 1, endLine });
        continue;
      }
      const enumMatch = trimmed.match(/^(?:pub\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        const endLine = this.findBlockEnd(lines, i);
        symbols.push({ name: enumMatch[1]!, kind: 'enum', startLine: i + 1, endLine });
        continue;
      }
      const implMatch = trimmed.match(/^(?:pub\s+)?(?:unsafe\s+)?impl\s+/);
      if (implMatch) {
        const endLine = this.findBlockEnd(lines, i);
        symbols.push({ name: `impl at line ${i + 1}`, kind: 'class', startLine: i + 1, endLine });
        continue;
      }
      const modMatch = trimmed.match(/^(?:pub\s+)?mod\s+(\w+)/);
      if (modMatch) {
        symbols.push({ name: modMatch[1]!, kind: 'type', startLine: i + 1, endLine: i + 1 });
        continue;
      }
    }
    return symbols;
  }

  renameSymbol(source: string, oldName: string, newName: string): AstEditResult {
    const edits: AstEdit[] = [];
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let idx = lines[i]!.indexOf(oldName);
      while (idx !== -1) {
        const startCol = idx + 1;
        edits.push({
          type: 'rename',
          description: `Renamed "${oldName}" to "${newName}"`,
          range: { startLine: i + 1, startCol, endLine: i + 1, endCol: startCol + oldName.length },
          oldText: oldName,
          newText: newName,
        });
        idx = lines[i]!.indexOf(oldName, idx + 1);
      }
    }
    if (edits.length === 0) {
      return { success: false, edits: [], newContent: source, warnings: [`Symbol '${oldName}' not found`] };
    }
    const newContent = source.split(oldName).join(newName);
    return { success: true, edits, newContent };
  }

  deleteDeclaration(source: string, name: string): AstEditResult {
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed.match(new RegExp(`^(?:pub\\s+)?(?:unsafe\\s+)?(?:fn|struct|trait|enum|mod)\\s+${name}(?:<|\\s|\\(|;|\\{)`))) {
        const endLine = trimmed.endsWith(';') ? i : this.findBlockEnd(lines, i);
        const startPos = posToLineCol(source, lines.slice(0, i).join('\n').length + 1);
        const endPos = posToLineCol(source, lines.slice(0, endLine).join('\n').length + 1);
        let newContent = lines.slice(0, i).join('\n') + lines.slice(endLine).join('\n');
        newContent = newContent.replace(/\n{3,}/g, '\n\n').trim();
        return {
          success: true,
          edits: [{ type: 'delete', description: `Deleted "${name}"`, range: { startLine: startPos.line, startCol: startPos.col, endLine: endPos.line, endCol: endPos.col } }],
          newContent,
        };
      }
    }
    return { success: false, edits: [], newContent: source, warnings: [`Declaration '${name}' not found`] };
  }

  addImport(source: string, importStatement: string): AstEditResult {
    return { success: true, edits: [{ type: 'add_import', description: `Added ${importStatement}` }], newContent: importStatement + '\n' + source };
  }

  insertMethod(source: string, parentName: string, methodCode: string, _position?: 'before' | 'after' | number): AstEditResult {
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed.match(new RegExp(`^(?:pub\\s+)?(?:unsafe\\s+)?(?:impl|trait)\\s+${parentName}`))) {
        const endLine = this.findBlockEnd(lines, i);
        const insertLine = endLine - 1;
        const indent = '    ';
        const indented = methodCode.split('\n').map(l => indent + l).join('\n');
        lines.splice(insertLine, 0, indented);
        return { success: true, edits: [{ type: 'insert', description: `Inserted method into ${parentName}` }], newContent: lines.join('\n') };
      }
    }
    return { success: false, edits: [], newContent: source, warnings: [`Parent '${parentName}' not found`] };
  }

  moveDeclaration(source: string, name: string, targetLine: number): AstEditResult {
    const delResult = this.deleteDeclaration(source, name);
    if (!delResult.success) return delResult;
    const lines = delResult.newContent.split('\n');
    const insertIdx = Math.min(targetLine - 1, lines.length);
    lines.splice(insertIdx, 0, '');
    const lines2 = source.split('\n');
    for (let i = 0; i < lines2.length; i++) {
      if (lines2[i]!.includes(name) && (lines2[i]!.includes('fn ') || lines2[i]!.includes('struct ') || lines2[i]!.includes('impl '))) {
        const endLine = lines2[i]!.endsWith(';') ? i : this.findBlockEnd(lines2, i);
        lines.splice(insertIdx + 1, 0, ...lines2.slice(i, endLine));
        break;
      }
    }
    return { success: true, edits: [{ type: 'move', description: `Moved "${name}" to line ${targetLine}` }], newContent: lines.join('\n') };
  }

  safeFormat(source: string): AstEditResult {
    const lines = source.split('\n').map(l => l.trimEnd());
    return { success: true, edits: [{ type: 'format', description: 'Trimmed trailing whitespace' }], newContent: lines.join('\n') };
  }

  findReferences(source: string, name: string, _filePath?: string): EditRange[] {
    const ranges: EditRange[] = [];
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let idx = lines[i]!.indexOf(name);
      while (idx !== -1) {
        ranges.push({ startLine: i + 1, startCol: idx + 1, endLine: i + 1, endCol: idx + 1 + name.length });
        idx = lines[i]!.indexOf(name, idx + 1);
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
}
