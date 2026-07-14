import * as fs from 'node:fs';
import type { SymbolEntry } from './types.js';

export function extractSymbols(filePath: string, ext: string): SymbolEntry[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  switch (ext) {
    case 'rs': return extractRustSymbols(content);
    case 'py': return extractPythonSymbols(content);
    case 'ts': case 'tsx': case 'js': case 'jsx': return extractJsSymbols(content);
    case 'go': return extractGoSymbols(content);
    default: return extractGenericSymbols(content);
  }
}

function extractRustSymbols(content: string): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const lines = content.split('\n');
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const trimmed = lines[lineNum]!.trim();
    const useMatch = trimmed.match(/^(?:pub\s+)?use\s+([^;]+);?/);
    if (useMatch) {
      const imports = useMatch[1]!.split('::').filter(Boolean);
      symbols.push({
        kind: 'use',
        name: imports[imports.length - 1] ?? useMatch[1]!,
        line: lineNum + 1,
        signature: useMatch[1]!,
        imports: parseRustImportPath(useMatch[1]!),
      });
      continue;
    }
    const pubFnMatch = trimmed.match(/^pub\s+(?:async\s+)?fn\s+(\w+)/);
    if (pubFnMatch) { symbols.push({ kind: 'fn', name: pubFnMatch[1]!, line: lineNum + 1, signature: trimmed, exports: true }); continue; }
    const fnMatch = trimmed.match(/^(?:async\s+)?fn\s+(\w+)/);
    if (fnMatch) { symbols.push({ kind: 'fn', name: fnMatch[1]!, line: lineNum + 1, signature: trimmed }); continue; }
    const pubStructMatch = trimmed.match(/^pub\s+struct\s+(\w+)/);
    if (pubStructMatch) { symbols.push({ kind: 'struct', name: pubStructMatch[1]!, line: lineNum + 1, signature: '', exports: true }); continue; }
    const structMatch = trimmed.match(/^struct\s+(\w+)/);
    if (structMatch) { symbols.push({ kind: 'struct', name: structMatch[1]!, line: lineNum + 1, signature: '' }); continue; }
    const pubTraitMatch = trimmed.match(/^pub\s+trait\s+(\w+)/);
    if (pubTraitMatch) { symbols.push({ kind: 'trait', name: pubTraitMatch[1]!, line: lineNum + 1, signature: '', exports: true }); continue; }
    const pubEnumMatch = trimmed.match(/^pub\s+enum\s+(\w+)/);
    if (pubEnumMatch) { symbols.push({ kind: 'enum', name: pubEnumMatch[1]!, line: lineNum + 1, signature: '', exports: true }); continue; }
    const pubTypeMatch = trimmed.match(/^pub\s+type\s+(\w+)/);
    if (pubTypeMatch) { symbols.push({ kind: 'type', name: pubTypeMatch[1]!, line: lineNum + 1, signature: '', exports: true }); continue; }
    const implMatch = trimmed.match(/^impl\s+(?:<[^>]*>\s*)?(\w+)/);
    if (implMatch) { symbols.push({ kind: 'impl', name: implMatch[1]!, line: lineNum + 1, signature: '' }); continue; }
  }
  return symbols;
}

function extractPythonSymbols(content: string): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const lines = content.split('\n');
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const trimmed = lines[lineNum]!.trim();
    const importMatch = trimmed.match(/^(?:from\s+(\S+)\s+import|import\s+(\S+))/);
    if (importMatch) {
      const importPath = importMatch[1] ?? importMatch[2] ?? '';
      symbols.push({ kind: 'import', name: importPath, line: lineNum + 1, signature: trimmed, imports: [importPath] });
      continue;
    }
    const defMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
    if (defMatch?.[1]) { symbols.push({ kind: 'fn', name: defMatch[1], line: lineNum + 1, signature: trimmed }); continue; }
    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch?.[1]) { symbols.push({ kind: 'class', name: classMatch[1], line: lineNum + 1, signature: '' }); }
  }
  return symbols;
}

function extractJsSymbols(content: string): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const lines = content.split('\n');
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const trimmed = lines[lineNum]!.trim();
    if (trimmed.match(/^export\s+import\s+/)) continue;
    const importMatch = trimmed.match(/^import\s+(?:\{[^}]*\}\s+from\s+)?['"](\S+)['"]/);
    if (importMatch) {
      symbols.push({ kind: 'import', name: importMatch[1]!, line: lineNum + 1, signature: trimmed, imports: [importMatch[1]!] });
      continue;
    }
    const requireMatch = trimmed.match(/(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"](\S+)['"]\s*\)/);
    if (requireMatch) {
      symbols.push({ kind: 'import', name: requireMatch[1]!, line: lineNum + 1, signature: trimmed, imports: [requireMatch[2]!] });
      continue;
    }
    const fnMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (fnMatch?.[1]) { symbols.push({ kind: 'fn', name: fnMatch[1], line: lineNum + 1, signature: '', exports: trimmed.startsWith('export') }); continue; }
    const classMatch = trimmed.match(/^(?:export\s+)?class\s+(\w+)/);
    if (classMatch?.[1]) { symbols.push({ kind: 'class', name: classMatch[1], line: lineNum + 1, signature: '', exports: trimmed.startsWith('export') }); continue; }
    const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+(\w+)/);
    if (interfaceMatch?.[1]) { symbols.push({ kind: 'interface', name: interfaceMatch[1], line: lineNum + 1, signature: '', exports: trimmed.startsWith('export') }); continue; }
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+(\w+)/);
    if (typeMatch?.[1]) { symbols.push({ kind: 'type', name: typeMatch[1], line: lineNum + 1, signature: '', exports: trimmed.startsWith('export') }); continue; }
    const arrowFnMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
    if (arrowFnMatch?.[1]) { symbols.push({ kind: 'const fn', name: arrowFnMatch[1], line: lineNum + 1, signature: '', exports: trimmed.startsWith('export') }); }
  }
  return symbols;
}

function extractGoSymbols(content: string): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const lines = content.split('\n');
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const trimmed = lines[lineNum]!.trim();
    const funcMatch = trimmed.match(/^func\s+(?:\([^)]*\)\s+)?(\w+)/);
    if (funcMatch?.[1]) { symbols.push({ kind: 'fn', name: funcMatch[1], line: lineNum + 1, signature: trimmed }); continue; }
    const typeMatch = trimmed.match(/^type\s+(\w+)/);
    if (typeMatch?.[1]) { symbols.push({ kind: 'type', name: typeMatch[1], line: lineNum + 1, signature: '' }); continue; }
    const varConstMatch = trimmed.match(/^(var|const)\s+(\w+)/);
    if (varConstMatch?.[2]) { symbols.push({ kind: varConstMatch[1]!, name: varConstMatch[2], line: lineNum + 1, signature: '' }); }
  }
  return symbols;
}

function extractGenericSymbols(content: string): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const lines = content.split('\n');
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const trimmed = lines[lineNum]!.trim();
    const fnMatch = trimmed.match(/function\s+(\w+)\s*\(/);
    if (fnMatch?.[1]) { symbols.push({ kind: 'fn', name: fnMatch[1], line: lineNum + 1, signature: '' }); continue; }
    const classMatch = trimmed.match(/class\s+(\w+)/);
    if (classMatch?.[1]) { symbols.push({ kind: 'class', name: classMatch[1], line: lineNum + 1, signature: '' }); }
  }
  return symbols;
}

function parseRustImportPath(importPath: string): string[] {
  const parts = importPath.split('::');
  if (parts[0] === 'crate' || parts[0] === 'self' || parts[0] === 'super') {
    return [parts.slice(1).join('/')];
  }
  return [parts.join('/')];
}
