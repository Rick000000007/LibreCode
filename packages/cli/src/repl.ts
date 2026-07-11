import * as readline from 'node:readline';

export function createRepl(prompt: string): readline.Interface {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt,
    terminal: true,
  });

  rl.on('SIGINT', () => {
    rl.question('\n\x1B[90mExit rcode? (y/N) \x1B[39m', (answer: string) => {
      if (answer.toLowerCase() === 'y') {
        rl.close();
      } else {
        rl.prompt();
      }
    });
  });

  return rl;
}
