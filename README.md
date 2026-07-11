# LibreCode

AI coding agent. TypeScript monorepo — modular, provider-agnostic, extensible.

## Architecture

```
librecode/
├── packages/
│   ├── types/       # Core type definitions (Message, ToolCall, AgentEvent, etc.)
│   ├── utils/       # Token counting, truncation, format helpers
│   ├── config/      # TOML config loading, CLI arg parsing, env var fallback
│   ├── memory/      # Context management with compaction/summarization
│   ├── providers/   # LLM providers: OpenAI, Anthropic, Ollama, OpenRouter, Gemini
│   ├── tools/       # Tools: read/write/edit/undo file, search, shell, git, web fetch
│   ├── core/        # Agent runtime (ReAct loop, system prompt, repo mapping)
│   ├── ui/          # Terminal renderer + spinner (ANSI colors, streaming)
│   └── cli/         # REPL with slash commands, single-turn mode
├── .github/workflows/  # CI pipeline
├── tsconfig.json       # Root TypeScript config (composite)
├── pnpm-workspace.yaml
└── package.json
```

## Quick Start

```bash
pnpm install
pnpm build
```

Run in interactive REPL mode:

```bash
node packages/cli/dist/index.js
```

Run a single prompt:

```bash
node packages/cli/dist/index.js "explain this project"
```

## Requirements

- Node.js 22+ LTS
- pnpm 9+

## Configuration

Config is loaded from (in order of priority):

1. CLI flags (`-m`, `-p`, `-d`, `-y`)
2. `rcode.toml`, `.rcode.toml`, or `.rcode/config.toml` in the working directory
3. `~/.config/rcode/config.toml` (global)

Example `rcode.toml`:

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
```

## CLI Commands

| Command | Description |
|---|---|
| `/help` | Show help |
| `/exit`, `/quit` | Exit |
| `/clear` | Clear conversation |
| `/cost` | Show token usage |
| `/tokens` | Show context usage |
| `/model <name>` | Switch model |
| `/provider <name>` | Switch provider |
| `/permissions list` | List tool permissions |
| `/permissions allow <tool>` | Allow a tool |
| `/permissions deny <tool>` | Deny a tool |
| `/permissions reset <tool>` | Reset tool permission |
| `/compact` | Compact context |

## Development

```bash
pnpm build          # Build all packages
pnpm build:watch    # Watch mode
pnpm lint           # ESLint all packages
pnpm test           # Run tests
pnpm clean          # Clean all dist/ directories
```

## Project Status

Early development. All 10 packages build and lint cleanly.
