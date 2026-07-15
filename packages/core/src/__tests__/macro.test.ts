import { describe, it, expect, beforeEach } from 'vitest';
import { MacroEngine } from '../macro.js';

describe('MacroEngine', () => {
  let engine: MacroEngine;

  beforeEach(() => {
    engine = new MacroEngine('/tmp/librecode-macro-test');
  });

  it('registers and retrieves macros', () => {
    engine.register({
      name: 'test',
      description: 'A test macro',
      steps: [{ type: 'shell', shell: 'echo hello' }],
    });

    const macro = engine.get('test');
    expect(macro).toBeDefined();
    expect(macro!.name).toBe('test');
    expect(macro!.description).toBe('A test macro');
  });

  it('lists registered macros', () => {
    engine.register({ name: 'macro1', steps: [] });
    engine.register({ name: 'macro2', steps: [] });

    expect(engine.list()).toHaveLength(2);
  });

  it('unregisters macros', () => {
    engine.register({ name: 'test', steps: [] });
    expect(engine.list()).toHaveLength(1);
    engine.unregister('test');
    expect(engine.list()).toHaveLength(0);
  });

  it('throws on unknown macro execution', async () => {
    await expect(engine.execute('nonexistent')).rejects.toThrow('not found');
  });

  it('validates required arguments', async () => {
    engine.register({
      name: 'test',
      arguments: [{ name: 'required_arg', required: true }],
      steps: [{ type: 'shell', shell: 'echo {{required_arg}}' }],
    });

    await expect(engine.execute('test', {})).rejects.toThrow('required');
    await expect(engine.execute('test', { required_arg: 'val' })).resolves.toBeDefined();
  });

  it('applies default values for arguments', () => {
    engine.register({
      name: 'test',
      arguments: [{ name: 'arg1', default: 'default_val' }],
      steps: [],
    });

    expect(() => engine.execute('test', {})).not.toThrow();
  });

  it('exports to JSON and imports back', () => {
    engine.register({ name: 'export-test', description: 'original', steps: [{ type: 'shell', shell: 'echo test' }] });
    const json = engine.exportToJson(engine.get('export-test')!);
    expect(json).toContain('export-test');

    const engine2 = new MacroEngine();
    engine2.importFromJson(json);
    expect(engine2.get('export-test')).toBeDefined();
  });

  it('handles conditional steps', () => {
    engine.register({
      name: 'conditional-test',
      steps: [{
        type: 'condition',
        condition: { if: 'true', then: [{ type: 'shell', shell: 'echo then' }], else: [{ type: 'shell', shell: 'echo else' }] },
      }],
    });
    expect(() => engine.execute('conditional-test')).not.toThrow();
  });
});
