import { TuiApp } from './packages/ui/dist/app.js';
import { globalCommandRegistry } from './packages/cli/dist/command-framework.js';
import './packages/cli/dist/commands-impl.js';
const tuiApp = new TuiApp({
  provider: 'free',
  model: 'auto',
  gitBranch: 'master',
  workingDir: process.cwd(),
  onSubmit: async (input) => {
    if (input === '/help') {
      const name = 'help';
      await globalCommandRegistry.executeCommand(name, {
        args: [],
        tuiApp
      });
      tuiApp.render();
      setTimeout(() => process.exit(0), 100);
    }
  }
});
tuiApp.start();
tuiApp.getInput().buffer = '/help';
tuiApp.getInput().cursor = 5;
tuiApp.getInput()['submit']();
