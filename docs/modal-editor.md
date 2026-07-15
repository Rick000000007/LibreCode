# Modal Editor Guide

## Overview

LibreCode includes a built-in modal text editor inspired by Vim. It supports multiple modes and advanced editing features.

## Modes

| Mode | Description | Activation |
|------|-------------|------------|
| Normal | Navigation and command mode | `Esc` or `Ctrl+C` |
| Insert | Text insertion | `i`, `I`, `a`, `A`, `o`, `O` |
| Visual | Selection mode | `v` |
| Command | Command-line mode | `:`, `/`, `?` |

## Normal Mode Commands

### Navigation
| Key | Action |
|-----|--------|
| `h` / `Left` | Move cursor left |
| `j` / `Down` | Move cursor down |
| `k` / `Up` | Move cursor up |
| `l` / `Right` | Move cursor right |
| `w` | Word forward |
| `b` | Word backward |
| `0` | Beginning of line |
| `$` | End of line |
| `^` | First non-whitespace |
| `gg` | Beginning of file |
| `G` | End of file |
| `H` | Top of screen |
| `M` | Middle of screen |
| `L` | Bottom of screen |
| `n` | Next search result |
| `N` | Previous search result |

### Editing
| Key | Action |
|-----|--------|
| `i` | Insert before cursor |
| `I` | Insert at line start |
| `a` | Append after cursor |
| `A` | Append at line end |
| `o` | Open line below |
| `O` | Open line above |
| `x` | Delete character |
| `dd` | Delete line |
| `D` | Delete to end of line |
| `yy` | Yank (copy) line |
| `p` | Paste after cursor |
| `P` | Paste before cursor |
| `u` | Undo |
| `r` | Redo |
| `.` | Redo |

## Command Mode

### Search
```vim
/foo      # Search forward for "foo"
?foo      # Search backward
n         # Next match
N         # Previous match
```

### Ex Commands
```vim
:w              # Save
:q              # Quit
:wq             # Save and quit
:set number     # Show line numbers
:set nonumber   # Hide line numbers
:set tabstop=4  # Set tab width
:%s/old/new/g   # Search and replace
:42             # Go to line 42
```

## Visual Mode
| Key | Action |
|-----|--------|
| `h/j/k/l` | Extend selection |
| `y` | Yank selected text |
| `d` | Delete selected text |
| `Esc` | Exit visual mode |

## Features

- Syntax highlighting (extensible)
- Line numbers (toggle with `set number`)
- Bracket matching (auto-highlights matching `()`, `[]`, `{}`)
- Multi-cursor support
- Undo/Redo (100 levels)
- Search with `/` and `?`
- Replace with `:%s/old/new/g`
- Mouse support (SGR protocol)

## Configuration

```typescript
const editor = new ModalEditor({
  tabSize: 4,
  softWrap: true,
  lineNumbers: true,
  bracketMatching: true,
});
```

To disable modal editing and use a standard editor, set `modalEditing: false` in configuration.
