import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolRegistry, ReadFileTool, WriteFileTool, EditFileTool, UndoFileTool, ListDirTool, SearchCodeTool, RunCommandTool, GitTool, WebFetchTool, PermissionChecker, SafetyChecker } from '../index.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Tools Package', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('ToolRegistry', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistry();
    });

    it('registers and retrieves tools', () => {
      const tool = new ReadFileTool();
      registry.register(tool);
      expect(registry.get('read_file')).toBe(tool);
    });

    it('returns undefined for unknown tool', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('returns definitions for all registered tools', () => {
      registry.register(new ReadFileTool());
      registry.register(new WriteFileTool());
      const defs = registry.definitions();
      expect(defs).toHaveLength(2);
      expect(defs.map(d => d.function.name).sort()).toEqual(['read_file', 'write_file']);
    });

    it('executes registered tool', async () => {
      const filePath = path.join(testDir, 'test.txt');
      fs.writeFileSync(filePath, 'Hello world');
      registry.register(new ReadFileTool());
      const result = await registry.execute('read_file', { path: filePath }, testDir);
      expect(result).toContain('Hello world');
    });

    it('throws for unknown tool execution', async () => {
      await expect(registry.execute('unknown', {}, testDir)).rejects.toThrow('Unknown tool: unknown');
    });

    it('defaultRegistry includes all built-in tools', () => {
      const defs = ToolRegistry.defaultRegistry().definitions();
      const names = defs.map(d => d.function.name).sort();
      expect(names).toEqual([
        'edit_file',
        'git',
        'list_directory',
        'read_file',
        'run_command',
        'search_code',
        'undo_edit',
        'web_fetch',
        'write_file',
      ]);
    });
  });

  describe('ReadFileTool', () => {
    let tool: ReadFileTool;

    beforeEach(() => {
      tool = new ReadFileTool();
    });

    it('reads file content', async () => {
      const filePath = path.join(testDir, 'read.txt');
      fs.writeFileSync(filePath, 'File content');
      const result = await tool.execute({ path: filePath }, testDir);
      expect(result).toContain('File content');
    });

    it('throws for non-existent file', async () => {
      await expect(tool.execute({ path: path.join(testDir, 'nonexistent.txt') }, testDir)).rejects.toThrow();
    });

    it('returns definition', () => {
      const def = tool.definition();
      expect(def.function.name).toBe('read_file');
      expect(def.function.description).toContain('Read');
      expect(def.function.parameters).toBeDefined();
    });
  });

  describe('WriteFileTool', () => {
    let tool: WriteFileTool;

    beforeEach(() => {
      tool = new WriteFileTool();
    });

    it('writes file content', async () => {
      const filePath = path.join(testDir, 'write.txt');
      const result = await tool.execute({ path: filePath, content: 'New content' }, testDir);
      expect(result.toLowerCase()).toContain('wrote');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('New content');
    });

    it('creates parent directories', async () => {
      const filePath = path.join(testDir, 'subdir', 'nested.txt');
      await tool.execute({ path: filePath, content: 'Nested' }, testDir);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('Nested');
    });

    it('returns definition', () => {
      const def = tool.definition();
      expect(def.function.name).toBe('write_file');
      expect(def.function.description).toContain('Write');
    });
  });

  describe('EditFileTool', () => {
    let tool: EditFileTool;

    beforeEach(() => {
      tool = new EditFileTool();
    });

    it('replaces text in file', async () => {
      const filePath = path.join(testDir, 'edit.txt');
      fs.writeFileSync(filePath, 'Hello world');
      const result = await tool.execute({ path: filePath, old_string: 'world', new_string: 'universe' }, testDir);
      expect(result.toLowerCase()).toContain('edited');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello universe');
    });

    it('throws when old_str not found', async () => {
      const filePath = path.join(testDir, 'edit.txt');
      fs.writeFileSync(filePath, 'Hello world');
      await expect(tool.execute({ path: filePath, old_str: 'missing', new_str: 'test' }, testDir)).rejects.toThrow();
    });

    it('returns definition', () => {
      const def = tool.definition();
      expect(def.function.name).toBe('edit_file');
      expect(def.function.description).toContain('Edit');
    });
  });

  describe('UndoFileTool', () => {
    let tool: UndoFileTool;

    beforeEach(() => {
      tool = new UndoFileTool();
    });

    it('undoes last edit', async () => {
      const filePath = path.join(testDir, 'undo.txt');
      const backupPath = filePath + '.bak';
      fs.writeFileSync(filePath, 'Modified');
      fs.writeFileSync(backupPath, 'Original');
      const result = await tool.execute({ path: filePath }, testDir);
      expect(result.toLowerCase()).toContain('restored');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('Original');
    });

    it('throws when no history', async () => {
      const filePath = path.join(testDir, 'no_history.txt');
      fs.writeFileSync(filePath, 'Content');
      await expect(tool.execute({ path: filePath }, testDir)).rejects.toThrow();
    });

    it('returns definition', () => {
      const def = tool.definition();
      expect(def.function.name).toBe('undo_edit');
      expect(def.function.description).toContain('Undo');
    });
  });

  describe('ListDirTool', () => {
    let tool: ListDirTool;

    beforeEach(() => {
      tool = new ListDirTool();
      fs.mkdirSync(path.join(testDir, 'subdir'));
      fs.writeFileSync(path.join(testDir, 'file.txt'), 'content');
    });

    it('lists directory contents', async () => {
      const result = await tool.execute({ path: testDir }, testDir);
      expect(result).toContain('file.txt');
      expect(result).toContain('subdir');
    });

    it('defaults to current directory', async () => {
      const result = await tool.execute({}, testDir);
      expect(result).toContain('file.txt');
    });

    it('returns definition', () => {
      const def = tool.definition();
      expect(def.function.name).toBe('list_directory');
      expect(def.function.description).toContain('List');
    });
  });

  describe('SearchCodeTool', () => {
    let tool: SearchCodeTool;

    beforeEach(() => {
      tool = new SearchCodeTool();
      fs.writeFileSync(path.join(testDir, 'code.ts'), 'function hello() { return "world"; }');
      fs.writeFileSync(path.join(testDir, 'other.js'), 'const x = 1;');
    });

    it('finds matches in files', async () => {
      const result = await tool.execute({ pattern: 'hello' }, testDir);
      expect(result).toContain('hello');
    });

    it('respects case sensitivity', async () => {
      const result = await tool.execute({ pattern: 'HELLO', case_sensitive: true }, testDir);
      expect(result).not.toContain('hello');
    });

    it('returns definition', () => {
      const def = tool.definition();
      expect(def.function.name).toBe('search_code');
      expect(def.function.description).toContain('Search');
    });
  });

  describe('RunCommandTool', () => {
    let tool: RunCommandTool;

    beforeEach(() => {
      tool = new RunCommandTool();
    });

    it('runs simple command', async () => {
      const result = await tool.execute({ command: 'echo hello' }, testDir);
      expect(result).toContain('hello');
    });

    it('captures stderr', async () => {
      const result = await tool.execute({ command: 'echo error >&2' }, testDir);
      expect(typeof result).toBe('string');
    });

    it('returns definition', () => {
      const def = tool.definition();
      expect(def.function.name).toBe('run_command');
      expect(def.function.description).toContain('Execute');
    });
  });

  describe('GitTool', () => {
    let tool: GitTool;

    beforeEach(async () => {
      tool = new GitTool();
      await tool.execute({ action: 'init' }, testDir);
      await tool.execute({ action: 'run', args: 'config user.email "test@test.com"' }, testDir);
      await tool.execute({ action: 'run', args: 'config user.name "Test"' }, testDir);
    });

    it('runs git status', async () => {
      const result = await tool.execute({ action: 'status' }, testDir);
      expect(typeof result).toBe('string');
    });

    it('runs git diff', async () => {
      fs.writeFileSync(path.join(testDir, 'file.txt'), 'content');
      await tool.execute({ action: 'add', args: 'file.txt' }, testDir);
      const result = await tool.execute({ action: 'diff', args: '--cached' }, testDir);
      expect(typeof result).toBe('string');
    });

    it('returns definition', () => {
      const def = tool.definition();
      expect(def.function.name).toBe('git');
      expect(def.function.description).toContain('git commands');
    });
  });

  describe('WebFetchTool', () => {
    let tool: WebFetchTool;

    beforeEach(() => {
      tool = new WebFetchTool();
    });

    it('returns definition', () => {
      const def = tool.definition();
      expect(def.function.name).toBe('web_fetch');
      expect(def.function.description).toContain('Fetch');
    });
  });

  describe('PermissionChecker', () => {
    it('allows all tools when yes=true', async () => {
      const checker = new PermissionChecker(true);
      expect(await checker.check('any_tool', {})).toBe(true);
    });

    it('allows safe tools by default', async () => {
      const checker = new PermissionChecker(false);
      expect(await checker.check('read_file', {})).toBe(true);
    });

    it('allows unsafe tools in non-interactive mode', async () => {
      const checker = new PermissionChecker(false);
      expect(await checker.check('run_command', {})).toBe(true);
    });

    it('allows explicitly allowed tools', async () => {
      const checker = new PermissionChecker(false);
      checker.setAlwaysAllow('run_command');
      expect(await checker.check('run_command', {})).toBe(true);
    });

    it('denies explicitly denied tools', async () => {
      const checker = new PermissionChecker(false);
      checker.setDeny('write_file');
      expect(await checker.check('write_file', {})).toBe(false);
    });

    it('resets tool permissions', async () => {
      const checker = new PermissionChecker(false);
      checker.setAlwaysAllow('run_command');
      checker.resetTool('run_command');
      expect(await checker.check('run_command', {})).toBe(true); // fallbacks to non-interactive true
    });

    it('lists permissions', () => {
      const checker = new PermissionChecker(false);
      checker.setAlwaysAllow('run_command');
      checker.setDeny('write_file');
      const perms = checker.listPermissions();
      expect(perms.run_command).toBe('always_allow');
      expect(perms.write_file).toBe('deny');
    });

    it('SAFE_TOOLS contains expected tools', () => {
      expect(PermissionChecker.SAFE_TOOLS).toContain('read_file');
      expect(PermissionChecker.SAFE_TOOLS).toContain('list_directory');
      expect(PermissionChecker.SAFE_TOOLS).toContain('search_code');
      expect(PermissionChecker.SAFE_TOOLS).not.toContain('run_command');
    });
  });

  describe('SafetyChecker', () => {
    it('checks path safety', () => {
      const checker = new SafetyChecker();
      const result = checker.checkPathTraversal('/home/user/file.txt', '/home/user');
      expect(result.kind).toBe('safe');
      const result2 = checker.checkPathTraversal('/etc/passwd', '/home/user');
      expect(result2.kind).toBe('warning');
    });

    it('handles relative paths', () => {
      const checker = new SafetyChecker();
      const result = checker.checkPathTraversal('subdir/file.txt', '/home/user');
      expect(result.kind).toBe('safe');
    });
  });
});