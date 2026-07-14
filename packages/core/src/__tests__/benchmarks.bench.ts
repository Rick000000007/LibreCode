import { describe, it, bench } from 'vitest';
import { TypeScriptAstProvider } from '../ast-editor/typescript';
import { PythonAstProvider } from '../ast-editor/python';
import { VectorIndex, CodeIndexer, TfIdfVectorizer } from '../rag';
import { CheckpointManager, createDiff } from '../checkpoint';
import { LearningMemory } from '../memory';
import { ParallelExecutor } from '../parallel';
import { AutoValidator } from '../validation';
import { MCPClient } from '../mcp';

const LARGE_TS_SOURCE = `
export class LargeClass {
  private items: string[] = [];
  constructor() {
    for (let i = 0; i < 1000; i++) this.items.push(\`item-\${i}\`);
  }
  process(index: number): string {
    return this.items[index] ?? 'unknown';
  }
}

export function heavyComputation(data: number[]): number {
  return data.reduce((a, b) => a + b, 0);
}

export interface DataPoint {
  id: string;
  value: number;
  timestamp: Date;
}

export async function fetchData(url: string): Promise<DataPoint[]> {
  const response = await fetch(url);
  return response.json();
}
`.repeat(50);

const LARGE_PY_SOURCE = `
class DataProcessor:
    def __init__(self):
        self.data = []
    
    def process(self, items: list) -> list:
        return [x * 2 for x in items]
    
    def validate(self, value: int) -> bool:
        return value > 0

def calculate_stats(values: list) -> dict:
    return {
        "mean": sum(values) / len(values),
        "max": max(values),
        "min": min(values),
    }
`.repeat(50);

describe('Performance Benchmarks', () => {
  bench('AST: TypeScript symbol extraction (1000+ lines)', () => {
    const provider = new TypeScriptAstProvider();
    provider.extractSymbols(LARGE_TS_SOURCE);
  });

  bench('AST: TypeScript rename symbol', () => {
    const provider = new TypeScriptAstProvider();
    provider.renameSymbol(LARGE_TS_SOURCE.slice(0, 5000), 'process', 'newProcess');
  });

  bench('AST: Python symbol extraction (1000+ lines)', () => {
    const provider = new PythonAstProvider();
    provider.extractSymbols(LARGE_PY_SOURCE);
  });

  bench('RAG: TfIdfVectorizer fit (100 docs)', () => {
    const v = new TfIdfVectorizer();
    const docs = Array.from({ length: 100 }, (_, i) => `document ${i} contains code about function and class`);
    v.fit(docs);
  });

  bench('RAG: VectorIndex search (10k chunks)', () => {
    const idx = new VectorIndex();
    const chunks = Array.from({ length: 10000 }, (_, i) => ({
      id: `chunk-${i}`,
      file: `file${i}.ts`,
      content: `function func${i}() { return ${i}; }`,
      startLine: 1,
      endLine: 3,
      type: 'function' as const,
      tokens: 10,
    }));
    idx.index(chunks);
    idx.search('function return');
  });

  bench('Checkpoint: createDiff (1000-line files)', () => {
    const oldContent = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n');
    const newContent = Array.from({ length: 1000 }, (_, i) => `line ${i * 2}`).join('\n');
    createDiff(oldContent, newContent);
  });

  bench('Memory: recall from 10k entries', () => {
    const mem = new LearningMemory();
    for (let i = 0; i < 10000; i++) {
      mem.remember('fact', `fact number ${i} about programming`, 'bench', 0.5);
    }
    mem.recall('programming');
  });

  bench('Validation: validate 1k files', () => {
    const validator = new AutoValidator();
    const steps = Array.from({ length: 100 }, (_, i) => ({
      name: `step-${i}`,
      validate: () => ({ passed: true, message: 'ok' }),
    }));
    validator.addSteps(steps);
    validator.runAll();
  });
});
