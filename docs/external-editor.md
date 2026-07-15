# External Editor Configuration

## Overview

LibreCode supports composing and editing content using your preferred external editor. The system respects `$EDITOR` and `$VISUAL` environment variables.

## Supported Editors

| Editor | Detection | Wait Support |
|--------|-----------|--------------|
| Vim | `vim` | Native |
| Neovim | `nvim` | Native |
| Nano | `nano` | Native |
| Helix | `hx` | Native |
| VS Code | `code --wait` | `--wait` flag |
| Zed | `zed --wait` | `--wait` flag |
| Sublime Text | `subl --wait` | `--wait` flag |
| Emacs | `emacs` | Native |
| Custom | `$EDITOR` / `$VISUAL` | Configurable |

## Commands

### `/edit`
Open external editor to compose or modify content.

```bash
/edit                    # Opens editor with blank document
/edit notes.md          # Edits specific file
```

### `/compose`
Open editor with a prompt header for composing new content.

```bash
/compose                # Write a message in your editor
```

### `/edit-selection`
Edit a specific text selection.

```bash
/edit-selection "selected text"
```

### `/edit-prompt`
Edit your prompt in an editor before sending to the AI.

```bash
/edit-prompt             # Opens editor, content sent as user message
```

## Configuration

The editor is auto-detected from:
1. Command line argument (first priority)
2. `$VISUAL` environment variable
3. `$EDITOR` environment variable
4. Auto-detection (searches for known editors)

## Temporary Files

Temporary files are stored in the system temp directory (`/tmp/librecode-editor/`). Files older than 24 hours are automatically cleaned up.

## Error Recovery

If the editor exits with a non-zero exit code, the content is not loaded. If the editor cannot be launched, an error message is displayed.
