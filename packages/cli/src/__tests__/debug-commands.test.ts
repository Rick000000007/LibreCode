import { describe, it, expect } from 'vitest';
import { globalCommandRegistry } from '../command-framework.js';
import '../commands-impl.js';

describe('Debug Commands', () => {
  it('registry has registered commands', () => {
    const cmds = globalCommandRegistry.getAllCommands();
    console.log('Registered commands:', cmds.map(c => c.metadata.name));
    expect(cmds.length).toBeGreaterThan(0);
  });
});
