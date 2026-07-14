export interface SymbolEntry {
  kind: string;
  name: string;
  line: number;
  column?: number;
  signature: string;
  exports?: boolean;
  imports?: string[];
}

export interface ProjectInfo {
  name: string;
  language: string;
  description?: string;
  dependencies: string[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  kind: 'import' | 'require' | 'use';
}

export interface CrossReference {
  symbol: string;
  references: Array<{ file: string; line: number; column: number }>;
}

export const IGNORE_PATTERNS = [
  'target/',
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '__pycache__/',
  '.next/',
  '.cache/',
  'vendor/',
  '.librecode/',
  '.rocks/',
];

export const SOURCE_EXTENSIONS = [
  'rs', 'ts', 'js', 'jsx', 'tsx', 'py', 'go', 'java', 'c', 'cpp', 'h',
];
