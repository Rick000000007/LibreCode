# LibreCode Architecture Guide

## Overview

LibreCode is a TypeScript monorepo containing 9 packages that implement an AI-powered coding agent with full production readiness for v1.0.0.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     librecode (CLI)                      │
│              Entry point, command routing, UI            │
├─────────────────────────────────────────────────────────┤
│                     librecode-core                       │
│   ┌────────┐ ┌────────┐ ┌──────────┐ ┌───────────────┐ │
│   │ Agent  │ │Session │ │ Workflow │ │ AST Editor    │ │
│   │ Runtime│ │Manager │ │ Engine   │ │ (TS/RS/Go/Py) │ │
│   └────────┘ └────────┘ └──────────┘ └───────────────┘ │
│   ┌────────┐ ┌────────┐ ┌──────────┐ ┌───────────────┐ │
│   │Hybrid  │ │Checkpt │ │ Memory   │ │ MCP HTTP      │ │
│   │ RAG    │ │Manager │ │ Learning │ │ Transport     │ │
│   └────────┘ └────────┘ └──────────┘ └───────────────┘ │
│   ┌────────┐ ┌────────┐ ┌──────────┐ ┌───────────────┐ │
│   │Plugin  │ │ MCP    │ │OpenTeleme│ │Chokidar       │ │
│   │Market  │ │Client  │ │try Export│ │File Watcher   │ │
│   └────────┘ └────────┘ └──────────┘ └───────────────┘ │
│   ┌────────┐ ┌────────┐ ┌──────────┐ ┌───────────────┐ │
│   │Workspce│ │ Git    │ │ TUI      │ │Enterprise     │ │
│   │Orchest.│ │Workflow│ │(Advanced)│ │Security       │ │
│   └────────┘ └────────┘ └──────────┘ └───────────────┘ │
│   ┌────────┐ ┌────────┐ ┌──────────┐ ┌───────────────┐ │
│   │Persist │ │ Bench  │ │ Mutation │ │ CI Perf       │ │
│   │SQLite  │ │Regress │ │ Testing  │ │ Regression    │ │
│   └────────┘ └────────┘ └──────────┘ └───────────────┘ │
├─────────────────────────────────────────────────────────┤
│  librecode-providers    librecode-tools    librecode-ui  │
│  (LLM backends)         (File ops, git)    (Terminal UI)│
├─────────────────────────────────────────────────────────┤
│  librecode-types    librecode-config    librecode-memory │
│  librecode-utils                                        │
└─────────────────────────────────────────────────────────┘
```

## Package Overview

| Package | Purpose | Dependencies |
|---------|---------|-------------|
| `librecode` | CLI entry point, command framework | All packages |
| `librecode-core` | Agent runtime, all features | types, providers, tools, memory, config, utils |
| `librecode-types` | Core type definitions | None |
| `librecode-config` | Configuration management | types |
| `librecode-utils` | Shared utilities | types |
| `librecode-memory` | Context management | types, utils |
| `librecode-providers` | LLM provider abstraction | types, config, utils |
| `librecode-tools` | Tool implementations | types, utils |
| `librecode-ui` | Terminal UI | types |

## Key Design Decisions

1. **Interfaces over inheritance** — All major components use interfaces for testability
2. **Workspace dependencies** — Internal packages use `workspace:*` protocol
3. **Lazy loading** — Heavy dependencies (chokidar, ts-morph) are dynamically imported
4. **Event-driven** — Observability, TUI, and workspace use EventEmitter
5. **All errors surfaced** — No silent catch without logging context
6. **Path traversal protection** — All file operations validated against workspace root
7. **Configurable timeouts** — All external calls have configurable timeout with sensible defaults
8. **Parser-backed AST** — TypeScript uses ts-morph; Rust, Go, Python use regex-based providers
9. **SQLite persistence** — WAL mode, auto-backup, vacuum, 10 tables for state/telemetry/audit

## Module Splits (Post-Refactor)

| Original File | Refactored Into |
|---|---|
| `repo_map.ts` (677 lines) | `repo-map/types.ts`, `repo-map/project-utils.ts`, `repo-map/symbol-extractors.ts`, `repo-map/walk-utils.ts`, `repo-map/index.ts`, `repo_map.ts` (re-export) |
| `index.ts` (580 lines) | `index.ts` (55 lines exports), `agent.ts` (Agent class) |
