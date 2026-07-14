# Release Notes

## [1.0.0] - 2026-07-13

### Added
- **Parser-Backed AST Providers:** RustAstProvider and GoAstProvider join the existing TypeScript (ts-morph) and Python providers. Full symbol extraction, rename, delete, import, method insert, move, format, and find-references for all five supported languages.
- **Hybrid RAG Search:** TF-IDF keyword search fused with embedding-based vector search via OpenAI (`text-embedding-3-small`) and Ollama (`nomic-embed-text`). Configurable keyword/embedding weight ratio.
- **MCP HTTP Transport:** JSON-RPC 2.0 client/server over HTTP with Bearer auth, TLS, configurable retries/timeouts, and Node.js `http.createServer`-based server. Full `tools/list`, `tools/call`, and `ping` support.
- **Chokidar File Watcher:** Production-grade cross-platform filesystem watching with debounce (300ms), depth limits, ignore patterns, and event emitter API.
- **OpenTelemetry Export:** Console, HTTP (OTLP-compatible), and file exporters for spans and metrics. `createTrace()` for manual instrumentation and converters for existing `LogEntry`/`MetricValue`/`Span` types.
- **SQLite Persistence:** 10-table schema (checkpoints, audit_logs, memory_entries, telemetry_logs/metrics/spans, sessions, workflow_state) with WAL mode, auto-backup, restore, and vacuum.
- **CI Performance Regression Detection:** Automated benchmark baseline tracking. 20% threshold triggers CI failure. Trend data accumulated across commits.
- **StrykerJS Mutation Testing:** Configuration targeting 14 source files across security, permissions, AST editing, RAG, and orchestrator modules. Thresholds: 80% high, 60% break.
- **E2E Coverage Expansion:** 14 new tests (32 total) covering all new subsystems.

### Changes
- `repo_map.ts` refactored into 5 modular files under `repo-map/` directory
- `index.ts` split into `index.ts` (exports only) and `agent.ts` (Agent class)
- All source files under 350 lines except `agent.ts` (525 lines)
- CI workflow expanded with benchmark, mutation, and E2E jobs

### Infrastructure
- 152 tests (120 unit, 32 E2E) — all passing
- 8 benchmark scenarios with measured throughput (Hz), mean latency, and p99
- `pnpm bench:ci`, `pnpm mutation`, `pnpm test:e2e` scripts
- `.benchmark-baseline.json` and `.benchmark-trends/` for historical comparison
- `stryker.config.json` for mutation testing

### Security
- MCP HTTP server: optional Bearer token authentication
- Chokidar: ignored paths prevent watching sensitive directories
- Documentation updated with MCP/TLS/OTel security guidance

## [0.4.0-beta.1] - 2026-07-13

### Added
- **AST-Based Code Editing:** Symbol-aware code editing for TypeScript, JavaScript, and Python. Rename, extract symbols, add imports, insert methods, delete declarations, and safe formatting via `AstProviderRegistry`.
- **Semantic Search (RAG):** TF-IDF vector search indexes source code by function, class, and block. Fast keyword-based code search across entire workspaces.
- **Multi-Agent Orchestrator:** Task queue with dependency management, priority scheduling, and concurrent execution. Submit, cancel, and monitor agent tasks.
- **Checkpoints & Milestones:** Versioned snapshots of file state with LCS-based diff generation. Link checkpoints to milestones with target versions and deadlines.
- **Learning Memory:** Pattern recall with Jaccard similarity, confidence scoring, access decay, and automatic consolidation. Remembers facts, preferences, errors, and project knowledge.
- **Plugin Marketplace:** Plugin lifecycle management with manifest validation, permission sandboxing, SHA-256 integrity, and marketplace listing support.
- **Workspace Orchestrator:** File system watching (cross-platform), recursive file indexing, task execution with dependency resolution, and path traversal protection.
- **Observability:** Structured logging (debug/info/warn/error), metrics recording, distributed tracing with spans, and query-based log search.
- **Enterprise Security:** RBAC with role inheritance, resource pattern matching, permission conditions, full audit trail, and configurable compliance rules (SOC2/HIPAA/GDPR/PCI/SOX).
- **Advanced TUI:** Command system with aliases, theme support (dark/light/high-contrast), status bar, notifications, and non-TTY fallback.
- **Centralized Provider Registry:** Native support for 18 providers (OpenAI, Anthropic, Gemini, Ollama, etc.)
- **Setup Wizard:** Interactive first-run setup with automatic local model detection.
- **Terminal UI:** Auto-complete palette, Markdown rendering, multiline editing.
- **Diagnostics:** `/doctor` command for provider configuration diagnosis.
- **Agent Workflow Engine:** Autonomous planning, execution, and monitoring.
- **Project Memory:** Persistent architectural notes in `.librecode/architecture.md`.
- **Approval System:** Permission manager with `y/N` approval prompts.
- **Command Routing:** Full command system (`/provider`, `/model`, `/status`, etc.)

### Performance Benchmarks (core operations)
| Operation | Throughput |
|-----------|-----------|
| TS symbol extraction (1k+ lines) | 850 ops/s |
| Python symbol extraction (1k+ lines) | 720 ops/s |
| TF-IDF fit (100 docs) | 15,000 ops/s |
| Vector search (10k chunks) | 500 ops/s |
| Diff generation (1k lines) | 3,000 ops/s |
| Memory recall (10k entries) | 200 ops/s |

### Security Hardening
- All shell commands use `execFileSync` with argument arrays — no command injection
- Path traversal protection on all file operations
- User input never concatenated into command strings
- Pattern escaping in RBAC resource matchers prevents ReDoS
- Plugin sandbox with permission allowlist and integrity verification
- Audit logging for all security decisions

### Infrastructure
- 120 unit tests, 18 E2E integration tests
- GitHub Actions CI with build, typecheck, lint, test
- Changesets-based release management
- Full TypeScript strict mode with `noUncheckedIndexedAccess`

### Fixed
- Bug causing `fetch failed` and `404` errors with local providers
- Fallback base URL logic for missing configs
- Terminal input bugs with backspace on emojis, off-screen suggestions
- Hanging terminal state on `ESC`
- CSI sequence buffer parsing for rapid inputs

### Changed
- `Agent.ProviderName` and `Agent.ProviderModel` are now `readonly`
- `GitWorkflow` uses `execFileSync` (no shell injection risk)
- `CheckpointManager.saveCheckpoint()` is synchronous
- `PluginMarketplace.install()` is synchronous
- `EnterpriseSecurityManager` no longer requires `SecurityManager` in constructor

## Versioning Policy
This project follows [Semantic Versioning 2.0.0](https://semver.org/). Given the 0.x.0 major version, breaking changes may occur in minor releases until v1.0.0.
