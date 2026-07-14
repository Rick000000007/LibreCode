# LibreCode Configuration Guide

## CLI Arguments

```
librecode [command] [options]

Commands:
  start       Start interactive session
  run         Execute a single task
  init        Initialize configuration
  version     Show version
  help        Show help

Options:
  --provider      LLM provider (openai, anthropic, gemini, ollama)
  --model         Model name
  --config        Config file path
  -d, --dir       Working directory
  -v, --verbose   Verbose output
```

## Configuration File

LibreCode reads configuration from these locations (in order):
1. `./.librecode.json`
2. `~/.config/librecode/config.json`
3. Environment variables with `LIBRECODE_` prefix

```json
{
  "provider": "openai",
  "model": "gpt-4",
  "maxTokens": 4096,
  "temperature": 0.0,
  "maxTurns": 20,
  "maxContextTokens": 32000,
  "compactThreshold": 0.7,
  "requestTimeout": 120000,

  "security": {
    "allowedCommands": ["ls", "cat", "git", "npm", "pnpm"],
    "blockedCommands": ["sudo", "rm -rf /"],
    "allowedPaths": ["/home/user/project"],
    "blockedPaths": ["/etc", "/usr"],
    "maxFileSize": 10485760,
    "confirmDangerous": true,
    "auditLog": true
  },

  "git": {
    "autoCommit": false,
    "commitPrefix": "",
    "defaultBranch": "main"
  },

  "workspace": {
    "ignorePatterns": ["node_modules", "dist", "build", ".git"]
  },

  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["server.js"],
      "env": { "KEY": "value" }
    }
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `GEMINI_API_KEY` | Google Gemini API key | — |
| `LIBRECODE_CONFIG` | Config file path | `~/.config/librecode/config.json` |
| `LIBRECODE_LOG_LEVEL` | Log level (debug/info/warn/error) | `info` |
| `LIBRECODE_MAX_TOKENS` | Max tokens per request | `4096` |
| `LIBRECODE_TIMEOUT` | Request timeout in ms | `120000` |

## MCP Server Config

MCP servers are configured in `~/.config/librecode/mcp-servers.json`:

```json
{
  "server-name": {
    "command": "node",
    "args": ["/path/to/server.js"],
    "env": {},
    "transport": "stdio"
  }
}
```
