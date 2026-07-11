import { getTheme } from './theme.js';
import { getTerminalCapabilities } from './terminal.js';

const SYNTAX_COLORS: Record<string, string> = {
  keyword: '\x1B[38;5;213m',
  string: '\x1B[38;5;186m',
  number: '\x1B[38;5;117m',
  comment: '\x1B[38;5;245m',
  function: '\x1B[38;5;190m',
  type: '\x1B[38;5;156m',
  operator: '\x1B[38;5;229m',
  builtin: '\x1B[38;5;210m',
  punctuation: '\x1B[38;5;188m',
  tag: '\x1B[38;5;210m',
  attr: '\x1B[38;5;190m',
  attrValue: '\x1B[38;5;186m',
  selector: '\x1B[38;5;190m',
  property: '\x1B[38;5;117m',
  variable: '\x1B[38;5;210m',
  regexp: '\x1B[38;5;186m',
};

const RESET = '\x1B[39m\x1B[22m\x1B[23m\x1B[24m';

interface CodeToken {
  type: string;
  value: string;
}

function tokenizeLine(line: string, lang: string): CodeToken[] {
  if (!lang) return [{ type: 'text', value: line }];

  switch (lang.toLowerCase()) {
    case 'js':
    case 'javascript':
    case 'ts':
    case 'typescript':
    case 'jsx':
    case 'tsx':
      return tokenizeJsLike(line);
    case 'py':
    case 'python':
      return tokenizePython(line);
    case 'rs':
    case 'rust':
      return tokenizeRust(line);
    case 'go':
      return tokenizeGo(line);
    case 'json':
      return tokenizeJson(line);
    case 'html':
    case 'xml':
    case 'svg':
      return tokenizeHtml(line);
    case 'css':
      return tokenizeCss(line);
    case 'sh':
    case 'bash':
    case 'zsh':
      return tokenizeBash(line);
    case 'diff':
      return tokenizeDiff(line);
    case 'yaml':
    case 'yml':
      return tokenizeYaml(line);
    default:
      return [{ type: 'text', value: line }];
  }
}

function tokenizeJsLike(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const keywords = /\b(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|let|new|of|return|static|switch|this|throw|try|typeof|var|void|while|with|yield|interface|type|enum|implements|from|as)\b/g;
  const strings = /'[^']*'|"[^"]*"|`[^`]*`/g;
  const numbers = /\b\d+(\.\d+)?\b/g;
  const comments = /\/\/.*|\/\*[\s\S]*?\*\//g;
  const builtin = /\b(console|Math|JSON|Promise|Array|Object|String|Number|Map|Set|Symbol|Error|Buffer|process|setTimeout|setInterval|fetch|require|module|exports)\b/g;

  let lastIndex = 0;
  const regexps = [comments, strings, keywords, numbers, builtin];

  while (lastIndex < line.length) {
    let earliest: RegExpExecArray | null = null;
    let earliestType = '';

    for (const re of regexps) {
      re.lastIndex = lastIndex;
      const match = re.exec(line);
      if (match && match.index >= lastIndex) {
        if (!earliest || match.index < earliest.index) {
          earliest = match;
          earliestType = re === comments ? 'comment'
            : re === strings ? 'string'
            : re === keywords ? 'keyword'
            : re === numbers ? 'number'
            : 'builtin';
        }
      }
    }

    if (!earliest) {
      tokens.push({ type: 'text', value: line.slice(lastIndex) });
      break;
    }

    if (earliest.index > lastIndex) {
      tokens.push({ type: 'text', value: line.slice(lastIndex, earliest.index) });
    }

    tokens.push({ type: earliestType, value: earliest[0]! });
    lastIndex = earliest.index + earliest[0].length;
  }

  return tokens;
}

function tokenizePython(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const keywords = /\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False|None)\b/g;
  const strings = /'[^']*'|"[^"]*"|'''[\s\S]*?'''|"""[\s\S]*?"""|f'[^']*'|f"[^"]*"/g;
  const numbers = /\b\d+(\.\d+)?\b/g;
  const comments = /#.*/g;
  const builtin = /\b(print|len|range|type|int|str|float|list|dict|set|tuple|open|input|map|filter|zip|enumerate|sorted|reversed|abs|min|max|sum|any|all|isinstance|hasattr|getattr|setattr|super|self|cls)\b/g;

  let lastIndex = 0;
  const regexps = [comments, strings, keywords, numbers, builtin];

  while (lastIndex < line.length) {
    let earliest: RegExpExecArray | null = null;
    let earliestType = '';
    for (const re of regexps) {
      re.lastIndex = lastIndex;
      const match = re.exec(line);
      if (match && match.index >= lastIndex) {
        if (!earliest || match.index < earliest.index) {
          earliest = match;
          earliestType = re === comments ? 'comment'
            : re === strings ? 'string'
            : re === keywords ? 'keyword'
            : re === numbers ? 'number'
            : 'builtin';
        }
      }
    }
    if (!earliest) {
      tokens.push({ type: 'text', value: line.slice(lastIndex) });
      break;
    }
    if (earliest.index > lastIndex) {
      tokens.push({ type: 'text', value: line.slice(lastIndex, earliest.index) });
    }
    tokens.push({ type: earliestType, value: earliest[0]! });
    lastIndex = earliest.index + earliest[0].length;
  }
  return tokens;
}

function tokenizeRust(line: string): CodeToken[] {
  return tokenizeJsLike(line);
}

function tokenizeGo(line: string): CodeToken[] {
  return tokenizeJsLike(line);
}

function tokenizeJson(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const strings = /"[^"]*"/g;
  const numbers = /\b\d+(\.\d+)?\b/g;
  const keywords = /\b(true|false|null)\b/g;

  let lastIndex = 0;
  const regexps = [strings, numbers, keywords];
  while (lastIndex < line.length) {
    let earliest: RegExpExecArray | null = null;
    let earliestType = '';
    for (const re of regexps) {
      re.lastIndex = lastIndex;
      const match = re.exec(line);
      if (match && match.index >= lastIndex) {
        if (!earliest || match.index < earliest.index) {
          earliest = match;
          earliestType = re === strings ? 'string'
            : re === numbers ? 'number'
            : 'keyword';
        }
      }
    }
    if (!earliest) {
      const rest = line.slice(lastIndex);
      tokens.push({ type: 'punctuation', value: rest.replace(/[{}[\]:,]/g, '') });
      for (const ch of rest) {
        if ('{}[],:'.includes(ch)) {
          tokens.push({ type: 'punctuation', value: ch });
        }
      }
      break;
    }
    if (earliest.index > lastIndex) {
      tokens.push({ type: 'text', value: line.slice(lastIndex, earliest.index) });
    }
    tokens.push({ type: earliestType, value: earliest[0]! });
    lastIndex = earliest.index + earliest[0].length;
  }
  return tokens;
}

function tokenizeHtml(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const tagRe = /<\/?[a-zA-Z][a-zA-Z0-9]*/g;
  const attrRe = /\s([a-zA-Z-]+)=/g;
  const stringRe = /"[^"]*"|'[^']*'/g;

  let lastIndex = 0;
  while (lastIndex < line.length) {
    tagRe.lastIndex = lastIndex;
    const tagMatch = tagRe.exec(line);
    if (tagMatch && tagMatch.index === lastIndex) {
      tokens.push({ type: 'tag', value: tagMatch[0]! });
      lastIndex = tagMatch.index + tagMatch[0].length;
      continue;
    }

    stringRe.lastIndex = lastIndex;
    const strMatch = stringRe.exec(line);
    if (strMatch && strMatch.index === lastIndex) {
      tokens.push({ type: 'string', value: strMatch[0]! });
      lastIndex = strMatch.index + strMatch[0].length;
      continue;
    }

    attrRe.lastIndex = lastIndex;
    const attrMatch = attrRe.exec(line);
    if (attrMatch && attrMatch.index === lastIndex) {
      tokens.push({ type: 'attr', value: attrMatch[1]! });
      tokens.push({ type: 'operator', value: '=' });
      lastIndex += attrMatch[0].length;
      continue;
    }

    tokens.push({ type: 'text', value: line[lastIndex]! });
    lastIndex++;
  }
  return tokens;
}

function tokenizeCss(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const selectorRe = /(\.[a-zA-Z-]+|#[a-zA-Z-]+|[a-zA-Z-]+)/g;
  const propertyRe = /([a-zA-Z-]+):/g;

  let lastIndex = 0;
  while (lastIndex < line.length) {
    propertyRe.lastIndex = lastIndex;
    const propMatch = propertyRe.exec(line);
    if (propMatch && propMatch.index === lastIndex) {
      tokens.push({ type: 'property', value: propMatch[1]! });
      tokens.push({ type: 'operator', value: ':' });
      lastIndex = propMatch.index + propMatch[0].length;
      continue;
    }

    selectorRe.lastIndex = lastIndex;
    const selMatch = selectorRe.exec(line);
    if (selMatch && selMatch.index === lastIndex) {
      tokens.push({ type: 'selector', value: selMatch[0]! });
      lastIndex = selMatch.index + selMatch[0].length;
      continue;
    }

    tokens.push({ type: 'text', value: line[lastIndex]! });
    lastIndex++;
  }
  return tokens;
}

function tokenizeBash(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const keywords = /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|export|local|source|declare|echo|cd|ls|rm|mv|cp|mkdir|touch|cat|grep|sed|awk|find|chmod|chown|sudo|apt|yum|npm|pnpm|yarn|git|docker|curl|wget)\b/g;
  const strings = /'[^']*'|"[^"]*"|`[^`]*`/g;
  const comments = /#.*/g;
  const variables = /\$[a-zA-Z_][a-zA-Z0-9_]*|\$\{[^}]+\}/g;

  let lastIndex = 0;
  const regexps = [comments, strings, keywords, variables];

  while (lastIndex < line.length) {
    let earliest: RegExpExecArray | null = null;
    let earliestType = '';
    for (const re of regexps) {
      re.lastIndex = lastIndex;
      const match = re.exec(line);
      if (match && match.index >= lastIndex) {
        if (!earliest || match.index < earliest.index) {
          earliest = match;
          earliestType = re === comments ? 'comment'
            : re === strings ? 'string'
            : re === keywords ? 'keyword'
            : 'variable';
        }
      }
    }
    if (!earliest) {
      tokens.push({ type: 'text', value: line.slice(lastIndex) });
      break;
    }
    if (earliest.index > lastIndex) {
      tokens.push({ type: 'text', value: line.slice(lastIndex, earliest.index) });
    }
    tokens.push({ type: earliestType, value: earliest[0]! });
    lastIndex = earliest.index + earliest[0].length;
  }
  return tokens;
}

function tokenizeDiff(line: string): CodeToken[] {
  if (line.startsWith('---') || line.startsWith('+++')) {
    return [{ type: 'keyword', value: line }];
  }
  if (line.startsWith('@@')) {
    return [{ type: 'comment', value: line }];
  }
  if (line.startsWith('+')) {
    return [{ type: 'string', value: line }];
  }
  if (line.startsWith('-')) {
    return [{ type: 'builtin', value: line }];
  }
  return [{ type: 'text', value: line }];
}

function tokenizeYaml(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const keyRe = /^(\s*)([a-zA-Z_][a-zA-Z0-9_-]*):/;
  const match = keyRe.exec(line);
  if (match) {
    tokens.push({ type: 'text', value: match[1]! });
    tokens.push({ type: 'attr', value: match[2]! });
    tokens.push({ type: 'operator', value: ':' });
    const rest = line.slice(match[0].length);
    if (rest.trim()) {
      tokens.push({ type: 'string', value: rest });
    }
  } else {
    tokens.push({ type: 'text', value: line });
  }
  return tokens;
}

function formatTokens(tokens: CodeToken[], maxWidth: number): string {
  let result = '';
  let lineLen = 0;
  for (const token of tokens) {
    const color = SYNTAX_COLORS[token.type] ?? '';
    const value = token.value;
    if (lineLen + value.length > maxWidth && lineLen > 0) {
      result += '\n';
      lineLen = 0;
    }
    result += `${color}${value}${RESET}`;
    lineLen += value.length;
  }
  return result;
}

export interface MarkdownBlock {
  type: 'heading' | 'code' | 'quote' | 'list' | 'table' | 'paragraph' | 'hr' | 'fence';
  level?: number;
  content: string;
  lang?: string;
  items?: MarkdownBlock[];
  rows?: string[][];
  filename?: string;
}

export function parseMarkdown(text: string): MarkdownBlock[] {
  const lines = text.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      let filename: string | undefined;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      const content = codeLines.join('\n');
      // Check for filename in fence line
      const fenceMatch = line.match(/^```[\w]*\s+filename="([^"]+)"/);
      if (fenceMatch) {
        filename = fenceMatch[1];
      }
      blocks.push({ type: 'code', content, lang: lang || undefined, filename });
      i++;
      continue;
    }

    if (line.startsWith('```')) {
      blocks.push({ type: 'fence', content: line });
      i++;
      continue;
    }

    if (line.startsWith('#')) {
      const level = line.match(/^#+/)?.[0]?.length ?? 1;
      const content = line.replace(/^#+\s*/, '');
      blocks.push({ type: 'heading', level, content });
      i++;
      continue;
    }

    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('>')) {
        quoteLines.push(lines[i]!.replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', content: quoteLines.join('\n') });
      continue;
    }

    if (line.match(/^[-*+]\s/) || line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && (lines[i]!.match(/^[-*+]\s/) || lines[i]!.match(/^\d+\.\s/))) {
        items.push(lines[i]!.replace(/^[-*+]\s/, '').replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push({ type: 'list', content: items.join('\n'), items: items.map((c) => ({ type: 'paragraph' as const, content: c })) });
      continue;
    }

    if (line.match(/^[-]{3,}$/) || line.match(/^[*]{3,}$/) || line.match(/^[_]{3,}$/)) {
      blocks.push({ type: 'hr', content: line });
      i++;
      continue;
    }

    if (line.includes('|') && lines[i + 1]?.match(/^[\s:| -]+$/)) {
      const rows: string[][] = [];
      const headerRow = line.split('|').map((c) => c.trim()).filter(Boolean);
      i++;
      i++;
      while (i < lines.length && lines[i]!.includes('|')) {
        const row = lines[i]!.split('|').map((c) => c.trim()).filter(Boolean);
        rows.push(row);
        i++;
      }
      blocks.push({ type: 'table', content: '', rows: [headerRow, ...rows] });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && !lines[i]!.startsWith('```') && !lines[i]!.startsWith('#') && !lines[i]!.startsWith('>') && !lines[i]!.match(/^[-*+]\s/) && !lines[i]!.match(/^\d+\.\s/) && !lines[i]!.match(/^[-]{3,}$/)) {
      paraLines.push(lines[i]!);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
    }

    if (lines[i]?.trim() === '') {
      i++;
    }
  }

  return blocks;
}

function renderInline(text: string, _maxWidth: number): string {
  const theme = getTheme();
  let result = '';
  const inlineCodeRe = /`([^`]+)`/g;
  const boldRe = /\*\*(.+?)\*\*/g;
  const italicRe = /\*(.+?)\*/g;
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;

  const segments: { start: number; end: number; render: string }[] = [];

  let match: RegExpExecArray | null;
  while ((match = inlineCodeRe.exec(text)) !== null) {
    segments.push({ start: match.index, end: match.index + match[0].length, render: `${theme.code}${match[1]}${theme.reset}` });
  }
  while ((match = boldRe.exec(text)) !== null) {
    segments.push({ start: match.index, end: match.index + match[0].length, render: `${theme.bold}${match[1]}${theme.reset}` });
  }
  while ((match = italicRe.exec(text)) !== null) {
    segments.push({ start: match.index, end: match.index + match[0].length, render: `${theme.italic}${match[1]}${theme.reset}` });
  }
  while ((match = linkRe.exec(text)) !== null) {
    segments.push({ start: match.index, end: match.index + match[0].length, render: `${theme.link}${match[1]}${theme.reset}` });
  }

  segments.sort((a, b) => a.start - b.start);

  let pos = 0;
  for (const seg of segments) {
    if (seg.start > pos) {
      result += text.slice(pos, seg.start);
    }
    result += seg.render;
    pos = seg.end;
  }
  if (pos < text.length) {
    result += text.slice(pos);
  }

  return result;
}

export function renderMarkdown(text: string): string {
  const cap = getTerminalCapabilities();
  const theme = getTheme();
  const maxWidth = Math.min(cap.width, 100);
  const blocks = parseMarkdown(text);
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const icon = block.level === 1 ? '#' : block.level === 2 ? '##' : '#';
        lines.push(`\n${theme.bold}${theme.primary}${icon} ${block.content}${theme.reset}\n`);
        break;
      }

      case 'code': {
        const lang = block.lang ?? '';
        if (block.filename) {
          lines.push(`  ${theme.dim}${block.filename}${theme.reset}`);
        }
        const codeLines = block.content.split('\n');
        const langTag = lang ? ` ${theme.dim}${lang}${theme.reset}` : '';
        lines.push(`  ${theme.dim}┌${'─'.repeat(Math.min(maxWidth - 4, 60))}${langTag}${theme.reset}`);
        for (const codeLine of codeLines) {
          const tokens = tokenizeLine(codeLine, lang);
          const rendered = formatTokens(tokens, maxWidth - 4);
          if (rendered) {
            lines.push(`  ${theme.dim}│${theme.reset} ${rendered}`);
          } else {
            lines.push(`  ${theme.dim}│${theme.reset}`);
          }
        }
        lines.push(`  ${theme.dim}└${'─'.repeat(Math.min(maxWidth - 4, 60))}${theme.reset}`);
        break;
      }

      case 'quote':
        lines.push(`\n  ${theme.dim}│${theme.reset} ${theme.muted}${block.content.replace(/\n/g, `\n  ${theme.dim}│${theme.reset} `)}${theme.reset}\n`);
        break;

      case 'list': {
        const items = block.items ?? [];
        for (const item of items) {
          lines.push(`  ${theme.secondary}•${theme.reset} ${renderInline(item.content, maxWidth - 4)}`);
        }
        lines.push('');
        break;
      }

      case 'table': {
        const rows = block.rows ?? [];
        if (rows.length > 0) {
          const colWidths = rows[0]!.map((_, ci) =>
            Math.max(...rows.map((r) => r[ci]?.length ?? 0)),
          );
          for (const row of rows) {
            const cells = row.map((cell, ci) => {
              const w = colWidths[ci] ?? 0;
              return cell.padEnd(w);
            });
            lines.push(`  ${theme.dim}│${theme.reset} ${cells.join(` ${theme.dim}│${theme.reset} `)} ${theme.dim}│${theme.reset}`);
          }
          lines.push('');
        }
        break;
      }

      case 'hr': {
        const char = theme.dim + '─'.repeat(Math.min(maxWidth, 40)) + theme.reset;
        lines.push(`\n  ${char}\n`);
        break;
      }

      case 'paragraph':
        lines.push(renderInline(block.content, maxWidth));
        lines.push('');
        break;
    }
  }

  return lines.join('\n');
}

export function renderInlineText(text: string): string {
  const cap = getTerminalCapabilities();
  const maxWidth = Math.min(cap.width, 100);
  return renderInline(text, maxWidth);
}
