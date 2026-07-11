# LibreCode

AI coding agent. Works like Claude Code, OpenCode, or Cursor — but open source, modular, and provider-agnostic.

[![CI](https://github.com/Rick000000007/LibreCode/actions/workflows/ci.yml/badge.svg)](https://github.com/Rick000000007/LibreCode/actions/workflows/ci.yml)

## Features

- **Multi-provider** — OpenAI, Anthropic, Ollama, OpenRouter, Gemini (pick or failover)
- **ReAct agent loop** — thinks, uses tools, observes results, adapts
- **Streaming output** — real-time token-by-token display with thinking spinner
- **File tools** — read, write, edit (with undo), search, directory listing
- **Shell + Git** — run commands, git operations with safety checks
- **Web fetch** — retrieve and analyze online content
- **Permission system** — approve/deny sensitive tools per-session
- **Context management** — auto-compacts when nearing token limits
- **Repo mapping** — indexes your codebase so the agent understands project structure
- **REPL** — interactive shell with `/slash` commands
- **Single-shot** — `rcode "fix this bug"` for one-off prompts

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
pnpm link           # makes `rcode` available globally
```

Then run:

```bash
rcode                # interactive REPL
rcode --help         # CLI flags
rcode "explain this" # single prompt
```

### From npm (not yet published)

```bash
npm install -g rcode
rcode
```

## Quick Start

Set an API key in your environment, then launch the REPL:

```bash
export OPENAI_API_KEY="sk-..."
rcode
```

Or use a config file:

```bash
# rcode.toml in your project root
cat > rcode.toml << 'EOF'
[agent]
provider = "openai"
model = "gpt-4o"

[providers.openai]
api_key = "${OPENAI_API_KEY}"
default_model = "gpt-4o"
EOF

rcode
```

## CLI Flags

| Flag | Description |
|---|---|
| `-m`, `--model <name>` | Model to use (e.g. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `-p`, `--provider <name>` | Provider (`openai`, `anthropic`, `ollama`, `openrouter`, `gemini`) |
| `-d`, `--directory <path>` | Working directory |
| `-c`, `--config <path>` | Path to config file |
| `-y`, `--yes` | Auto-approve all tool permissions |
| `-v`, `--version` | Print version and exit |

## REPL Commands

| Command | Description |
|---|---|
| `/help` | Show help |
| `/exit`, `/quit` | Exit |
| `/clear` | Clear conversation (keeps system prompt) |
| `/cost` | Show token usage |
| `/tokens` | Show context window usage |
| `/model <name>` | Switch model (e.g. `/model gpt-4o`) |
| `/permissions list` | List tool permissions |
| `/permissions allow <tool>` | Always allow a tool |
| `/permissions deny <tool>` | Deny a tool |
| `/permissions reset <tool>` | Reset permission for a tool |
| `/compact` | Force context compaction |

## Configuration

Config is loaded in order of priority:

1. CLI flags (`-m`, `-p`, `-d`, `-y`)
2. `rcode.toml`, `.rcode.toml`, or `.rcode/config.toml` in working directory
3. `~/.config/rcode/config.toml` (global)

API keys can be set in config files or via environment variables (`${VAR_NAME}` syntax):

```toml
[agent]
provider = "openai"
model = "gpt-4o"
max_turns = 30

[providers.openai]
api_key = "${OPENAI_API_KEY}"
default_model = "gpt-4o"

[providers.anthropic]
api_key = "${ANTHROPIC_API_KEY}"
default_model = "claude-sonnet-4-20250514"

[providers.ollama]
base_url = "http://localhost:11434"
default_model = "codellama"
```

## Architecture

```
librecode/
├── packages/
│   ├── types/       # Message, ToolCall, StreamEvent, AgentEvent, Config types
│   ├── utils/       # Token counting, path resolution, format helpers
│   ├── config/      # TOML config loader, CLI arg parsing, env var substitution
│   ├── memory/      # ContextManager — token tracking, compaction, summarization
│   ├── providers/   # OpenAI, Anthropic, Ollama, OpenRouter, Gemini + ModelRouter
│   ├── tools/       # 9 tools + SafetyChecker + PermissionChecker
│   ├── core/        # Agent runtime, system prompt generator, RepoMapper
│   ├── ui/          # Terminal renderer, spinner, ANSI formatting
│   └── cli/         # REPL, command parsing, entry point
├── .github/workflows/ci.yml
├── pnpm-workspace.yaml
├── tsconfig.json
└── package.json
```

## Provider Support

| Provider | Streaming | Tool Calling |
|---|---|---|
| OpenAI | ✓ | ✓ |
| Anthropic | ✓ | ✓ |
| Ollama | ✓ | ✓ |
| OpenRouter | ✓ | ✓ |
| Gemini | ✓ | ✓ |

The `ModelRouter` supports automatic failover: if one provider rate-limits or errors, it tries the next in chain.

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
pnpm link           # Link rcode globally
```

### Publishing

```bash
pnpm build
pnpm -r publish --access public
```

Scoped packages (`@rcode/*`) publish with public access. The CLI package is unscoped.

## Project Status

All 10 packages build and lint (zero errors, zero warnings). Ready for daily use with an LLM provider API key. Under active development.

### What works

- Full ReAct agent loop (streaming + non-streaming)
- 5 LLM providers with failover
- All 9 tools with safety checks
- Interactive REPL with slash commands
- Single-prompt mode
- Context compaction
- Codebase indexing (symbol-level repo map)
- Permission system (safe tools auto-allowed, sensitive tools prompt)
- GitHub Actions CI

### Roadmap

- [ ] E2E test suite
- [ ] Multi-turn conversation history export
- [ ] Token-aware context window optimization
- [ ] VSCode/Cursor extension
- [ ] MCP server integration
- [ ] Standalone binary (via `pkg` or `bun build`)
