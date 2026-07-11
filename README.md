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

## Install

### From source (local development)

```bash
git clone https://github.com/Rick000000007/LibreCode
cd LibreCode
pnpm install
pnpm build
pnpm link     # makes `rcode` available globally
```

Then run:

```bash
rcode                    # interactive REPL
rcode "explain this"     # single prompt
```

### From npm (once published)

```bash
npm install -g rcode
# or
pnpm add -g rcode
```

Then:

```bash
rcode
```

## Requirements

- Node.js 22+ LTS
- pnpm 9+ (for development only)

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
pnpm link           # Link `rcode` globally for local testing
```

### Publishing to npm

```bash
# Build first
pnpm build

# Publish all packages in dependency order
pnpm -r publish --access public

# Or publish a single package
pnpm --filter @rcode/types publish --access public
pnpm --filter rcode publish
```

> Scoped packages (`@rcode/*`) are published with public access. The CLI package `rcode` is unscoped.

## Project Status

Early development. All 10 packages build and lint cleanly.
