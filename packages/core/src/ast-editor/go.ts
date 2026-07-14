import type { AstProvider } from './provider.js';
import type { AstEditResult, AstEdit, EditRange, SymbolInfo } from './types.js';

export class GoAstProvider implements AstProvider {
  readonly language = 'go' as const;

  extractSymbols(source: string, _filePath?: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();

      const funcMatch = trimmed.match(/^func\s+(?:\([^)]*\)\s+)?(\w+)/);
      if (funcMatch) {
        const endLine = trimmed.endsWith('{') ? this.findBlockEnd(lines, i) : i + 1;
        symbols.push({ name: funcMatch[1]!, kind: 'function', startLine: i + 1, endLine });
        continue;
      }

      const typeMatch = trimmed.match(/^type\s+(\w+)\s+(struct|interface)\b/);
      if (typeMatch) {
        const endLine = this.findBlockEnd(lines, i);
        symbols.push({ name: typeMatch[1]!, kind: typeMatch[2] === 'struct' ? 'class' : 'interface', startLine: i + 1, endLine });
        continue;
      }

      const typeDefMatch = trimmed.match(/^type\s+(\w+)\s+/);
      if (typeDefMatch) {
        symbols.push({ name: typeDefMatch[1]!, kind: 'type', startLine: i + 1, endLine: i + 1 });
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
        edits.push({
          type: 'rename',
          description: `Renamed "${oldName}" to "${newName}"`,
          range: { startLine: i + 1, startCol: idx + 1, endLine: i + 1, endCol: idx + 1 + oldName.length },
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
      if (trimmed.match(new RegExp(`^(func|type)\\s+${name}(?:\\s|\\(|<)`)) || trimmed.match(new RegExp(`^type\\s+${name}\\s+`))) {
        const endLine = trimmed.endsWith('{') ? this.findBlockEnd(lines, i) : i + 1;
        const startLine = i + 1;
        let newContent = lines.slice(0, i).join('\n') + '\n' + lines.slice(endLine).join('\n');
        newContent = newContent.replace(/\n{3,}/g, '\n\n').trim();
        return {
          success: true,
          edits: [{ type: 'delete', description: `Deleted "${name}"`, range: { startLine, startCol: 1, endLine, endCol: 1 } }],
          newContent,
        };
      }
    }
    return { success: false, edits: [], newContent: source, warnings: [`Declaration '${name}' not found`] };
  }

  addImport(source: string, importStatement: string): AstEditResult {
    const lines = source.split('\n');
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().startsWith('import')) {
        insertIdx = i + 1;
        while (insertIdx < lines.length && lines[insertIdx]!.trim().startsWith('"')) insertIdx++;
      }
    }
    lines.splice(insertIdx, 0, importStatement);
    return { success: true, edits: [{ type: 'add_import', description: `Added import` }], newContent: lines.join('\n') };
  }

  insertMethod(source: string, parentName: string, methodCode: string, _position?: 'before' | 'after' | number): AstEditResult {
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().match(new RegExp(`^type\\s+${parentName}\\s+struct\\s*\\{`))) {
        const endLine = this.findBlockEnd(lines, i);
        const indent = '\t';
        const indented = methodCode.split('\n').map(l => indent + l).join('\n');
        lines.splice(endLine - 1, 0, indented);
        return { success: true, edits: [{ type: 'insert', description: `Inserted into ${parentName}` }], newContent: lines.join('\n') };
      }
    }
    return { success: false, edits: [], newContent: source, warnings: [`Type '${parentName}' not found`] };
  }

  moveDeclaration(source: string, name: string, targetLine: number): AstEditResult {
    const del = this.deleteDeclaration(source, name);
    if (!del.success) return del;
    const lines = del.newContent.split('\n');
    const insertIdx = Math.min(Math.max(targetLine - 1, 0), lines.length);
    const srcLines = source.split('\n');
    for (let i = 0; i < srcLines.length; i++) {
      if (srcLines[i]!.trim().startsWith('func ') || srcLines[i]!.trim().startsWith('type ')) {
        if (srcLines[i]!.includes(name)) {
          const endLine = srcLines[i]!.endsWith('{') ? this.findBlockEnd(srcLines, i) : i + 1;
          lines.splice(insertIdx, 0, '', ...srcLines.slice(i, endLine));
          break;
        }
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
