import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { LibreConfig, HealthCheckResult } from 'librecode-types';
import { ConfigurationManager } from './configuration-manager.js';
import { ProviderRegistry } from './provider-registry.js';
import { ProviderFactory } from './provider-factory.js';
import { ProviderRouter } from './provider-router.js';

export function printProviderList(
  config: LibreConfig,
  registry: ProviderRegistry,
): string {
  const lines: string[] = [];
  lines.push('\x1B[1mConfigured Providers:\x1B[22m');
  lines.push('');

  const entries = Object.entries(config.providers);
  if (entries.length === 0) {
    lines.push('  \x1B[90mNo providers configured.\x1B[39m');
    lines.push('  Run \x1B[33mlibrecode provider login\x1B[39m to add one.');
    lines.push('');
    return lines.join('\n');
  }

  for (const [name, entry] of entries) {
    const meta = registry.get(name);
    const status = entry.enabled
      ? '\x1B[32m✓ enabled\x1B[39m'
      : '\x1B[90m✗ disabled\x1B[39m';
    const nameStr = meta ? `\x1B[1m${meta.name}\x1B[22m` : `\x1B[1m${name}\x1B[22m`;
    const isDefault = config.defaultProvider === name ||
      (config.defaultProvider === 'free' && name === 'free');

    lines.push(`  ${nameStr} ${status}${isDefault ? ' \x1B[36m(default)\x1B[39m' : ''}`);
    if (entry.apiKey) {
      const masked = entry.apiKey.slice(0, 8) + '…' + entry.apiKey.slice(-4);
      lines.push(`    \x1B[90mAPI Key: ${masked}\x1B[39m`);
    }
    if (entry.endpoint) {
      lines.push(`    \x1B[90mEndpoint: ${entry.endpoint}\x1B[39m`);
    }
    if (entry.defaultModel) {
      lines.push(`    \x1B[90mModel: ${entry.defaultModel}\x1B[39m`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function handleProviderLogin(
  registry: ProviderRegistry,
  configManager: ConfigurationManager,
): Promise<void> {
  const providers = registry.all();
  output.write('\x1B[1mSelect a provider to log in:\x1B[22m\n\n');
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]!;
    const keyInfo = p.requiresApiKey ? ' (API key)' : ' (no API key)';
    output.write(`  \x1B[33m${i + 1}.\x1B[39m ${p.name}${keyInfo}\n`);
  }
  output.write(`  \x1B[33m${providers.length + 1}.\x1B[39m Cancel\n\n`);

  const rl = readline.createInterface({ input, output });
  try {
    const choice = await rl.question('\x1B[90mEnter choice: \x1B[39m');
    const num = parseInt(choice.trim(), 10);
    if (isNaN(num) || num < 1 || num > providers.length + 1) {
      output.write('\x1B[33mCancelled.\x1B[39m\n');
      return;
    }
    if (num === providers.length + 1) return;

    const selected = providers[num - 1]!;
    output.write(`\n\x1B[36m── ${selected.name} ──\x1B[39m\n`);
    output.write(`Documentation: \x1B[4m${selected.docsUrl}\x1B[24m\n\n`);

    const config = configManager.load();

    if (selected.requiresApiKey) {
      const existing = config.providers[selected.id]?.apiKey;
      if (existing) {
        output.write(`\x1B[90mCurrent API key: ${existing.slice(0, 8)}…${existing.slice(-4)}\x1B[39m\n`);
        const overwrite = await rl.question('\x1B[33mOverwrite? (y/N): \x1B[39m');
        if (overwrite.toLowerCase() !== 'y') {
          output.write('\x1B[33mCancelled.\x1B[39m\n');
          return;
        }
      }

      const apiKey = await rl.question(`\x1B[90mEnter ${selected.name} API key: \x1B[39m`);
      if (!apiKey.trim()) {
        output.write('\x1B[33mNo API key entered. Cancelled.\x1B[39m\n');
        return;
      }

      config.providers[selected.id] = {
        enabled: true,
        apiKey: apiKey.trim(),
        defaultModel: selected.defaultModel,
      };
    } else {
      const defaultEndpoint = selected.id === 'ollama' ? 'http://localhost:11434' : '';
      const endpoint = await rl.question(
        `\x1B[90mEndpoint${defaultEndpoint ? ` [${defaultEndpoint}]` : ''}: \x1B[39m`,
      );
      config.providers[selected.id] = {
        enabled: true,
        endpoint: endpoint.trim() || defaultEndpoint || undefined,
        defaultModel: selected.defaultModel,
      };
    }

    configManager.save(config);
    output.write(`\n\x1B[32m✓ ${selected.name} configured.\x1B[39m\n`);
    if (config.defaultProvider === 'free') {
      output.write(`\x1B[90mProvider will be used via Free Models routing.\x1B[39m\n`);
    }
  } finally {
    rl.close();
  }
}

export async function handleProviderLogout(
  providerId: string | undefined,
  registry: ProviderRegistry,
  configManager: ConfigurationManager,
): Promise<void> {
  const config = configManager.load();

  if (providerId) {
    if (!config.providers[providerId]) {
      output.write(`\x1B[31mProvider '${providerId}' is not configured.\x1B[39m\n`);
      return;
    }
    delete config.providers[providerId];
    configManager.save(config);
    output.write(`\x1B[32m✓ Removed ${providerId} configuration.\x1B[39m\n`);
    return;
  }

  // Remove all providers
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question('\x1B[33mRemove all provider configurations? (y/N): \x1B[39m');
    if (answer.toLowerCase() !== 'y') {
      output.write('\x1B[33mCancelled.\x1B[39m\n');
      return;
    }
    configManager.save({ defaultProvider: 'free', providers: {} });
    output.write('\x1B[32m✓ All provider configurations removed.\x1B[39m\n');
  } finally {
    rl.close();
  }
}

export async function handleProviderTest(
  providerId: string,
  registry: ProviderRegistry,
  configManager: ConfigurationManager,
): Promise<void> {
  const config = configManager.load();
  const entry = config.providers[providerId];

  if (!entry || !entry.enabled) {
    output.write(`\x1B[31mProvider '${providerId}' is not configured or not enabled.\x1B[39m\n`);
    return;
  }

  output.write(`\x1B[90mTesting ${providerId}...\x1B[39m\n`);

  try {
    const factory = new ProviderFactory(registry);
    const provider = factory.create(providerId, { ...entry, enabled: true });
    const router = new ProviderRouter();
    router.addProvider(providerId, provider, 10);

    const result = await router.checkHealth(providerId);
    if (result.available) {
      output.write(`\x1B[32m✓ ${providerId} is available\x1B[39m`);
      if (result.latencyMs !== undefined) {
        output.write(` (\x1B[90m${result.latencyMs}ms\x1B[39m)`);
      }
      output.write('\n');
    } else {
      output.write(`\x1B[31m✗ ${providerId} is not available\x1B[39m\n`);
      if (result.error) {
        output.write(`  \x1B[90m${result.error}\x1B[39m\n`);
      }
    }
  } catch (err) {
    output.write(`\x1B[31m✗ Test failed: ${err instanceof Error ? err.message : String(err)}\x1B[39m\n`);
  }
}

export function printProviderCurrent(
  config: LibreConfig,
  registry: ProviderRegistry,
): string {
  const defaultProvider = config.defaultProvider ?? 'free';
  if (defaultProvider === 'free') {
    const enabled = Object.entries(config.providers).filter(([, v]) => v.enabled);
    if (enabled.length === 0) {
      return '\x1B[90mNo active provider. Run `librecode provider login` to configure one.\x1B[39m\n';
    }
    const lines = ['\x1B[36mActive Provider: Free Models\x1B[39m'];
    lines.push('\x1B[90mRouting through available free providers:\x1B[39m');
    for (const [name] of enabled) {
      const meta = registry.get(name);
      lines.push(`  \x1B[90m- ${meta?.name ?? name}\x1B[39m`);
    }
    return lines.join('\n') + '\n';
  }

  const meta = registry.get(defaultProvider);
  const entry = config.providers[defaultProvider];
  if (!meta || !entry?.enabled) {
    return '\x1B[90mNo active provider. Run `librecode provider login` to configure one.\x1B[39m\n';
  }

  const lines: string[] = [];
  lines.push(`\x1B[36mActive Provider: ${meta.name}\x1B[39m`);
  lines.push(`  \x1B[90mModel: ${entry.defaultModel ?? meta.defaultModel}\x1B[39m`);
  if (entry.apiKey) {
    const masked = entry.apiKey.slice(0, 8) + '…' + entry.apiKey.slice(-4);
    lines.push(`  \x1B[90mKey: ${masked}\x1B[39m`);
  }
  if (entry.endpoint) {
    lines.push(`  \x1B[90mEndpoint: ${entry.endpoint}\x1B[39m`);
  }
  return lines.join('\n') + '\n';
}

export async function handleProviderSwitch(
  providerId: string,
  registry: ProviderRegistry,
  configManager: ConfigurationManager,
): Promise<boolean> {
  if (providerId === 'free') {
    configManager.setDefaultProvider('free');
    output.write('\x1B[32m✓ Switched to Free Models routing.\x1B[39m\n');
    return true;
  }

  if (!registry.exists(providerId)) {
    output.write(`\x1B[31mUnknown provider: '${providerId}'.\x1B[39m\n`);
    output.write(`\x1B[90mAvailable: ${registry.all().map((p) => p.id).join(', ')}\x1B[39m\n`);
    return false;
  }

  const config = configManager.load();
  const entry = config.providers[providerId];
  if (!entry || !entry.enabled) {
    output.write(`\x1B[33mProvider '${providerId}' is not configured.\x1B[39m\n`);
    output.write(`\x1B[90mRun \x1B[33mlibrecode provider login ${providerId}\x1B[39m \x1B[90mfirst.\x1B[39m\n`);
    return false;
  }

  configManager.setDefaultProvider(providerId);
  output.write(`\x1B[32m✓ Switched to ${registry.get(providerId)?.name ?? providerId}.\x1B[39m\n`);
  return true;
}

export async function handleProviderModels(
  providerId: string,
  registry: ProviderRegistry,
  configManager: ConfigurationManager,
): Promise<void> {
  const meta = registry.get(providerId);
  if (!meta) {
    output.write(`\x1B[31mUnknown provider: '${providerId}'.\x1B[39m\n`);
    return;
  }

  output.write(`\x1B[1m${meta.name} Models\x1B[22m\n\n`);

  if (providerId === 'openrouter') {
    output.write('  \x1B[90mOpenRouter provides access to 200+ models.\x1B[39m\n');
    output.write('  \x1B[90mSee: \x1B[4mhttps://openrouter.ai/models\x1B[24m\x1B[39m\n');
    output.write('\n  \x1B[90mRecommended free models:\x1B[39m\n');
    output.write('    \x1B[33m- google/gemini-2.0-flash:free\x1B[39m\n');
    output.write('    \x1B[33m- meta-llama/llama-3.2-3b-instruct:free\x1B[39m\n');
    output.write('    \x1B[33m- mistralai/mistral-7b-instruct:free\x1B[39m\n');
  } else if (providerId === 'nvidia') {
    output.write('  \x1B[90mNVIDIA NIM provides free models through their API.\x1B[39m\n');
    output.write('  \x1B[90mSee: \x1B[4mhttps://build.nvidia.com/docs\x1B[24m\x1B[39m\n');
    output.write('\n  \x1B[90mFree models:\x1B[39m\n');
    output.write('    \x1B[33m- meta/llama-3.1-8b-instruct\x1B[39m\n');
    output.write('    \x1B[33m- mistralai/mistral-7b-instruct-v0.3\x1B[39m\n');
  } else {
    output.write(`  \x1B[90mDefault model: ${entryModel(providerId, configManager)}\x1B[39m\n`);
    output.write(`  \x1B[90mSee: \x1B[4m${meta.docsUrl}\x1B[24m\x1B[39m\n`);
  }
  output.write('\n');
}

function entryModel(providerId: string, configManager: ConfigurationManager): string {
  return configManager.load().providers[providerId]?.defaultModel ?? 'gpt-4o';
}
