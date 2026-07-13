# Known Issues

LibreCode is currently in Beta. While the core features are stable, there are some known limitations and unfinished features that will be addressed in future releases.

## Unfinished Features

1. **Tool Permissions Management**
   - **Limitation:** The `/permissions` command and interactive permission management are not yet fully implemented.
   - **Workaround:** You can pass the `-y` or `--yes` flag to auto-approve tool permissions for a session, or manually approve them as they arise.
   - **Planned Fix:** A robust permissions management UI is planned for v0.5.0.

2. **Git Integration**
   - **Limitation:** The `/git` interactive tool and workflow command are still under development.
   - **Workaround:** Use standard terminal git commands or use LibreCode's `run_command` to execute git commands directly.
   - **Planned Fix:** Full Git integration with interactive diffs and staging will be included before 1.0.

3. **Tool Listing & Configuration**
   - **Limitation:** The `/tools` command to list and manage available tools is not active.
   - **Workaround:** Tools are automatically managed by the agent and enabled based on provider capabilities. You cannot manually toggle them on/off per session yet.
   - **Planned Fix:** A `/tools` TUI interface is planned for later Beta cycles.

4. **Multi-turn Conversation History Export**
   - **Limitation:** You cannot currently export your chat session to markdown or JSON.
   - **Planned Fix:** `/export` command will be added in upcoming releases.

## Provider Specific Limitations

1. **Local Models (Ollama / LM Studio)**
   - **Limitation:** Depending on your hardware, large local models may have higher latency and might time out if context gets too large.
   - **Workaround:** If you experience timeouts, use smaller models (e.g. `llama3.1-8b` instead of 70b) or configure the timeouts in your provider settings.

2. **Perplexity Tool Calling**
   - **Limitation:** Perplexity's Sonar models do not natively support strict tool calling syntax as defined by the OpenAI standard.
   - **Workaround:** Use Perplexity primarily for information retrieval, search, and Q&A rather than automated codebase editing.

## Terminal Environment

1. **Windows Command Prompt (cmd.exe)**
   - **Limitation:** Some advanced Unicode characters and emojis might render improperly in legacy Windows Command Prompt.
   - **Workaround:** We highly recommend using **Windows Terminal** with PowerShell or WSL2 for the best experience.
