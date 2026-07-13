# LibreCode Testing Guide

This document explains how to run the LibreCode test suite, configure providers for integration testing, and what tests are safe to run locally.

## Running Tests Locally

LibreCode uses `vitest` for its test framework across the monorepo.

To run the complete test suite (unit tests and offline smoke tests):

```bash
# In the root directory:
pnpm install
pnpm build
pnpm test
```

### Smoke Tests vs. Integration Tests

- **Unit Tests**: Found in `src/__tests__` across all packages. Always run offline and do not require credentials.
- **Smoke Test (Offline)**: Found at `packages/cli/src/__tests__/smoke.test.ts`. This is a strict End-to-End test that validates the CLI's internal startup, configuration scaffolding, and command routing logic. It always runs and requires no credentials.
- **Provider Integration Tests**: Found at `packages/cli/src/__tests__/integration.test.ts`. This verifies actual network connections, model discovery, and chat streaming against live LLM providers. **This test is dynamically skipped by Vitest if no credentials or local servers are detected.**

## Configuring Local Providers (Ollama)

To run integration tests entirely offline, you can use Ollama. If Ollama is running, the integration tests will automatically detect it and run against it.

1. Install [Ollama](https://ollama.com/).
2. Pull a small, fast model to test against (e.g., `phi3` or `qwen2:0.5b`):
   ```bash
   ollama run phi3
   ```
3. Ensure the Ollama background service is running on `http://127.0.0.1:11434`.
4. Run `pnpm test`. The integration suite will automatically detect `ollama` and run.

## Supplying Cloud API Keys

If you do not have Ollama installed, you can run integration tests against cloud providers by supplying environment variables.

Supported variables include:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`

Example:
```bash
export GROQ_API_KEY="gsk_..."
pnpm test
```

## CI/CD Workflow

In GitHub Actions, the testing pipeline is divided into two jobs:

1. **Job 1 (Build & Smoke Tests)**: Runs on every PR and push. Executes all unit tests and offline smoke tests.
2. **Job 2 (Provider Integration Tests)**: Runs dynamically based on repository secrets. Executes `integration.test.ts` to ensure remote APIs are still parsing requests correctly.
