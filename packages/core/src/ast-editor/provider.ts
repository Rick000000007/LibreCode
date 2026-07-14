import type { AstEditResult, SymbolInfo, EditRange, Language } from './types.js';

export interface AstProvider {
  readonly language: Language;

  /** Rename a symbol throughout a file */
  renameSymbol(source: string, oldName: string, newName: string): AstEditResult;

  /** Insert a method/function into a class/module */
  insertMethod(source: string, parentName: string, methodCode: string, position?: 'before' | 'after' | number): AstEditResult;

  /** Delete a declaration by name */
  deleteDeclaration(source: string, name: string): AstEditResult;

  /** Move a declaration to a new location in the file */
  moveDeclaration(source: string, name: string, targetLine: number): AstEditResult;

  /** Add an import statement */
  addImport(source: string, importStatement: string): AstEditResult;

  /** Format code safely (preserving comments) */
  safeFormat(source: string): AstEditResult;

  /** Extract all symbols from source */
  extractSymbols(source: string, filePath?: string): SymbolInfo[];

  /** Find references to a symbol */
  findReferences(source: string, name: string, filePath?: string): EditRange[];
}

export function isSupportedLanguage(lang: Language): boolean {
  return lang !== 'generic';
}
