# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0-beta.1] - 2026-07-13

### Added
- **Centralized Provider Registry:** Added native support for 18 providers: Ollama, LM Studio, OpenRouter, OpenAI, Anthropic, Gemini, NVIDIA, Groq, Together AI, Fireworks AI, Mistral AI, Cohere, GitHub Models, Hugging Face, DeepSeek, xAI, Perplexity, Cerebras, Cloudflare Workers AI.
- **Setup Wizard:** Interactive setup wizard for first-run initialization and automatic local model detection.
- **Terminal UI (TUI):** Robust TUI with auto-complete palette, real-time Markdown rendering, and multiline editing.
- **Diagnostics:** Added `/doctor` command to help diagnose provider configuration and connection issues.
- **Agent Workflow Engine:** Evolved LibreCode from a terminal chat client into an autonomous AI Coding Agent capable of planning, executing, and monitoring tasks.
- **Project Memory:** The agent natively persists architectural notes and style guidelines to `.librecode/architecture.md`.
- **Repository Commands:** Added workspace navigation commands (`/analyze`, `/architecture`, `/dependencies`, `/tests`, `/todos`, `/modules`, `/search`, `/explain`).
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
