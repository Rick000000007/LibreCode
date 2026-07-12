import { globalCommandRegistry } from './packages/cli/dist/command-framework.js';
import './packages/cli/dist/commands-impl.js';
const cmd = globalCommandRegistry.getCommand('help');
console.log(cmd ? 'Found help' : 'Not found');
