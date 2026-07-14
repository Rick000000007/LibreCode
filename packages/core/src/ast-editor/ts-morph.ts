import { Project, SyntaxKind, type Node, type SourceFile } from 'ts-morph';
import type { AstProvider } from './provider.js';
import type { AstEditResult, AstEdit, EditRange, SymbolInfo } from './types.js';

function posToLineCol(source: string, pos: number): { line: number; col: number } {
  const before = source.slice(0, pos);
  const lines = before.split('\n');
  return { line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function getNodeName(node: Node): string | undefined {
  return node.getFirstDescendantByKind(SyntaxKind.Identifier)?.getText();
}

function tsKindToSymbolKind(kind: SyntaxKind): SymbolInfo['kind'] | null {
  switch (kind) {
    case SyntaxKind.ClassDeclaration: return 'class';
    case SyntaxKind.InterfaceDeclaration: return 'interface';
    case SyntaxKind.FunctionDeclaration: return 'function';
    case SyntaxKind.MethodDeclaration: return 'method';
    case SyntaxKind.TypeAliasDeclaration: return 'type';
    case SyntaxKind.EnumDeclaration: return 'enum';
    default: return null;
  }
}

export class TsMorphProvider implements AstProvider {
  readonly language = 'typescript' as const;

  extractSymbols(source: string, _filePath?: string): SymbolInfo[] {
    const project = new Project({ useInMemoryFileSystem: true });
    const src = project.createSourceFile('/virtual/file.ts', source);
    const symbols: SymbolInfo[] = [];

    const visit = (node: Node) => {
      const kind = tsKindToSymbolKind(node.getKind());
      if (kind) {
        const name = getNodeName(node) ?? 'anonymous';
        const start = posToLineCol(source, node.getStart());
        const end = posToLineCol(source, node.getEnd());
        const info: SymbolInfo = { name, kind, startLine: start.line, endLine: end.line };
        if (node.getKind() === SyntaxKind.ClassDeclaration || node.getKind() === SyntaxKind.FunctionDeclaration) {
          const text = source.slice(0, node.getStart());
          info.visibility = text.includes('export') ? 'exported' : 'public';
        }
        symbols.push(info);
      }

      const varStmt = node.asKind(SyntaxKind.VariableStatement);
      if (varStmt) {
        for (const decl of varStmt.getDeclarations()) {
          const start = posToLineCol(source, decl.getStart());
          const end = posToLineCol(source, decl.getEnd());
          symbols.push({ name: decl.getName(), kind: 'variable', startLine: start.line, endLine: end.line });
        }
      }

      node.forEachChild(visit);
    };

    visit(src);
    return symbols;
  }

  renameSymbol(source: string, oldName: string, newName: string): AstEditResult {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const src = project.createSourceFile('/virtual/file.ts', source);
      const refs = this.findReferencesInSource(src, oldName);
      if (refs.length === 0) {
        return { success: false, edits: [], newContent: source, warnings: [`Symbol '${oldName}' not found`] };
      }

      const edits: AstEdit[] = refs.map(r => {
        const start = posToLineCol(source, r.pos);
        const end = posToLineCol(source, r.end);
        return {
          type: 'rename',
          description: `Renamed "${oldName}" to "${newName}"`,
          range: { startLine: start.line, startCol: start.col, endLine: end.line, endCol: end.col },
          oldText: oldName,
          newText: newName,
        };
      });

      let newContent = source;
      for (const r of refs.sort((a, b) => b.pos - a.pos)) {
        newContent = newContent.slice(0, r.pos) + newName + newContent.slice(r.end);
      }

      return { success: true, edits, newContent };
    } catch (err) {
      return { success: false, edits: [], newContent: source, warnings: [`Rename failed: ${err instanceof Error ? err.message : String(err)}`] };
    }
  }

  deleteDeclaration(source: string, name: string): AstEditResult {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const src = project.createSourceFile('/virtual/file.ts', source);
      const node = this.findDeclarationNode(src, name);
      if (!node) {
        return { success: false, edits: [], newContent: source, warnings: [`Declaration '${name}' not found`] };
      }

      const start = node.getFullStart();
      const end = node.getEnd();
      const startPos = posToLineCol(source, start);
      const endPos = posToLineCol(source, end);
      let newContent = source.slice(0, start) + source.slice(end);
      newContent = newContent.replace(/\n{3,}/g, '\n\n').trim();

      return {
        success: true,
        edits: [{ type: 'delete', description: `Deleted "${name}"`, range: { startLine: startPos.line, startCol: startPos.col, endLine: endPos.line, endCol: endPos.col }, oldText: source.slice(start, end) }],
        newContent,
      };
    } catch (err) {
      return { success: false, edits: [], newContent: source, warnings: [`Delete failed: ${err instanceof Error ? err.message : String(err)}`] };
    }
  }

  addImport(source: string, importStatement: string): AstEditResult {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const src = project.createSourceFile('/virtual/file.ts', source);
      const existingImports = src.getImportDeclarations();
      let insertPos = 0;
      if (existingImports.length > 0) {
        insertPos = existingImports[existingImports.length - 1]!.getEnd();
      }

      const pos = posToLineCol(source, insertPos);
      const newContent = source.slice(0, insertPos) + '\n' + importStatement + source.slice(insertPos);
      return {
        success: true,
        edits: [{ type: 'add_import', description: `Added import: ${importStatement}`, range: { startLine: pos.line, startCol: pos.col, endLine: pos.line, endCol: pos.col }, newText: importStatement }],
        newContent,
      };
    } catch (err) {
      return { success: false, edits: [], newContent: source, warnings: [`Add import failed: ${err instanceof Error ? err.message : String(err)}`] };
    }
  }

  insertMethod(source: string, className: string, methodCode: string, _position?: 'before' | 'after' | number): AstEditResult {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const src = project.createSourceFile('/virtual/file.ts', source);
      const cls = src.getClass(className);
      if (!cls) {
        return { success: false, edits: [], newContent: source, warnings: [`Class '${className}' not found`] };
      }

      const members = cls.getMembers();
      let insertPos: number;
      if (members.length > 0) {
        insertPos = members[members.length - 1]!.getEnd();
      } else {
        const text = src.getFullText();
        const openingBrace = text.indexOf('{', cls.getPos());
        insertPos = openingBrace + 1;
      }

      const indent = '  ';
      const indentedMethod = methodCode.split('\n').map(l => indent + l).join('\n');
      const pos = posToLineCol(source, insertPos);
      const newContent = source.slice(0, insertPos) + '\n' + indentedMethod + source.slice(insertPos);

      return {
        success: true,
        edits: [{ type: 'insert', description: `Inserted method into ${className}`, range: { startLine: pos.line, startCol: pos.col, endLine: pos.line, endCol: pos.col }, newText: indentedMethod }],
        newContent,
      };
    } catch (err) {
      return { success: false, edits: [], newContent: source, warnings: [`Insert method failed: ${err instanceof Error ? err.message : String(err)}`] };
    }
  }

  moveDeclaration(source: string, name: string, targetLine: number): AstEditResult {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const src = project.createSourceFile('/virtual/file.ts', source);
      const node = this.findDeclarationNode(src, name);
      if (!node) {
        return { success: false, edits: [], newContent: source, warnings: [`Declaration '${name}' not found`] };
      }

      const lines = source.split('\n');
      if (targetLine < 1 || targetLine > lines.length + 1) {
        return { success: false, edits: [], newContent: source, warnings: [`Target line ${targetLine} out of range`] };
      }

      const start = node.getFullStart();
      const end = node.getEnd();
      const declText = source.slice(start, end);
      let contentWithout = source.slice(0, start) + source.slice(end);
      contentWithout = contentWithout.replace(/\n{3,}/g, '\n\n').trimEnd();

      const linesWithout = contentWithout.split('\n');
      const insertIdx = Math.min(targetLine - 1, linesWithout.length);
      linesWithout.splice(insertIdx, 0, '', declText);
      const newContent = linesWithout.join('\n');

      return {
        success: true,
        edits: [{ type: 'move', description: `Moved "${name}" to line ${targetLine}`, range: { startLine: 1, startCol: 1, endLine: lines.length, endCol: 1 }, oldText: source, newText: newContent }],
        newContent,
      };
    } catch (err) {
      return { success: false, edits: [], newContent: source, warnings: [`Move failed: ${err instanceof Error ? err.message : String(err)}`] };
    }
  }

  safeFormat(source: string): AstEditResult {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const src = project.createSourceFile('/virtual/file.ts', source);
      src.formatText();
      const newContent = src.getFullText();
      return { success: true, edits: [{ type: 'format', description: 'Formatted source' }], newContent };
    } catch (err) {
      return { success: false, edits: [], newContent: source, warnings: [`Format failed: ${err instanceof Error ? err.message : String(err)}`] };
    }
  }

  findReferences(source: string, name: string, _filePath?: string): EditRange[] {
    const project = new Project({ useInMemoryFileSystem: true });
    const src = project.createSourceFile('/virtual/file.ts', source);
    return this.findReferencesInSource(src, name).map(r => {
      const start = posToLineCol(source, r.pos);
      const end = posToLineCol(source, r.end);
      return { startLine: start.line, startCol: start.col, endLine: end.line, endCol: end.col };
    });
  }

  private findReferencesInSource(src: SourceFile, name: string): { pos: number; end: number }[] {
    const refs: { pos: number; end: number }[] = [];
    const visit = (node: Node) => {
      if (node.isKind(SyntaxKind.Identifier) && node.getText() === name) {
        refs.push({ pos: node.getStart(), end: node.getEnd() });
      }
      node.forEachChild(visit);
    };
    visit(src);
    return refs;
  }

  private findDeclarationNode(src: SourceFile, name: string): Node | undefined {
    return src.getDescendants().find(n => {
      const kind = tsKindToSymbolKind(n.getKind());
      if (!kind) return false;
      return getNodeName(n) === name;
    });
  }
}
