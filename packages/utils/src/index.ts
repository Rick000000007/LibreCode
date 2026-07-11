import type { Message, TokenUsage } from 'librecode-types';

export function truncateText(s: string, maxLen: number): string {
  const oneLine = s.split('\n').join(' ');
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen) + '…';
}

export function safeTruncate(s: string, maxBytes: number): string {
  if (s.length <= maxBytes) return s;
  let end = maxBytes;
  while (end > 0 && !isCharBoundary(s, end)) {
    end--;
  }
  return s.slice(0, end) + '...';
}

function isCharBoundary(s: string, index: number): boolean {
  if (index <= 0 || index >= s.length) return true;
  const code = s.charCodeAt(index);
  return (code & 0xc0) !== 0x80;
}

export function formatArgsPreview(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
    case 'undo_edit':
      return (args['path'] as string) ?? (args['file_path'] as string) ?? '';
    case 'run_command': {
      const cmd = (args['command'] as string) ?? '';
      return truncateText(cmd, 60);
    }
    case 'search_code': {
      const pattern = (args['pattern'] as string) ?? '';
      return truncateText(pattern, 60);
    }
    case 'list_directory':
      return (args['path'] as string) ?? '.';
    case 'git': {
      const cmd = (args['command'] as string) ?? '';
      return truncateText(cmd, 60);
    }
    case 'web_fetch': {
      const url = (args['url'] as string) ?? '';
      return truncateText(url, 60);
    }
    default:
      return '';
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function isBinary(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const checkLen = Math.min(bytes.length, 8192);
  let nullCount = 0;
  for (let i = 0; i < checkLen; i++) {
    if (bytes[i] === 0) nullCount++;
  }
  return nullCount > checkLen / 16;
}

const BPE_CACHE = new Map<string, number>();

function estimateTokenCount(text: string): number {
  const cached = BPE_CACHE.get(text);
  if (cached !== undefined) return cached;

  let tokens = 0;
  let i = 0;
  while (i < text.length) {
    const code = text.codePointAt(i);
    if (code === undefined) { i++; continue; }

    if (code <= 0x7f) {
      tokens += code <= 0x20 || code === 0x7f ? 1 : 0.25;
    } else if (code <= 0x7ff) {
      tokens += 1;
    } else if (code <= 0xffff) {
      tokens += 1.5;
    } else {
      tokens += 2;
    }
    i += code > 0xffff ? 2 : 1;
  }

  const estimated = Math.ceil(tokens);
  if (BPE_CACHE.size < 10000) {
    BPE_CACHE.set(text, estimated);
  }
  return estimated;
}

export function countTokens(text: string): number {
  return estimateTokenCount(text);
}

export function countMessageTokens(msg: Message): number {
  const contentTokens = countTokens(msg.content ?? '');
  const toolTokens =
    msg.tool_calls?.reduce((sum, tc) => {
      return sum + countTokens(tc.function.name) + countTokens(tc.function.arguments);
    }, 0) ?? 0;
  const overhead = msg.role === 'tool' ? 3 : 4;
  return contentTokens + toolTokens + overhead;
}

export function countMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
}

export function sumTokenUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, u) => ({
      promptTokens: acc.promptTokens + u.promptTokens,
      completionTokens: acc.completionTokens + u.completionTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}

export function resolvePath(path: string, workingDir: string): string {
  if (path.startsWith('/') || path.match(/^[A-Za-z]:\\/)) {
    return path;
  }
  return joinPaths(workingDir, path);
}

export function joinPaths(...parts: string[]): string {
  const isWindows = process.platform === 'win32';
  return parts
    .map((p, i) => {
      if (i === 0) return p.replace(/\/+$/, '');
      return p.replace(/^\/+|\/+$/g, '');
    })
    .join(isWindows ? '\\' : '/')
    .replace(/\/{2,}/g, '/');
}

export function getEnvVar(name: string): string | undefined {
  return process.env[name];
}
