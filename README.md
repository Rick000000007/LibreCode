# LibreCode

<!-- trigger release -->

AI coding agent. Works like Claude Code, OpenCode, or Cursor — but open source, modular, and provider-agnostic.

[![CI](https://github.com/Rick000000007/LibreCode/actions/workflows/ci.yml/badge.svg)](https://github.com/Rick000000007/LibreCode/actions/workflows/ci.yml)

_CI workflow fixed – builds now pass._

## Features

- **Zero-configuration** — works out of the box with free models (Gemini, Groq, Ollama, OpenRouter, Together, NVIDIA)
- **Intelligent auto-router** — automatically selects the best model for your task (coding, reasoning, speed, cost)
- **Multi-provider** — 17+ providers including free tiers and local models
- **Automatic fallback** — transparent retry with provider switching on rate limits or errors
- **Health monitoring** — continuous provider health tracking with automatic degradation
- **Full-screen TUI** — rich terminal UI with syntax-highlighted markdown, sidebars, workflow tracker
- **ReAct agent loop** — thinks, uses tools, observes results, adapts
- **Streaming output** — real-time token-by-token display
- **File tools** — read, write, edit (with undo), search, directory listing
- **Shell + Git** — run commands, git operations with safety checks
- **Web fetch** — retrieve and analyze online content
- **Permission system** — approve/deny sensitive tools per-session
- **Context management** — auto-compacts when nearing token limits
- **Repo mapping** — indexes your codebase so the agent understands project structure
- **Provider-agnostic** — no provider-specific logic in the agent core
- **Extensible** — add a provider by writing one adapter

## Requirements

- Node.js 22+ LTS
- pnpm 9+ (for development)

## Install

### From source

```bash
git clone https://github.com/Rick000000007/LibreCode
cd LibreCode
pnpm install
pnpm build
pnpm link           # makes `librecode` available globally
```

Then run:

```bash
librecode                # interactive TUI (auto-configures with free models)
librecode --help         # CLI flags
librecode "explain this" # single prompt
```

### From npm

```bash
npm install -g librecode
librecode
```

## Quick Start

**Zero setup required.** Just run `librecode` — it automatically discovers available free models:

```bash
librecode
```

Free models are auto-detected from:
- **Ollama** — `ollama serve` (local, no API key)
- **Gemini** — `GEMINI_API_KEY` env var
- **Groq** — `GROQ_API_KEY` env var
- **OpenRouter** — `OPENROUTER_API_KEY` env var
- **Together AI** — `TOGETHER_API_KEY` env var
- **NVIDIA NIM** — `NVIDIA_API_KEY` env var

If nothing is available, clear setup instructions are shown.

### Premium providers

Set an API key in your environment:

```bash
export OPENAI_API_KEY="sk-..."
librecode
```

## Model Aliases

Use `/model <alias>` in the TUI to switch model selection strategy:

| Alias | Behavior |
|---|---|
| `best-free` | Most capable available free model (default) |
| `fast-free` | Fastest available free model |
| `reasoning` | Best reasoning/coding model |
| `coding` | Best for code generation |
| `fast` | Lowest-latency model |
| `creative` | Most creative model |
| `cheap` | Best value (free models get priority) |
| `vision` | Model with vision support |
| `local` | Best local model (Ollama) |
| `auto` | Balanced default |

## CLI Flags

| Flag | Description |
|---|---|
| `-m`, `--model <name>` | Model or alias to use (e.g. `best-free`, `gpt-4o`) |
| `-p`, `--provider <name>` | Provider override |
| `-d`, `--directory <path>` | Working directory |
| `-c`, `--config <path>` | Path to config file |
| `-y`, `--yes` | Auto-approve all tool permissions |
| `-v`, `--version` | Print version and exit |

## TUI Commands

| Command | Description |
|---|---|
| `/help` | Show this help |
| `/exit` / `/quit` | Exit LibreCode |
| `/clear` | Clear conversation history |
| `/status` | Show current session status |
| `/tokens` / `/t` | Show context window usage |
| `/cost` | Show token usage and cost info |
| `/doctor` | Run system diagnostics and health checks |
| `/provider` | Information on managing providers |
| `/model <name>` | Switch model strategy or free model |
| `/permissions` / `/perms` | Information on managing tool permissions |
| `/compact` | Manually compact conversation context |
| `/workspace` | Show active workspace directory |
| `/session` | Show session context usage |
| `/git` | Information on git operations |
| `/config` | Information on configuration |
| `/tools` | List registered tools |
| `/logs` | Show log file location |

## Configuration

Config is loaded in order of priority:

1. CLI flags (`-m`, `-p`, `-d`, `-y`)
2. Environment variables
3. `.rcode/config.json` in working directory
4. `~/.config/librecode/config.json` (global)

On first run, a default config is auto-created with `defaultProvider: 'free'`.

## Architecture

```
librecode/
├── packages/
│   ├── types/        # Message, ToolCall, StreamEvent, Config types
│   ├── utils/        # Token counting, path resolution, format helpers
│   ├── config/       # Config loader, CLI arg parsing, env var substitution
│   ├── memory/       # ContextManager — token tracking, compaction
│   ├── providers/    # Provider & routing system
│   │   ├── base.ts              # LLMProvider interface
│   │   ├── model-metadata.ts    # Rich model scoring (17 curated models)
│   │   ├── model-registry.ts    # Dynamic registry with discovery
│   │   ├── auto-router.ts       # Intent-based model selection
│   │   ├── health-monitor.ts    # Background health tracking
│   │   ├── streaming-engine.ts  # Unified streaming abstraction
│   │   ├── fallback-handler.ts  # Retry + provider switching
│   │   ├── conversation-store.ts # State preservation across switches
│   │   ├── provider-discovery.ts # Auto-detect local/env providers
│   │   ├── configuration.ts     # Layered config system
│   │   ├── free-models.ts       # Free tier aggregator
│   │   ├── openai-compatible.ts # Generic OpenAI-compatible adapter
│   │   ├── openai.ts / anthropic.ts / gemini.ts / ollama.ts / openrouter.ts
│   │   └── provider-manager.ts  # Top-level orchestration
│   ├── tools/        # 9 tools + SafetyChecker + PermissionChecker
│   ├── core/         # Agent runtime, system prompt generator, RepoMapper
│   ├── ui/           # Full-screen TUI, markdown renderer, sidebar
│   └── cli/          # Entry point, command parsing
├── .github/workflows/ci.yml
├── pnpm-workspace.yaml
├── tsconfig.json
└── package.json
```

## Provider Support

| Provider | Streaming | Tool Calling | Vision | Free Tier |
|---|---|---|---|---|
| OpenAI | ✓ | ✓ | ✓ | |
| Anthropic | ✓ | ✓ | ✓ | |
| Gemini | ✓ | ✓ | ✓ | ✓ |
| Groq | ✓ | ✓ | | ✓ |
| OpenRouter | ✓ | ✓ | ✓ | ✓ |
| Together AI | ✓ | ✓ | | ✓ |
| NVIDIA NIM | ✓ | ✓ | | ✓ |
| Ollama | ✓ | ✓ | | ✓ |
| LM Studio | ✓ | ✓ | | ✓ |

The **AutoRouter** automatically selects the best model for each task based on:
- Coding and reasoning capability scores
- Current provider health (latency, error rate)
- Model context window
- Tool calling and vision support
- Free vs premium
- User preference (via aliases)

## Tools

| Tool | Description | Safety Level |
|---|---|---|
| `read_file` | Read file contents with line ranges | Safe |
| `write_file` | Create or overwrite files | Permission required |
| `edit_file` | Search-and-replace edits (with undo) | Permission required |
| `undo_edit` | Revert last edit | Safe |
| `list_directory` | List files and directories | Safe |
| `search_code` | grep/ripgrep-based code search | Safe |
| `run_command` | Execute shell commands | Permission required |
| `git` | Git operations (diff, log, commit, push, etc.) | Permission required |
| `web_fetch` | Fetch URL content | Safe |

## Security

- **Permission system** — sensitive tools require user approval before executing
- **Path traversal protection** — tools are confined to the working directory
- **Dangerous command detection** — blocks `rm -rf /`, fork bombs, pipe-to-shell patterns
- **Sensitive path warnings** — warns before writing to `/etc/passwd`, `.ssh`, etc.
- **Write limits** — blocks writes >1MB by default
- **Shell injection prevention** — command arguments are sanitized

## Development

```bash
pnpm build          # Build all packages
pnpm build:watch    # Watch mode (all packages)
pnpm lint           # ESLint — zero errors, zero warnings enforced
pnpm test           # Run tests
pnpm clean          # Clean dist/ directories
pnpm link           # Link librecode globally
```

### Testing

```bash
pnpm test                    # All packages
pnpm --filter librecode-providers test  # Provider tests only (81 tests)
```

### Publishing

```bash
pnpm build
pnpm -r publish --access public
```

Scoped packages (`@librecode/*`) publish with public access. The CLI package is unscoped.

## Project Status

All 10 packages build and lint (zero errors, zero warnings). 81 provider tests pass. Ready for daily use.

### What works

- **Architectural Foundation** — Event Bus, Unified Error Hierarchy (`LibreError`), and lightweight `Result<T, E>` types.
- **Dynamic Command Framework** — Decoupled, self-registering framework for TUI commands (0 switch statements, validation, aliases, and lifecycle hooks).
- **HTTP Client** — Retries, connections reuse, streaming, dns/connect/read timeout controls.
- Zero-configuration first run with free model auto-discovery
- Intelligent auto-router with 9 model aliases
- Background health monitoring with automatic degradation
- Automatic fallback with retry and provider switching
- Unified streaming engine across all providers
- Full ReAct agent loop (streaming + non-streaming)
- 17+ LLM providers with intelligent routing
- All 9 tools with safety checks
- Full-screen TUI with syntax-highlighted markdown
- Conversation preservation across provider switches
- Single-prompt mode
- Context compaction
- Codebase indexing (symbol-level repo map)
- Permission system (safe tools auto-allowed, sensitive tools prompt)
- GitHub Actions CI
- 81 unit tests for the provider system

### Roadmap

- [ ] E2E test suite
- [ ] Multi-turn conversation history export
- [ ] Token-aware context window optimization
- [ ] VSCode/Cursor extension
- [ ] MCP server integration
- [ ] Standalone binary (via `pkg` or `bun build`)
