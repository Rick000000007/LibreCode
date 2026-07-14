import { describe, it, expect } from 'vitest';
import { PluginSystem, createPluginManifest } from '../plugin-system';

describe('PluginSystem', () => {
  it('creates empty plugin system', () => {
    const ps = new PluginSystem();
    expect(ps.getAllPlugins()).toEqual([]);
  });

  it('returns empty discovery when no directory', async () => {
    const ps = new PluginSystem();
    const manifests = await ps.discover('/nonexistent/path');
    expect(manifests).toEqual([]);
  });

  it('createPluginManifest fills defaults', () => {
    const manifest = createPluginManifest({ id: 'test-plugin' });
    expect(manifest.id).toBe('test-plugin');
    expect(manifest.name).toBe('test-plugin');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.description).toBe('');
    expect(manifest.entry).toBe('index.js');
  });

  it('createPluginManifest preserves overrides', () => {
    const manifest = createPluginManifest({
      id: 'my-plugin',
      name: 'My Plugin',
      version: '2.0.0',
      description: 'A test plugin',
      entry: 'dist/main.js',
    });
    expect(manifest.id).toBe('my-plugin');
    expect(manifest.name).toBe('My Plugin');
    expect(manifest.version).toBe('2.0.0');
    expect(manifest.description).toBe('A test plugin');
    expect(manifest.entry).toBe('dist/main.js');
  });

  it('unload returns false for nonexistent plugin', () => {
    const ps = new PluginSystem();
    expect(ps.unload('nonexistent')).toBe(false);
  });

  it('runHookWithReturn returns initial value with no plugins', async () => {
    const ps = new PluginSystem();
    const result = await ps.runHookWithReturn('onPromptBuild', 'initial prompt');
    expect(result).toBe('initial prompt');
  });
});
