# Post-Beta Roadmap (v1.0.0)

With the release of v0.4.0-beta.1, LibreCode enters its Beta phase. Our focus shifts entirely to stabilizing the core architecture and polishing the developer experience.

## Priorities for v1.0.0

During the Beta period, we will focus exclusively on the following areas. We will not be introducing major new features until the core Agent architecture has been battle-tested.

### 1. Bug Fixes
- Triage and prioritize bugs reported by Beta users.
- Ensure the autonomous agent handles edge cases gracefully, especially regarding API downtime or permission rejections.
- Address any issues with the terminal UI rendering layout.

### 2. UX Improvements
- Improve error messages and make them actionable.
- Refine the wording of the initial Setup Wizard for absolute beginners.
- Collect feedback on the Agent's interactive permission prompt workflow and tweak timing/presentation.
- Continuously refine the interactive command-palette.

### 3. Performance Improvements
- Optimize memory usage during long-running sessions.
- Reduce startup latency, especially in the workspace analyzer.
- Optimize the context truncation and summarization logic (`ContextManager`) to minimize token overhead.
- Ensure streaming from large inference models remains smooth and non-blocking in the UI thread.

### 4. Provider Compatibility
- Continue testing against our extensive list of supported providers (Ollama, LM Studio, OpenRouter, OpenAI, Anthropic, Gemini, NVIDIA, Groq, Together AI, Fireworks AI, Mistral AI, Cohere, GitHub Models, Hugging Face, DeepSeek, xAI, Perplexity, Cerebras, Cloudflare Workers AI).
- Fix any vendor-specific implementation quirks in API interfaces, especially regarding streaming or tool calling schemas.

### 5. Documentation
- Polish public APIs.
- Enhance existing guides and write comprehensive tutorials for the Agent workflows.
- Expand contributing and security documentation.

We are committed to delivering a robust, production-grade AI Software Engineering Assistant.
