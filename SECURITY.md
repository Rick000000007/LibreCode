# Security Policy

## Supported Versions

Only the current beta and stable branches are actively supported for security updates.

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4.0 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in LibreCode, please DO NOT report it via public GitHub issues. Instead, email security@librecode.ai with a description of the issue.

We will respond within 48 hours and work with you to release a patch.

## Threat Model & Design Guidelines

### API Keys
LibreCode never stores API keys in plaintext in logs or telemetry. They are kept only in the user's local `~/.config/librecode/config.json` with read/write access restricted to the user (0o600).

### Autonomous Commands
The AI Agent operates inside an interactive terminal environment. By default, it is configured to use strict permissions (via `PermissionChecker`), meaning all restricted tool operations—like mutating files or running shell/git commands—require explicit, interactive user approval via `y/N` prompts.

### Log Redaction
We use defensive programming to ensure API Keys and sensitive system information are not leaked to our HTTP debug logs or `~/.librecode/logs`.
