# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-07-13

### Added
- **Parser-backed AST Providers:** TsMorphProvider for TypeScript/JavaScript (ts-morph), RustAstProvider, GoAstProvider
- **Hybrid RAG:** Combined TF-IDF keyword search + embedding-based vector search via OpenAIEmbeddingProvider and OllamaEmbeddingProvider
- **MCP HTTP Transport:** JSON-RPC client/server over HTTP with TLS, API key auth, retries, and timeouts
- **Chokidar File Watcher:** Production-grade filesystem watching with debounce, depth limits, and ignore patterns
- **OpenTelemetry Export:** Console, HTTP, and file exporters for spans and metrics. Compatible with OTel collectors
- **SQLite Persistence:** 10-table schema (WAL mode, auto-backup, restore, vacuum) for checkpoints, audit logs, memory, telemetry, sessions, and workflow state
- **CI Performance Regression Detection:** Baseline comparison script (`benchmark-ci.ts`), threshold-based CI failure (20% default), trend data accumulation
- **StrykerJS Mutation Testing:** Configuration targeting security, permissions, AST, RAG, orchestrator, and validation. Target ≥80% mutation score
- **E2E Expansion:** 14 new E2E tests covering Hybrid RAG, MCP HTTP, Rust AST, Go AST, Chokidar, OpenTelemetry, session recovery, and multi-agent workflows (32 total)

### Refactored
- **repo_map.ts split** (677 → 5 files): `repo-map/types.ts`, `repo-map/project-utils.ts`, `repo-map/symbol-extractors.ts`, `repo-map/walk-utils.ts`, `repo-map/index.ts`
- **index.ts split** (580 lines → 55 lines exports + 525 lines `agent.ts`)
- All source files now under 350 lines where possible

### Infrastructure
- 152 tests total (120 unit + 32 E2E), all passing
- 8 benchmark scenarios with measurable performance
- CI workflow with benchmark regression detection, mutation testing, and E2E jobs
- All builds pass with `tsc --noEmit` strict mode
- `pnpm bench:ci` and `pnpm mutation` scripts added

### Security
- Chokidar watcher supports ignored paths to avoid watching sensitive directories
- MCP HTTP server supports optional Bearer token authentication
- Extended SECURITY.md with OTel and MCP transport security guidance

### Fixed
- All lint errors (no-empty blocks with allowEmptyCatch)

## [0.4.0-beta.1] - 2026-07-13

### Added
- **Centralized Provider Registry:** Added native support for 18 providers: Ollama, LM Studio, OpenRouter, OpenAI, Anthropic, Gemini, NVIDIA, Groq, Together AI, Fireworks AI, Mistral AI, Cohere, GitHub Models, Hugging Face, DeepSeek, xAI, Perplexity, Cerebras, Cloudflare Workers AI.
- **Setup Wizard:** Interactive setup wizard for first-run initialization and automatic local model detection.
- **Terminal UI (TUI):** Robust TUI with auto-complete palette, real-time Markdown rendering, and multiline editing.
- **Diagnostics:** Added `/doctor` command to help diagnose provider configuration and connection issues.
- **Agent Workflow Engine:** Evolved LibreCode from a terminal chat client into an autonomous AI Coding Agent capable of planning, executing, and monitoring tasks.
- **Project Memory:** The agent natively persists architectural notes and style guidelines to `.librecode/architecture.md`.

- **Approval System:** Added a permission manager (`PermissionChecker`) that enforces explicit `y/N` approval prompts for system interactions and Git commands.
- **Command Routing:** Added full command system for `/provider`, `/model`, `/models`, `/status`, `/tokens`, `/history`, and `/compact`.

### Fixed
- Fixed bug causing `fetch failed` and `404` errors when communicating with local providers.
- Fixed fallback base URL logic incorrectly defaulting to OpenAI endpoints for missing configs.
- Fixed severe Terminal Input bugs involving backspace on emojis, off-screen suggestion rendering, and shift/ctrl modifiers interfering with normal keys.
- Fixed hanging terminal state upon pressing `ESC`.
- Re-architected CSI sequence buffer parsing to handle rapid terminal inputs seamlessly.

### Changed
- Refactored `ProviderRouter` to safely forward model selections to underlying providers.
- Re-styled internal CLI commands to avoid showing "Not yet implemented" placeholders.
- Unified configuration persistence into `ConfigurationManager`.

### Removed
- Removed placeholder code for various redundant CLI artifacts.
