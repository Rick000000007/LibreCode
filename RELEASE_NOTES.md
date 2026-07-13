# Release Notes: v0.4.0-beta.1

## Overview

The `v0.4.0-beta.1` release marks a major stabilization point for LibreCode, locking the core architecture and shifting focus entirely to end-user experience, stability, and bug fixing. We've introduced a centralized `ProviderRegistry`, rebuilt the entire TUI input handling system from scratch to handle a wider array of keyboards and control sequences, and expanded out-of-the-box support for a massive list of local and cloud providers.

## New Features

* **Provider Registry:** Now centralized with rich capabilities detection for 18+ cloud and local AI providers.
* **Seamless Onboarding:** The new Setup Wizard `/setup` and automatic `ProviderDiscovery` makes switching between LLM APIs drastically faster.
* **Revamped Terminal Input (TUI):** Overhauled `inputBuffer` logic. Backspace works perfectly for multi-byte Unicode characters (Emojis), bracketed paste mode is fully supported, and modifiers (`Ctrl`, `Meta`, `Shift`) are precisely tracked.
* **Expanded Command Suite:** The CLI commands have been heavily refined. `/doctor` gives extensive diagnostics, `/config` shows paths, and `/models` acts as an alias to seamlessly browse all locally or remotely available models.

## Bug Fixes

* **Terminal Freezing:** The lone `ESC` key no longer causes the terminal to freeze due to an infinite CSI parse loop.
* **Off-screen Layouts:** Suggestion boxes and UI palettes dynamically adjust and render correctly above the input buffer, rather than clipping out of terminal bounds.
* **Provider Connectivity:** Corrected mis-configured metadata across Cerebras, Ollama, xAI, NVIDIA, and more, preventing `fetch failed` and `DNS` errors.
* **Missing Models Fallback:** Fallback logic now successfully routes without defaulting incorrectly to OpenAI endpoints when endpoints are explicitly undefined.

## Known Issues

Before upgrading, please review our [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). Some commands (like `/permissions` and `/git`) are stubbed out and intentionally disabled for this beta. Windows Command Prompt has limitations with emojis. 

## Next Steps

This release is a **Release Candidate** for community testing. 
Once all Beta feedback has been addressed and issues resolved, we will tag `v1.0.0`.
