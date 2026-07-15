import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface EditorConfig {
  editor?: string;
  tempDir?: string;
}

const KNOWN_EDITORS: Record<string, { cmd: string; args: string[]; waitFlag: boolean }> = {
  vim: { cmd: 'vim', args: [], waitFlag: false },
  neovim: { cmd: 'nvim', args: [], waitFlag: false },
  nano: { cmd: 'nano', args: [], waitFlag: false },
  helix: { cmd: 'hx', args: [], waitFlag: false },
  code: { cmd: 'code', args: ['--wait'], waitFlag: true },
  zed: { cmd: 'zed', args: ['--wait'], waitFlag: true },
  subl: { cmd: 'subl', args: ['--wait'], waitFlag: true },
  emacs: { cmd: 'emacs', args: [], waitFlag: false },
};

function detectEditor(preferred?: string): { cmd: string; args: string[] } {
  const envEditor = process.env['VISUAL'] || process.env['EDITOR'];

  if (preferred) {
    const known = KNOWN_EDITORS[preferred.toLowerCase()];
    if (known) return { cmd: known.cmd, args: known.args };
    return { cmd: preferred, args: [] };
  }

  if (envEditor) {
    const parts = envEditor.split(/\s+/);
    return { cmd: parts[0]!, args: parts.slice(1) };
  }

  for (const [, known] of Object.entries(KNOWN_EDITORS)) {
    try {
      const result = spawn(known.cmd, ['--version'], { stdio: 'ignore' });
      result.unref();
      return { cmd: known.cmd, args: known.args };
    } catch { /* try next */ }
  }

  return { cmd: 'vim', args: [] };
}

export class ExternalEditor {
  private tempDir: string;

  constructor(config?: EditorConfig) {
    this.tempDir = config?.tempDir ?? path.join(os.tmpdir(), 'librecode-editor');
    fs.mkdirSync(this.tempDir, { recursive: true });
    this.cleanupTempFiles();
  }

  async edit(initialContent: string, extension = '.md'): Promise<string | null> {
    const tempFile = path.join(this.tempDir, `editor-${Date.now()}${extension}`);
    fs.writeFileSync(tempFile, initialContent, 'utf-8');
    return this.editFile(tempFile);
  }

  async editFile(filePath: string, preferred?: string): Promise<string | null> {
    const { cmd, args } = detectEditor(preferred);

    return new Promise((resolve, reject) => {
      const originalContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
      const editor = spawn(cmd, [...args, filePath], {
        stdio: 'inherit',
        env: process.env,
      });

      editor.on('exit', (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }
        try {
          const newContent = fs.readFileSync(filePath, 'utf-8');
          resolve(newContent);
        } catch (err) {
          reject(err);
        }
      });

      editor.on('error', (err) => {
        reject(new Error(`Failed to launch editor '${cmd}': ${err.message}`));
      });
    });
  }

  async compose(prompt?: string): Promise<string | null> {
    const header = prompt
      ? `# Compose\n\n${prompt}\n\n---\n# Write your content below this line\n\n`
      : `# Write your content below\n\n`;
    const result = await this.edit(header, '.md');
    if (!result) return null;
    return result.replace(/^# Compose[\s\S]*?---\n# Write your content below this line\n\n/, '');
  }

  async editSelection(text: string): Promise<string | null> {
    return this.edit(text, '.txt');
  }

  async editPrompt(prompt: string): Promise<string | null> {
    return this.edit(prompt, '.md');
  }

  cleanupTempFiles(): void {
    try {
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > 86_400_000) {
            fs.unlinkSync(filePath);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  destroy(): void {
    this.cleanupTempFiles();
    try { fs.rmdirSync(this.tempDir); } catch { /* skip */ }
  }
}
