# LibreCode Performance Guide

## Benchmarks (librecode-core v1.0.0)

Results measured on Node.js 24.x, 8-core CPU, 16GB RAM.

| Operation | Ops/sec | Mean (ms) | p99 (ms) |
|-----------|---------|-----------|----------|
| AST: TS symbol extraction (1k+ lines) | 989 | 1.01 | 3.44 |
| AST: TS rename symbol | 9,465 | 0.11 | 0.15 |
| AST: Python symbol extraction (1k+ lines) | 2,471 | 0.40 | 2.01 |
| RAG: TF-IDF fit (100 docs) | 2,768 | 0.36 | 1.50 |
| RAG: VectorIndex search (10k chunks) | 14 | 69.46 | 91.29 |
| Checkpoint: createDiff (1k lines) | 37 | 27.15 | 182.89 |
| Memory: recall from 10k entries | 7 | 149.97 | 169.05 |
| Validation: validate 1k files | <0.01 | >5000 | >5000 |

## Optimization Tips

### Startup Time
- Keep imports flat — avoid deep import chains
- `librecode-core` loads in ~200ms cold start
- All heavy imports (chokidar, ts-morph, better-sqlite3) use dynamic `await import()` pattern

### RAG Search Performance
- TF-IDF vectors are cached per chunk
- For workspaces > 100 files, use `VectorIndex.search()` with `topK` limit
- The `CodeIndexer` batches file indexing in groups of 50
- For better accuracy, enable embedding providers (OpenAI/Ollama) — adds latency per search but improves hybrid results

### AST Editing
- ts-morph-based TypeScript provider (TsMorphProvider) is accurate but slower on cold start
- Regex-based providers (Python, Rust, Go) are fast but imprecise for complex code
- Rename operations on ts-morph are ~10x faster than full symbol extraction
- Rust and Go symbol extraction uses single-pass line scanning

### Memory Usage
- `LearningMemory` is capped at 5,000 entries
- `ObservabilityManager` caps logs at 10k, metrics at 50k, traces at 1k
- All in-memory collections use `.slice()` to prevent unbounded growth
- Token cache in memory module auto-clears at 2x max entries
- SQLite persistence uses WAL mode for concurrent read performance
- OpenTelemetry flushes in batches of 100 spans/metrics

### Concurrency
- `AgentOrchestrator` max parallelism: 4 tasks
- `ParallelExecutor` for CPU-bound work
- MCP client has 30s default request timeout
- Chokidar watcher has 300ms batch delay for debouncing rapid file changes
- SQLite uses shared cache and WAL for concurrent access

### CI Performance Regression
- Threshold: 20% degradation triggers CI failure
- Baselines stored per commit in `.benchmark-baseline.json`
- Trend data accumulated in `.benchmark-trends/`
- Run locally: `pnpm bench:ci` from `packages/core`

## Bottleneck Detection

Enable telemetry to detect bottlenecks:
```typescript
import { Telemetry, OpenTelemetryManager } from 'librecode-core';
const telemetry = new Telemetry();
const report = telemetry.getPerformanceReport();
// Or export to OpenTelemetry collector:
const otel = new OpenTelemetryManager({ type: 'http', endpoint: 'http://collector:4318' });
await otel.start();
```
