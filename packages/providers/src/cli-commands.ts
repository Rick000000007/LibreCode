import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { LibreConfig } from 'librecode-types';
import { ConfigurationManager } from './configuration-manager.js';
import { ProviderRegistry } from './provider-registry.js';
import { ProviderFactory } from './provider-factory.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

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
    lines.push('');
    lines.push('  \x1B[90mBuilt-in providers available (configure via \x1B[33mlibrecode provider login\x1B[39m\x1B[90m):\x1B[39m');
    for (const p of registry.all()) {
      lines.push(`    \x1B[33m${p.id.padEnd(15)}\x1B[39m ${p.description}`);
    }
    lines.push('');
    lines.push('  \x1B[90mCustom providers: add to config or use \x1B[33mlibrecode provider login\x1B[39m');
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

export function restoreCustomProviders(
  registry: ProviderRegistry,
  configManager: ConfigurationManager,
): number {
  const config = configManager.load();
  return registry.restoreCustomFromConfig(config);
}

export async function handleProviderLogin(
  registry: ProviderRegistry,
  configManager: ConfigurationManager,
): Promise<void> {
  restoreCustomProviders(registry, configManager);
  const providers = registry.all();
  output.write('\x1B[1mSelect a provider to configure:\x1B[22m\n\n');
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]!;
    const keyInfo = p.requiresApiKey ? ' (API key)' : ' (no API key needed)';
    output.write(`  \x1B[33m${i + 1}.\x1B[39m ${p.name}${keyInfo}\n`);
  }
  output.write(`  \x1B[33m${providers.length + 1}.\x1B[39m Custom provider (any OpenAI-compatible API)\n`);
  output.write(`  \x1B[33m${providers.length + 2}.\x1B[39m Cancel\n\n`);

  const rl = readline.createInterface({ input, output });
  try {
    const choice = await rl.question('\x1B[90mEnter choice: \x1B[39m');
    const num = parseInt(choice.trim(), 10);

    if (isNaN(num) || num < 1) {
      output.write('\x1B[33mCancelled.\x1B[39m\n');
      return;
    }

    if (num === providers.length + 2) return;

    if (num === providers.length + 1) {
      await configureCustomProvider(rl, registry, configManager);
      return;
    }

    if (num < 1 || num > providers.length) {
      output.write('\x1B[33mInvalid choice.\x1B[39m\n');
      return;
    }

    const selected = providers[num - 1]!;
    await configureExistingProvider(rl, registry, configManager, selected.id);
  } finally {
    rl.close();
  }
}

async function configureCustomProvider(
  rl: readline.Interface,
  registry: ProviderRegistry,
  configManager: ConfigurationManager,
): Promise<void> {
  output.write('\n\x1B[36m── Custom Provider Configuration ──\x1B[39m\n\n');

  const rawName = await rl.question('\x1B[90mProvider name (e.g. my-provider): \x1B[39m');
  const name = rawName.trim();
  if (!name) {
    output.write('\x1B[33mCancelled.\x1B[39m\n');
    return;
  }

  const rawBaseUrl = await rl.question('\x1B[90mBase URL (e.g. https://api.example.com/v1): \x1B[39m');
  const baseUrl = rawBaseUrl.trim();
  if (!baseUrl) {
    output.write('\x1B[33mBase URL is required. Cancelled.\x1B[39m\n');
    return;
  }

  const rawKey = await rl.question('\x1B[90mAPI key (leave blank if not needed): \x1B[39m');
  const apiKey = rawKey.trim() || undefined;
  const rawModel = await rl.question('\x1B[90mDefault model name: \x1B[39m');
  const model = rawModel.trim() || 'gpt-4o';

  registry.registerCustom({
    id: name,
    name,
    baseUrl,
    apiKey,
    defaultModel: model,
    description: `Custom OpenAI-compatible provider`,
    requiresApiKey: true,
  });

  const config = configManager.load();
  config.providers[name] = {
    enabled: true,
    apiKey,
    endpoint: baseUrl,
    defaultModel: model,
  };
  config.defaultProvider = name;
  configManager.save(config);

  output.write(`\n\x1B[32m✓ Custom provider '${name}' configured successfully!\x1B[39m\n`);
}

async function configureExistingProvider(
  rl: readline.Interface,
  registry: ProviderRegistry,
  configManager: ConfigurationManager,
  providerId: string,
): Promise<void> {
  const meta = registry.get(providerId);
  if (!meta) return;

  output.write(`\n\x1B[36m── ${meta.name} ──\x1B[39m\n`);
  const config = configManager.load();

  const builtin = registry.getBuiltin(providerId);
  if (builtin?.envKey) {
    const envValue = process.env[builtin.envKey];
    if (envValue) {
      output.write(`\x1B[90mFound ${builtin.envKey} environment variable.\x1B[39m\n`);
    }
  }
  output.write(`\x1B[90mEndpoint: ${builtin?.baseUrl ?? registry.getBaseUrl(providerId) ?? 'https://api.openai.com/v1'}\x1B[39m\n`);
  output.write(`\x1B[90mDefault model: ${meta.defaultModel}\x1B[39m\n\n`);

  let apiKey = '';
  if (meta.requiresApiKey) {
    const existing = config.providers[providerId]?.apiKey;
    if (existing) {
      output.write(`\x1B[90mCurrent API key: ${existing.slice(0, 8)}…${existing.slice(-4)}\x1B[39m\n`);
      const rawOverwrite = await rl.question('\x1B[33mOverwrite? (y/N): \x1B[39m');
      if (rawOverwrite.trim().toLowerCase() === 'y') {
        const rawKey = await rl.question(`\x1B[90mEnter ${meta.name} API key: \x1B[39m`);
        apiKey = rawKey.trim();
      } else {
        apiKey = existing;
      }
    } else {
      const rawKey = await rl.question(`\x1B[90mEnter ${meta.name} API key: \x1B[39m`);
      apiKey = rawKey.trim();
    }

    if (!apiKey) {
      const envApiKey = builtin?.envKey ? process.env[builtin.envKey] : undefined;
      if (envApiKey) {
        apiKey = envApiKey;
        output.write(`\x1B[90mUsing ${builtin?.envKey} from environment.\x1B[39m\n`);
      } else {
        output.write('\x1B[33mNo API key provided. Cancelled.\x1B[39m\n');
        return;
      }
    }
  }

  const rawModel = await rl.question(`\x1B[90mModel [${meta.defaultModel}]: \x1B[39m`);
  const model = rawModel.trim() || meta.defaultModel;

  config.providers[providerId] = {
    enabled: true,
    apiKey: apiKey || undefined,
    defaultModel: model,
  };
  config.defaultProvider = providerId;
  configManager.save(config);

  output.write(`\n\x1B[32m✓ ${meta.name} configured successfully!\x1B[39m\n`);

  // Test the connection
  const rawTest = await rl.question('\x1B[90mRun connection test? (Y/n): \x1B[39m');
  if (rawTest.trim().toLowerCase() !== 'n') {
    await handleProviderTest(providerId, registry, configManager);
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
    if (config.defaultProvider === providerId) {
      config.defaultProvider = 'free';
    }
    configManager.save(config);
    output.write(`\x1B[32m✓ Removed ${providerId} configuration.\x1B[39m\n`);
    if (registry.isCustom(providerId)) {
      registry.unregisterCustom(providerId);
    }
    return;
  }

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
  const meta = registry.get(providerId);

  if (!meta && !entry) {
    output.write(`\x1B[31mUnknown provider: '${providerId}'.\x1B[39m\n`);
    output.write(`\x1B[90mAvailable: ${registry.all().map((p) => p.id).join(', ')}\x1B[39m\n`);
    return;
  }

  const factory = new ProviderFactory(registry);
  let provider: OpenAICompatibleProvider;

  try {
    const llmProvider = factory.create(providerId, {
      enabled: true,
      apiKey: entry?.apiKey,
      endpoint: entry?.endpoint,
      defaultModel: entry?.defaultModel ?? meta?.defaultModel,
    });
    provider = llmProvider as OpenAICompatibleProvider;
  } catch (err) {
    output.write(`\x1B[31m✘ Failed to create provider: ${err instanceof Error ? err.message : String(err)}\x1B[39m\n`);
    return;
  }

  output.write(`\n\x1B[1mTesting ${meta?.name ?? providerId}...\x1B[22m\n`);

  // Step 1: DNS / Connection
  output.write(`  \x1B[90mVerifying API endpoint...\x1B[39m `);
  const connResult = await provider.testConnection();
  if (connResult.ok) {
    output.write(`\x1B[32m✓\x1B[39m \x1B[90m(${connResult.latencyMs}ms)\x1B[39m\n`);
  } else {
    output.write(`\x1B[31m✘\x1B[39m\n`);
    output.write(`    \x1B[31m${connResult.error}\x1B[39m\n`);
    return;
  }

  // Step 2: Capability detection
  output.write(`  \x1B[90mDetecting capabilities...\x1B[39m `);
  const caps = await provider.detectCapabilities();
  output.write(`\x1B[32m✓\x1B[39m\n`);
  output.write(`    \x1B[90mChat:\x1B[39m ${caps.chatCompletions ? '\x1B[32m✓\x1B[39m' : '\x1B[31m✘\x1B[39m'}`);
  output.write(` \x1B[90mStreaming:\x1B[39m ${caps.streaming ? '\x1B[32m✓\x1B[39m' : '\x1B[31m✘\x1B[39m'}`);
  output.write(` \x1B[90mTools:\x1B[39m ${caps.toolCalling ? '\x1B[32m✓\x1B[39m' : '\x1B[31m✘\x1B[39m'}`);
  output.write(` \x1B[90mVision:\x1B[39m ${caps.vision ? '\x1B[32m✓\x1B[39m' : '\x1B[90m-\x1B[39m'}`);
  output.write(` \x1B[90mJSON:\x1B[39m ${caps.jsonMode ? '\x1B[32m✓\x1B[39m' : '\x1B[90m-\x1B[39m'}\n`);

  // Step 3: Model discovery
  output.write(`  \x1B[90mDiscovering models...\x1B[39m `);
  const models = await provider.listModels();
  if (models.length > 0) {
    output.write(`\x1B[32m✓\x1B[39m \x1B[90m(${models.length} models found)\x1B[39m\n`);
    const shown = models.slice(0, 5);
    for (const m of shown) {
      output.write(`    \x1B[33m- ${m}\x1B[39m\n`);
    }
    if (models.length > 5) {
      output.write(`    \x1B[90m... and ${models.length - 5} more. Run \`librecode provider models ${providerId}\` to list all.\x1B[39m\n`);
    }
  } else {
    output.write(`\x1B[90mModel discovery not supported by this API.\x1B[39m\n`);
  }

  output.write(`\n\x1B[32m✓ ${meta?.name ?? providerId} is working correctly\x1B[39m\n`);
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
  if (!meta && !entry) {
    return '\x1B[90mNo active provider. Run `librecode provider login` to configure one.\x1B[39m\n';
  }

  const lines: string[] = [];
  const name = meta?.name ?? defaultProvider;
  const model = entry?.defaultModel ?? meta?.defaultModel ?? 'gpt-4o';
  lines.push(`\x1B[36mActive Provider: ${name}\x1B[39m`);
  lines.push(`  \x1B[90mModel: ${model}\x1B[39m`);
  lines.push(`  \x1B[90mEndpoint: ${entry?.endpoint ?? registry.getBaseUrl(defaultProvider) ?? 'https://api.openai.com/v1'}\x1B[39m`);
  if (entry?.apiKey) {
    const masked = entry.apiKey.slice(0, 8) + '…' + entry.apiKey.slice(-4);
    lines.push(`  \x1B[90mKey: ${masked}\x1B[39m`);
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
    const meta = registry.get(providerId);
    const envKey = registry.getEnvKey(providerId);
    if (process.env[envKey]) {
      config.providers[providerId] = {
        enabled: true,
        defaultModel: meta?.defaultModel,
      };
      configManager.setDefaultProvider(providerId);
      output.write(`\x1B[32m✓ Switched to ${meta?.name ?? providerId} (using ${envKey} from environment).\x1B[39m\n`);
      return true;
    }
    output.write(`\x1B[33mProvider '${providerId}' is not configured.\x1B[39m\n`);
    output.write(`\x1B[90m  Run \x1B[33mlibrecode provider login${providerId ? ` ${providerId}` : ''}\x1B[39m \x1B[90mto configure, or\x1B[39m\n`);
    output.write(`\x1B[90m  set the \x1B[33m${envKey}\x1B[39m \x1B[90menvironment variable.\x1B[39m\n`);
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
  const builtin = registry.getBuiltin(providerId);

  if (!meta && !builtin) {
    output.write(`\x1B[31mUnknown provider: '${providerId}'.\x1B[39m\n`);
    return;
  }

  const config = configManager.load();
  const entry = config.providers[providerId];
  const apiKey = entry?.apiKey ?? (builtin?.envKey ? process.env[builtin.envKey] : undefined);
  const baseUrl = entry?.endpoint ?? registry.getBaseUrl(providerId) ?? 'https://api.openai.com/v1';

  const factory = new ProviderFactory(registry);
  let provider: OpenAICompatibleProvider;

  try {
    provider = factory.create(providerId, {
      enabled: true,
      apiKey,
      endpoint: baseUrl,
      defaultModel: entry?.defaultModel ?? meta?.defaultModel,
    }) as OpenAICompatibleProvider;
  } catch (err) {
    output.write(`\x1B[31m✘ Failed to create provider: ${err instanceof Error ? err.message : String(err)}\x1B[39m\n`);
    return;
  }

  output.write(`\x1B[1m${meta?.name ?? providerId} Models\x1B[22m\n`);
  output.write(`\x1B[90mEndpoint: ${baseUrl}\x1B[39m\n\n`);

  output.write(`  \x1B[90mFetching models...\x1B[39m `);
  const models = await provider.listModels();

  if (models.length === 0) {
    output.write(`\x1B[33mModel discovery not available.\x1B[39m\n`);
    output.write(`\n  \x1B[90mDefault model: ${entry?.defaultModel ?? meta?.defaultModel ?? 'gpt-4o'}\x1B[39m\n`);
    output.write(`  \x1B[90mSee: \x1B[4m${meta?.docsUrl ?? builtin?.docsUrl ?? ''}\x1B[24m\x1B[39m\n`);
  } else {
    output.write(`\x1B[32m✓ ${models.length} models available\x1B[39m\n\n`);
    for (const model of models.slice(0, 30)) {
      output.write(`  \x1B[33m- ${model}\x1B[39m\n`);
    }
    if (models.length > 30) {
      output.write(`  \x1B[90m... and ${models.length - 30} more\x1B[39m\n`);
    }
  }

  output.write('\n');
}
