import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { LibreConfig } from 'librecode-types';
import { ProviderRegistry } from './provider-registry.js';
import { ConfigurationManager } from './configuration-manager.js';

export class SetupWizard {
  private registry: ProviderRegistry;
  private configManager: ConfigurationManager;

  constructor(registry: ProviderRegistry, configManager: ConfigurationManager) {
    this.registry = registry;
    this.configManager = configManager;
  }

  async run(): Promise<boolean> {
    const rl = readline.createInterface({ input, output });

    try {
      output.write('\x1B[36m╭──────────────────────────────────────╮\x1B[39m\n');
      output.write('\x1B[36m│\x1B[39m  \x1B[1mWelcome to LibreCode\x1B[22m                  \x1B[36m│\x1B[39m\n');
      output.write('\x1B[36m│\x1B[39m  Let\'s set up your AI provider.        \x1B[36m│\x1B[39m\n');
      output.write('\x1B[36m╰──────────────────────────────────────╯\x1B[39m\n\n');

      const providers = this.registry.all();

      output.write('Choose an AI provider:\n\n');
      for (let i = 0; i < providers.length; i++) {
        const p = providers[i]!;
        const keyInfo = p.requiresApiKey ? ' (API key required)' : ' (no API key needed)';
        const freeInfo = p.hasFreeTier ? ' \x1B[32m✓ Free tier available\x1B[39m' : '';
        output.write(`  \x1B[33m${i + 1}.\x1B[39m ${p.name}${keyInfo}${freeInfo}\n`);
      }
      output.write(`  \x1B[33m${providers.length + 1}.\x1B[39m Configure Later\n\n`);

      const choice = await rl.question('\x1B[90mEnter choice (1-' + (providers.length + 1) + '): \x1B[39m');
      const num = parseInt(choice.trim(), 10);

      if (num < 1 || num > providers.length + 1 || isNaN(num)) {
        output.write('\x1B[33mNo provider configured. Run `librecode` again to set up.\x1B[39m\n');
        this.saveEmpty();
        return false;
      }

      if (num === providers.length + 1) {
        output.write('\x1B[33mYou can configure a provider later with `librecode provider login`.\x1B[39m\n');
        this.saveEmpty();
        return false;
      }

      const selected = providers[num - 1]!;
      return await this.configureProvider(rl, selected.id);
    } finally {
      rl.close();
    }
  }

  private async configureProvider(rl: readline.Interface, providerId: string): Promise<boolean> {
    const meta = this.registry.get(providerId);
    if (!meta) return false;

    output.write(`\n\x1B[36m── ${meta.name} Configuration ──\x1B[39m\n\n`);

    const config: LibreConfig = {
      defaultProvider: providerId,
      providers: {},
    };

    if (meta.requiresApiKey) {
      output.write(`Get your API key at: \x1B[4m${meta.docsUrl}\x1B[24m\n\n`);
      const apiKey = await rl.question(`\x1B[90mEnter your ${meta.name} API key (or leave blank to skip): \x1B[39m`);
      if (!apiKey.trim()) {
        output.write('\x1B[33mSkipped. Run `librecode provider login` later to configure.\x1B[39m\n');
        return false;
      }
      config.providers[providerId] = {
        enabled: true,
        apiKey: apiKey.trim(),
        defaultModel: meta.defaultModel,
      };
    } else {
      const endpoint = await rl.question(
        `\x1B[90mEnter ${meta.name} endpoint [${meta.defaultModel}]: \x1B[39m`,
      );
      config.providers[providerId] = {
        enabled: true,
        endpoint: endpoint.trim() || undefined,
        defaultModel: meta.defaultModel,
      };
    }

    this.configManager.save(config);
    output.write(`\n\x1B[32m✓ ${meta.name} configured successfully!\x1B[39m\n`);
    return true;
  }

  private saveEmpty(): void {
    const config: LibreConfig = {
      defaultProvider: 'free',
      providers: {},
    };
    this.configManager.save(config);
  }
}
