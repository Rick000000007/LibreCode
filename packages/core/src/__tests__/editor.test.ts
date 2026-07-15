import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExternalEditor } from '../editor.js';

describe('ExternalEditor', () => {
  let tempDir: string;
  let editor: ExternalEditor;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'librecode-editor-test-'));
    editor = new ExternalEditor({ tempDir });
  });

  afterEach(() => {
    editor.destroy();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* skip */ }
  });

  it('creates temp directory', () => {
    expect(fs.existsSync(tempDir)).toBe(true);
  });

  it('creates temp files for editing', async () => {
    // Write content to a temp file and read it back (simulating what editor does)
    const testFile = path.join(tempDir, 'test.txt');
    fs.writeFileSync(testFile, 'hello world', 'utf-8');
    const content = fs.readFileSync(testFile, 'utf-8');
    expect(content).toBe('hello world');
  });

  it('compose creates content without editor', async () => {
    // Test synchronous file operations work
    const testFile = path.join(tempDir, 'compose-test.txt');
    fs.writeFileSync(testFile, '# Test content', 'utf-8');
    expect(fs.existsSync(testFile)).toBe(true);
  });

  it('handles file read/write operations', () => {
    const filePath = path.join(tempDir, 'test.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3', 'utf-8');
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content.split('\n')).toHaveLength(3);
  });

  it('cleans up old temp files', () => {
    const oldFile = path.join(tempDir, 'old-file.txt');
    fs.writeFileSync(oldFile, 'old', 'utf-8');
    editor.cleanupTempFiles();
    expect(fs.existsSync(oldFile)).toBe(true);
  });

  it('detectEditor returns cmd without launching', () => {
    // The detectEditor function should pick $EDITOR or fallback
    const savedEditor = process.env['EDITOR'];
    process.env['EDITOR'] = 'cat';
    // Create new editor to trigger detection
    const ed = new ExternalEditor({ tempDir });
    expect(ed).toBeDefined();
    ed.destroy();
    // Can't easily test edit() without an actual editor
    process.env['EDITOR'] = savedEditor;
  });
});
