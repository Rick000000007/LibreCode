export type Language = 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'generic';

export interface EditRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface AstEdit {
  type: 'rename' | 'insert' | 'delete' | 'move' | 'add_import' | 'format';
  description: string;
  range?: EditRange;
  oldText?: string;
  newText?: string;
}

export interface AstEditResult {
  success: boolean;
  edits: AstEdit[];
  newContent: string;
  warnings?: string[];
}

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'method' | 'variable' | 'import' | 'struct' | 'trait' | 'enum';
  startLine: number;
  endLine: number;
  visibility?: 'public' | 'private' | 'protected' | 'exported';
  signature?: string;
}

export function detectLanguage(filename: string): Language {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts': case 'tsx': case 'mts': return 'typescript';
    case 'js': case 'jsx': case 'mjs': case 'cjs': return 'javascript';
    case 'py': return 'python';
    case 'rs': return 'rust';
    case 'go': return 'go';
    default: return 'generic';
  }
}
