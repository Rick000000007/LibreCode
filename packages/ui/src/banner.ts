import * as fs from 'node:fs';
import * as path from 'node:path';
import { type TerminalCapabilities, getTerminalCapabilities } from './terminal.js';

export type BannerKind = 'rich' | 'mono' | 'ascii' | 'none';

function resolveBannerKind(): BannerKind {
  const env = process.env['LIBRECODE_BANNER']?.toLowerCase();
  if (env === 'rich') return 'rich';
  if (env === 'mono') return 'mono';
  if (env === 'ascii') return 'ascii';
  if (env === 'none' || env === 'off' || env === 'false') return 'none';

  const cap = getTerminalCapabilities();
  if (!cap.isTTY || cap.isCI) return 'none';
  if (!cap.supportsColor) return 'ascii';
  if (!cap.supportsUnicodeBlocks) return 'ascii';
  if (cap.colorDepth >= 256) return 'rich';
  return 'mono';
}

function getBannerFile(kind: BannerKind): string | null {
  switch (kind) {
    case 'rich': return 'chakra.txt';
    case 'mono': return 'chakra-mono.txt';
    case 'ascii': return 'chakra-ascii.txt';
    case 'none': return null;
  }
}

export function renderBanner(version: string, terminal?: TerminalCapabilities): string {
  const kind = resolveBannerKind();
  if (kind === 'none') return '';

  const cap = terminal ?? getTerminalCapabilities();
  const filename = getBannerFile(kind);
  const isColor = cap.colorDepth >= 4;

  let bannerArt = '';
  if (filename) {
    const filepath = path.resolve(__dirname, '..', 'assets', filename);
    try {
      bannerArt = fs.readFileSync(filepath, 'utf-8');
    } catch {
      // assets not available
    }
  }

  if (isColor && bannerArt.length > 2) {
    const code = bannerArt.charCodeAt(0);
    if (code === 0x1b) {
      const endIdx = bannerArt.indexOf('m') + 1;
      if (endIdx > 0 && endIdx <= bannerArt.length) {
        bannerArt = bannerArt.slice(endIdx);
      }
    }
  }

  const verPadded = version.padEnd(6);
  const versionLine = `librecode v${verPadded}  AI coding agent`;
  const boxWidth = versionLine.length + 2;
  const dash = '─'.repeat(boxWidth - 2);

  const useUnicode = cap.supportsUnicodeBlocks;
  const tl = useUnicode ? '╭' : '+';
  const tr = useUnicode ? '╮' : '+';
  const bl = useUnicode ? '╰' : '+';
  const br = useUnicode ? '╯' : '+';
  const h = useUnicode ? '─' : '-';
  const v = useUnicode ? '│' : '|';

  const colorOpen = isColor ? '\x1B[36m' : '';
  const colorClose = isColor ? '\x1B[39m' : '';

  const versionBox = `${colorOpen}${tl}${dash.replace(/─/g, h)}${tr}${colorClose}\n` +
    `${colorOpen}${v}${colorClose} ${versionLine} ${colorOpen}${v}${colorClose}\n` +
    `${colorOpen}${bl}${dash.replace(/─/g, h)}${br}${colorClose}\n`;

  return bannerArt + '\n' + versionBox;
}

export function renderSimpleHeader(version: string): string {
  return `librecode v${version} - AI coding agent\n`;
}
