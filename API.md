# LibreCode API Reference

## Agent

The main agent runtime. Processes user requests by calling LLMs and executing tools.
Extracted from `src/index.ts` into `src/agent.ts` for modularity.

```typescript
class Agent {
  readonly ProviderName: string;
  readonly ProviderModel: string;
  constructor(provider, tools, config, workingDir, permissions, providerName?, providerModel?);
  static fromProviderManager(pm, tools, config, workingDir, permissions): Promise<Agent | null>;
  runTurn(userInput, onApproval?): Promise<string>;
  runTurnStreaming(userInput, onEvent, onApproval?): Promise<string>;
  setSystemPrompt(prompt): void;
  estimateTokens(): number;
  contextUsage(): [number, number];
  tokenUsage(): TokenUsage;
  clearHistory(): void;
  setPermission(toolName, allow): void;
  resetPermission(toolName): void;
  listPermissions(): Record<string, string>;
  getMessages(): Message[];
  reflectBefore(userInput): Promise<string>;
  reflectAfter(toolResults): Promise<void>;
  validateToolResult(toolName, args, result): string | null;
  getLastToolResults(): Array<{ name: string; result: string }>;
}
```

## AST Editor

Symbol-aware code editing for TypeScript (ts-morph), JavaScript, Python, Rust, and Go.

```typescript
class AstProviderRegistry {
  getProvider(language): AstProvider | null;
  getProviderForFile(filename): AstProvider | null;
  getSupportedLanguages(): Language[];
  register(provider): void;
  setFallback(provider): void;
}

// Available providers:
class TsMorphProvider     // TypeScript, JavaScript (parser-backed, ts-morph)
class TypeScriptAstProvider  // TypeScript (regex-based, legacy)
class PythonAstProvider     // Python
class RustAstProvider       // Rust (fn, struct, enum, trait, impl, mod)
class GoAstProvider         // Go (func, type, struct, interface, var, const)

interface AstProvider {
  readonly language: 'typescript' | 'javascript' | 'python' | 'rust' | 'go';
  extractSymbols(source): SymbolInfo[];
  renameSymbol(source, oldName, newName): AstEditResult;
  deleteDeclaration(source, name): AstEditResult;
  addImport(source, importStatement): AstEditResult;
  insertMethod(source, className, methodCode): AstEditResult;
  moveDeclaration(source, name, targetLine): AstEditResult;
  safeFormat(source): AstEditResult;
  findReferences(source, name): EditRange[];
}
```

## Hybrid RAG

TF-IDF + Embedding-based code search with OpenAI and Ollama providers.

```typescript
class CodeIndexer {
  constructor(embeddingProvider?: EmbeddingProvider);
  setEmbeddingProvider(provider): void;
  indexDirectory(dir): Promise<void>;
  indexFile(filePath): Promise<void>;
  search(query, topK?): Promise<SearchResult[]>;
  needsReindex(filePath): boolean;
  clear(): void;
}

class VectorIndex {
  constructor(embeddingProvider?: EmbeddingProvider);
  setEmbeddingProvider(provider): void;
  index(chunks: Chunk[]): Promise<void>;
  search(query, topK?): SearchResult[];
  hybridSearch(query, keywordWeight?, topK?): Promise<SearchResult[]>;
  clear(): void;
}

class OpenAIEmbeddingProvider {
  constructor(apiKey?, model?);
}

class OllamaEmbeddingProvider {
  constructor(baseUrl?, model?, dimension?);
}

interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly dimension: number;
}
```

## MCP HTTP Transport

JSON-RPC-based MCP client and server over HTTP.

```typescript
class MCPHttpClient {
  constructor(config: MCPHttpTransportConfig);
  listTools(): Promise<MCPToolDefinition[]>;
  callTool(name, args): Promise<unknown>;
  ping(): Promise<boolean>;
}

class MCPHttpServer {
  constructor(config: MCPHttpTransportConfig);
  registerTool(name, handler): void;
  getToolDefinitions(): MCPToolDefinition[];
  start(port?): Promise<void>;
  stop(): Promise<void>;
}

interface MCPHttpTransportConfig {
  url: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  tls?: { ca?: string; cert?: string; key?: string; rejectUnauthorized?: boolean };
}
```

## Chokidar File Watcher

Production-grade file system watching.

```typescript
class ChokidarWatcher extends EventEmitter {
  constructor(options: ChokidarWatcherOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
  onEvent(listener: WatchListener): void;
}
```

## OpenTelemetry

OpenTelemetry-compatible observability export.

```typescript
class OpenTelemetryManager {
  constructor(config: OtelExporterConfig);
  start(): Promise<void>;
  stop(): Promise<void>;
  recordSpan(span): void;
  recordMetric(metric): void;
  createTrace(name, kind?): { span: OtelSpan; end: (status?) => void };
  flush(): Promise<void>;
  convertLogEntry(entry): OtelSpan;
  convertMetricValue(metric): OtelMetric;
  convertSpan(span): OtelSpan;
}
```

## CI Performance Regression

Script-based benchmark comparison for CI pipelines.

```typescript
// Functions in benchmark-regression.ts:
loadBaseline(path): BenchmarkBaseline | null;
saveBaseline(path, results, commit): void;
parseVitestBenchOutput(output): BenchmarkResult[];
detectRegressions(baseline, current, thresholdPercent?): RegressionResult[];
generateBenchmarkReport(baseline, current, regressions): string;
saveTrendData(trendDir, results): void;
```

## Security

```typescript
class SecurityManager { /* ... */ }
class EnterpriseSecurityManager { /* ... */ }
```

## Persistence (SQLite)

```typescript
class PersistenceStore {
  constructor(config: PersistenceConfig);
  initialize(): Promise<void>;
  saveCheckpoint(entry): Promise<void>;
  appendAuditLog(entry): Promise<void>;
  storeMemory(entry): Promise<void>;
  recordTelemetry(data): Promise<void>;
  restore(): Promise<void>;
  vacuum(): Promise<void>;
}
```

## Other Modules

- `CheckpointManager` — Versioned snapshots of file state
- `LearningMemory` — Pattern recall with confidence scoring
- `PluginMarketplace` — Plugin lifecycle management
- `WorkspaceOrchestrator` — File watching, task execution
- `GitWorkflow` — Git branch/commit/PR operations
- `AgentOrchestrator` — Multi-agent task scheduling
- `ParallelExecutor` — Concurrent task execution
- `AdvancedTUI` — Interactive terminal UI
- `MCPClient` — Model Context Protocol client
- `AutoValidator` — Automated code validation
- `StreamManager` — Streaming response handling
- `SessionManager` — Session persistence
- `WorkflowEngine` — Plan-based task execution
- `ObservabilityManager` — Logs, metrics, traces
