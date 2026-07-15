# LSP (Language Server Protocol) Setup

## Overview

LibreCode integrates with multiple LSP servers to provide IDE-grade language intelligence. The LSP system auto-detects available servers and manages them via JSON-RPC 2.0 over stdio.

## Supported Languages

| Language | Server Command | Extensions |
|----------|---------------|------------|
| TypeScript/JavaScript | `typescript-language-server` | .ts, .tsx, .js, .jsx, .mjs, .cjs |
| Python | `pyright-langserver` | .py, .pyi |
| Rust | `rust-analyzer` | .rs |
| Go | `gopls` | .go |
| C/C++ | `clangd` | .c, .cpp, .h, .hpp, .cxx, .hxx |
| Java | `java -jar eclipse.jdt.ls` | .java |
| Kotlin | `kotlin-language-server` | .kt, .kts |

## Installation

### TypeScript
```bash
npm install -g typescript-language-server typescript
```

### Python
```bash
npm install -g pyright
# or
pip install pyright
```

### Rust
```bash
rustup component add rust-analyzer
```

### Go
```bash
go install golang.org/x/tools/gopls@latest
```

### C/C++
```bash
# Ubuntu/Debian
sudo apt install clangd
# macOS
brew install llvm
```

### Java
Download Eclipse JDTLS and set up the path.

## Usage

### CLI Commands

```bash
# Check available LSP servers
/lsp status

# Start a specific language server
/lsp start typescript

# Stop a server
/lsp stop typescript
```

### Programmatic Usage

```typescript
import { LSPManager } from 'librecode-core';

const manager = new LSPManager({
  workspaceRoot: '/path/to/project',
  servers: ['typescript', 'python'],
});

await manager.startAll();

// Get diagnostics
const diagnostics = manager.getDiagnostics();

// Get completions
const client = manager.getClientForFile('file.ts');
if (client) {
  const completions = await client.getCompletion('file.ts', 10, 5);
  const hover = await client.getHover('file.ts', 10, 5);
  const defs = await client.gotoDefinition('file.ts', 10, 5);
}
```

## Features

- Diagnostics (errors/warnings)
- Hover information
- Code completion
- Go to Definition
- Find References
- Document Symbols
- Workspace Symbols
- Rename
- Code Actions
- Signature Help
- Document Formatting
- Semantic Tokens

## Architecture

Each LSP server runs as a child process communicating via JSON-RPC over stdio. The `LSPManager` coordinates multiple servers, auto-detects language from file extensions, and emits diagnostics events that the TUI can display.
