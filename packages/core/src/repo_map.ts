import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { countTokens } from '@rcode/utils';

interface SymbolEntry {
  kind: string;
  name: string;
  line: number;
  signature: string;
}

interface ProjectInfo {
  name: string;
  language: string;
  description?: string;
  dependencies: string[];
}

const IGNORE_PATTERNS = [
  'target/',
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '__pycache__/',
  '.next/',
  '.cache/',
  'vendor/',
];

const SOURCE_EXTENSIONS = [
  'rs', 'ts', 'js', 'jsx', 'tsx', 'py', 'go', 'java', 'c', 'cpp', 'h',
];

export class RepoMapper {
  private entries: Map<string, SymbolEntry[]> = new Map();
  private projectInfo: ProjectInfo | null = null;

  indexDirectory(dir: string): void {
    this.projectInfo = this.detectProject(dir);
    this.entries.clear();

    const walkDir = (currentPath: string) => {
      let items: fs.Dirent[];
      try {
        items = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch {
        return;
      }

      for (const item of items) {
        const itemPath = path.join(currentPath, item.name);

        if (this.isIgnored(itemPath)) continue;

        if (item.isDirectory()) {
          walkDir(itemPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).slice(1);
          if (SOURCE_EXTENSIONS.includes(ext)) {
            const symbols = this.extractSymbols(itemPath, ext);
            if (symbols.length > 0) {
              const rel = path.relative(dir, itemPath);
              this.entries.set(rel, symbols);
            }
          }
        }
      }
    };

    walkDir(dir);
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

      const imports = symbols.filter(
        (s) => s.kind === 'use' || s.kind === 'import',
      );
      if (imports.length > 0) {
        const importLine = `  imports: ${imports.map((s) => s.name).join(', ')}\n`;
        const tokens = countTokens(importLine);
        if (tokenCount + fileTokenCount + tokens <= maxTokens) {
          fileContent += importLine;
          fileTokenCount += tokens;
        } else {
          truncated = true;
        }
      }

      for (const sym of symbols) {
        if (sym.kind === 'use' || sym.kind === 'import') continue;
        const line = `  ${sym.kind} ${sym.name}${sym.signature ? ' ' + sym.signature : ''}\n`;
        const lineTokens = countTokens(line);
        if (tokenCount + fileTokenCount + lineTokens > maxTokens) {
          truncated = true;
          break;
        }
        fileContent += line;
        fileTokenCount += lineTokens;
      }

      if (truncated) {
        const truncToken = countTokens(' (...)');
        fileContent = fileContent.replace(':\n', ': (...)\n');
        fileTokenCount += truncToken;
      }

      output += fileContent;
      tokenCount += fileTokenCount;
    }

    return output;
  }

  getRecentFiles(dir: string): string[] {
    try {
      const output = execSync(
        'git log --pretty=format:%h --name-only -20',
        { cwd: dir },
      ).toString();

      const lines = output.split('\n');
      const files: string[] = [];

      for (const line of lines) {
        if (
          line.trim() &&
          !line.match(/^[0-9a-f]+$/) &&
          fs.existsSync(path.join(dir, line))
        ) {
          files.push(line.trim());
        }
      }

      return [...new Set(files)];
    } catch {
      return [];
    }
  }

  private isIgnored(itemPath: string): boolean {
    return IGNORE_PATTERNS.some((p) => itemPath.includes(p));
  }

  private detectProject(dir: string): ProjectInfo | null {
    const cargoPath = path.join(dir, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      const content = fs.readFileSync(cargoPath, 'utf-8');
      return this.parseCargoToml(content);
    }

    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const content = fs.readFileSync(pkgPath, 'utf-8');
      return this.parsePackageJson(content);
    }

    const goPath = path.join(dir, 'go.mod');
    if (fs.existsSync(goPath)) {
      const content = fs.readFileSync(goPath, 'utf-8');
      return this.parseGoMod(content);
    }

    const pyprojectPath = path.join(dir, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      return this.parsePyproject(content);
    }

    return null;
  }

  private parseCargoToml(content: string): ProjectInfo {
    let name = '';
    let description: string | undefined;
    const dependencies: string[] = [];
    let inDeps = false;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();

      if (trimmed.startsWith('name') && trimmed.includes('=')) {
        const val = trimmed.split('=')[1]?.trim().replace(/["']/g, '') ?? '';
        name = val;
      }
      if (trimmed.startsWith('description') && trimmed.includes('=')) {
        const val = trimmed.split('=')[1]?.trim().replace(/["']/g, '') ?? '';
        description = val;
      }

      if (
        trimmed === '[dependencies]' ||
        trimmed.startsWith('[dependencies.')
      ) {
        inDeps = true;
        continue;
      }
      if (trimmed.startsWith('[') && trimmed !== '[dependencies]') {
        inDeps = false;
        continue;
      }
      if (inDeps && trimmed.includes('=')) {
        const depName = trimmed.split('=')[0]?.trim() ?? '';
        if (depName) dependencies.push(depName);
      }
    }

    return { name, language: 'rust', description, dependencies };
  }

  private parsePackageJson(content: string): ProjectInfo {
    try {
      const json = JSON.parse(content) as {
        name?: string;
        description?: string;
        dependencies?: Record<string, string>;
      };
      return {
        name: json.name ?? '',
        language: 'javascript',
        description: json.description,
        dependencies: Object.keys(json.dependencies ?? {}),
      };
    } catch {
      return { name: '', language: 'javascript', dependencies: [] };
    }
  }

  private parseGoMod(content: string): ProjectInfo {
    let name = '';
    const dependencies: string[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('module ')) {
        name = trimmed.replace('module ', '').trim();
      }
      if (trimmed.startsWith('require ')) {
        const dep = trimmed.replace('require ', '').split(/\s+/)[0] ?? '';
        if (dep) dependencies.push(dep);
      }
    }

    return { name, language: 'go', dependencies };
  }

  private parsePyproject(content: string): ProjectInfo {
    let name = '';
    let description: string | undefined;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('name') && trimmed.includes('=')) {
        name = trimmed.split('=')[1]?.trim().replace(/["']/g, '') ?? '';
      }
      if (trimmed.startsWith('description') && trimmed.includes('=')) {
        description =
          trimmed.split('=')[1]?.trim().replace(/["']/g, '') ?? '';
      }
    }

    return { name, language: 'python', description, dependencies: [] };
  }

  private extractSymbols(filePath: string, ext: string): SymbolEntry[] {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    switch (ext) {
      case 'rs':
        return this.extractRustSymbols(content);
      case 'py':
        return this.extractPythonSymbols(content);
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return this.extractJsSymbols(content);
      case 'go':
        return this.extractGoSymbols(content);
      default:
        return this.extractGenericSymbols(content);
    }
  }

  private extractRustSymbols(content: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const trimmed = lines[lineNum]!.trim();

      const patterns: Array<[RegExp, string]> = [
        [/^(?:pub\s+)?use\s+([^;]+)/, 'use'],
        [/^(?:pub\s+)?mod\s+([^;\s{]+)/, 'mod'],
        [/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, 'fn'],
        [/^(?:pub\s+)?struct\s+(\w+)/, 'struct'],
        [/^(?:pub\s+)?trait\s+(\w+)/, 'trait'],
        [/^(?:pub\s+)?enum\s+(\w+)/, 'enum'],
        [/^(?:pub\s+)?type\s+(\w+)/, 'type'],
        [/^(?:pub\s+)?const\s+(\w+)/, 'const'],
        [/^(?:pub\s+)?static\s+(\w+)/, 'static'],
        [/^impl\s+(?:<[^>]*>\s*)?(\w+)/, 'impl'],
      ];

      for (const [regex, kind] of patterns) {
        const match = trimmed.match(regex);
        if (match && match[1]) {
          symbols.push({ kind, name: match[1], line: lineNum + 1, signature: '' });
          break;
        }
      }
    }
    return symbols;
  }

  private extractPythonSymbols(content: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const trimmed = lines[lineNum]!.trim();

      const importMatch = trimmed.match(/^(?:from\s+\S+\s+import|import\s+\S+)/);
      if (importMatch) {
        symbols.push({ kind: 'import', name: trimmed, line: lineNum + 1, signature: '' });
        continue;
      }

      const defMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
      if (defMatch && defMatch[1]) {
        symbols.push({ kind: 'fn', name: defMatch[1], line: lineNum + 1, signature: trimmed });
        continue;
      }

      const classMatch = trimmed.match(/^class\s+(\w+)/);
      if (classMatch && classMatch[1]) {
        symbols.push({ kind: 'class', name: classMatch[1], line: lineNum + 1, signature: '' });
      }
    }
    return symbols;
  }

  private extractJsSymbols(content: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const trimmed = lines[lineNum]!.trim();

      const importMatch = trimmed.match(/^import\s+/);
      if (importMatch) {
        symbols.push({ kind: 'import', name: trimmed.replace(/;$/, ''), line: lineNum + 1, signature: '' });
        continue;
      }

      const fnMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (fnMatch && fnMatch[1]) {
        symbols.push({ kind: 'fn', name: fnMatch[1], line: lineNum + 1, signature: '' });
        continue;
      }

      const classMatch = trimmed.match(/^(?:export\s+)?class\s+(\w+)/);
      if (classMatch && classMatch[1]) {
        symbols.push({ kind: 'class', name: classMatch[1], line: lineNum + 1, signature: '' });
        continue;
      }

      const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+(\w+)/);
      if (interfaceMatch && interfaceMatch[1]) {
        symbols.push({ kind: 'interface', name: interfaceMatch[1], line: lineNum + 1, signature: '' });
        continue;
      }

      const typeMatch = trimmed.match(/^(?:export\s+)?type\s+(\w+)/);
      if (typeMatch && typeMatch[1]) {
        symbols.push({ kind: 'type', name: typeMatch[1], line: lineNum + 1, signature: '' });
        continue;
      }

      const arrowFnMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
      if (arrowFnMatch && arrowFnMatch[1]) {
        symbols.push({ kind: 'const fn', name: arrowFnMatch[1], line: lineNum + 1, signature: '' });
      }
    }
    return symbols;
  }

  private extractGoSymbols(content: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const trimmed = lines[lineNum]!.trim();

      const funcMatch = trimmed.match(/^func\s+(?:\([^)]*\)\s+)?(\w+)/);
      if (funcMatch && funcMatch[1]) {
        symbols.push({ kind: 'fn', name: funcMatch[1], line: lineNum + 1, signature: trimmed });
        continue;
      }

      const typeMatch = trimmed.match(/^type\s+(\w+)/);
      if (typeMatch && typeMatch[1]) {
        symbols.push({ kind: 'type', name: typeMatch[1], line: lineNum + 1, signature: '' });
        continue;
      }

      const varConstMatch = trimmed.match(/^(var|const)\s+(\w+)/);
      if (varConstMatch && varConstMatch[2]) {
        symbols.push({ kind: varConstMatch[1]!, name: varConstMatch[2], line: lineNum + 1, signature: '' });
      }
    }
    return symbols;
  }

  private extractGenericSymbols(content: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const trimmed = lines[lineNum]!.trim();

      const fnMatch = trimmed.match(/function\s+(\w+)\s*\(/);
      if (fnMatch && fnMatch[1]) {
        symbols.push({ kind: 'fn', name: fnMatch[1], line: lineNum + 1, signature: '' });
        continue;
      }

      const classMatch = trimmed.match(/class\s+(\w+)/);
      if (classMatch && classMatch[1]) {
        symbols.push({ kind: 'class', name: classMatch[1], line: lineNum + 1, signature: '' });
      }
    }
    return symbols;
  }
}
