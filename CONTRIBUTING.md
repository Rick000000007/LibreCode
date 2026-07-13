# Contributing to LibreCode

First off, thank you for considering contributing to LibreCode! It's people like you that make LibreCode such a great tool for the community.

## 1. Code of Conduct
This project and everyone participating in it is governed by a Code of Conduct. By participating, you are expected to uphold this code.

## 2. Setting Up the Development Environment
1. Clone the repository
2. Install dependencies using pnpm: `pnpm install`
3. Build the workspace: `pnpm build`
4. Run tests: `pnpm test`

## 3. Architecture Overview
LibreCode is a monorepo containing:
- `librecode-cli`: The TUI and command-line interface.
- `librecode-core`: The Agent workflow engine and prompt templates.
- `librecode-providers`: Implementations for various AI models.
- `librecode-tools`: Autonomous tools available to the Agent.
- `librecode-ui`: Blessed-based TUI components and terminal rendering.
- `librecode-memory`: Context compression and prompt limits.
- `librecode-config`: Configuration defaults and settings.
- `librecode-utils`: Logging, metrics, and token counting.
- `librecode-types`: Shared TypeScript interfaces.

## 4. Submitting a Pull Request
- Create a new branch from `main`.
- Write tests for your changes.
- Ensure `pnpm build` and `pnpm test` pass.
- Submit your PR with a clear description.
