import { IGNORE_PATTERNS } from './types.js';

export function isIgnored(itemPath: string): boolean {
  return IGNORE_PATTERNS.some((p) => itemPath.includes(p));
}
