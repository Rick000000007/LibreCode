import { describe, it, expect } from 'vitest';
import { TypeScriptAstProvider } from '../ast-editor/typescript';
import { PythonAstProvider } from '../ast-editor/python';
import { detectLanguage } from '../ast-editor/types';
import { AstProviderRegistry } from '../ast-editor/registry';

describe('TypeScriptAstProvider', () => {
  const provider = new TypeScriptAstProvider();

  it('extracts symbols from TypeScript', () => {
    const source = `export class MyClass {
  method1() {}
}
function helper() {}
interface Foo {}`;
    const symbols = provider.extractSymbols(source);
    expect(symbols.some(s => s.name === 'MyClass' && s.kind === 'class')).toBe(true);
    expect(symbols.some(s => s.name === 'helper' && s.kind === 'function')).toBe(true);
    expect(symbols.some(s => s.name === 'Foo' && s.kind === 'interface')).toBe(true);
  });

  it('renames a symbol', () => {
    const source = 'const x = 1;\nconsole.log(x);';
    const result = provider.renameSymbol(source, 'x', 'y');
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('const y = 1');
    expect(result.newContent).toContain('console.log(y)');
  });

  it('reports missing symbol', () => {
    const result = provider.renameSymbol('const a = 1;', 'nonexistent', 'b');
    expect(result.success).toBe(false);
    expect(result.warnings).toBeDefined();
  });

  it('deletes a declaration', () => {
    const source = 'function foo() { return 1; }\nconst x = foo();';
    const result = provider.deleteDeclaration(source, 'foo');
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('function foo');
  });

  it('adds an import', () => {
    const source = 'import { a } from "./a";\nconst x = 1;';
    const result = provider.addImport(source, 'import { b } from "./b";');
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('import { b }');
  });

  it('formats safely', () => {
    const result = provider.safeFormat('const x = 1;  \nconst y = 2;');
    expect(result.newContent).not.toMatch(/[ \t]+$/m);
  });

  it('inserts a method into a class', () => {
    const source = 'class MyClass {\n  existing() {}\n}';
    const result = provider.insertMethod(source, 'MyClass', 'newMethod() {}');
    expect(result.success).toBe(true);
  });

  it('finds references', () => {
    const source = 'const val = 1;\nconsole.log(val);\n// val comment';
    const refs = provider.findReferences(source, 'val');
    expect(refs.length).toBeGreaterThan(0);
  });
});

describe('PythonAstProvider', () => {
  const provider = new PythonAstProvider();

  it('extracts symbols', () => {
    const source = 'class MyClass:\n    def method(self):\n        pass\ndef top_level():\n    pass';
    const symbols = provider.extractSymbols(source);
    expect(symbols.some(s => s.name === 'MyClass')).toBe(true);
    expect(symbols.some(s => s.name === 'top_level')).toBe(true);
  });

  it('renames symbols', () => {
    const source = 'x = 1\nprint(x)';
    const result = provider.renameSymbol(source, 'x', 'y');
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('y = 1');
  });

  it('deletes declarations', () => {
    const source = 'def old_func():\n    pass\n\ndef keep():\n    pass';
    const result = provider.deleteDeclaration(source, 'old_func');
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('old_func');
  });
});

describe('AstProviderRegistry', () => {
  it('provides TypeScript provider', () => {
    const registry = new AstProviderRegistry();
    const provider = registry.getProvider('typescript');
    expect(provider).not.toBeNull();
    expect(provider!.language).toBe('typescript');
  });

  it('provides provider by file extension', () => {
    const registry = new AstProviderRegistry();
    expect(registry.getProviderForFile('file.ts')).not.toBeNull();
    expect(registry.getProviderForFile('file.py')).not.toBeNull();
    expect(registry.getProviderForFile('file.rs')).not.toBeNull();
    expect(registry.getProviderForFile('file.go')).not.toBeNull();
  });

  it('lists supported languages', () => {
    const registry = new AstProviderRegistry();
    const langs = registry.getSupportedLanguages();
    expect(langs).toContain('typescript');
    expect(langs).toContain('python');
  });
});

describe('detectLanguage', () => {
  it('detects TypeScript', () => expect(detectLanguage('file.ts')).toBe('typescript'));
  it('detects TSX', () => expect(detectLanguage('file.tsx')).toBe('typescript'));
  it('detects Python', () => expect(detectLanguage('file.py')).toBe('python'));
  it('detects Rust', () => expect(detectLanguage('file.rs')).toBe('rust'));
  it('detects Go', () => expect(detectLanguage('file.go')).toBe('go'));
  it('falls back to generic', () => expect(detectLanguage('file.rb')).toBe('generic'));
});
