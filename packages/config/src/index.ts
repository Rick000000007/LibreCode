import {
  type AgentConfig,
  createDefaultAgentConfig,
  type ProviderConfig,
  createDefaultProviderConfig,
} from '@rcode/types';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface CliOptions {
  prompt?: string;
  provider?: string;
  model?: string;
  dir?: string;
  maxTurns?: number;
  verbose?: boolean;
  config?: string;
  yes?: boolean;
}

interface RawSection {
  [key: string]: unknown;
}

interface RawConfig {
  [key: string]: unknown;
}

function parseTomlLike(text: string): RawConfig {
  const result: RawConfig = {};
  let currentSectionPath: string[] = [];

  const lines = text.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1] ?? '';
      currentSectionPath = sectionName.split('.');
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const rawValue: string = line.slice(eqIdx + 1).trim();

    let value: unknown = rawValue;

    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      value = rawValue.slice(1, -1);
    } else if (rawValue === 'true') {
      value = true;
    } else if (rawValue === 'false') {
      value = false;
    } else {
      const num = Number(rawValue);
      if (!isNaN(num)) {
        value = num;
      }
    }

    if (currentSectionPath.length === 1) {
      const sectionKey = currentSectionPath[0]!;
      const section = (result[sectionKey] as RawSection) ?? {};
      section[key] = value;
      result[sectionKey] = section;
    } else if (currentSectionPath.length === 2) {
      const topKey = currentSectionPath[0]!;
      const subKey = currentSectionPath[1]!;
      const topSection = (result[topKey] as Record<string, RawSection>) ?? {};
      const subSection = topSection[subKey] ?? {};
      subSection[key] = value;
      topSection[subKey] = subSection;
      result[topKey] = topSection;
    } else {
      result[key] = value;
    }
  }

  return result;
}

function parseProviderConfig(raw: RawSection): Partial<ProviderConfig> {
  return {
    apiKey: raw['api_key'] as string | undefined,
    baseUrl: raw['base_url'] as string | undefined,
    defaultModel: (raw['default_model'] as string) ?? 'gpt-4o',
    maxTokens: raw['max_tokens'] as number | undefined,
    temperature: raw['temperature'] as number | undefined,
  };
}

function parseConfigValue(parsed: RawConfig): Partial<AgentConfig> {
  const config: Partial<AgentConfig> = {};

  if (typeof parsed['provider'] === 'string') config.provider = parsed['provider'] as string;
  if (typeof parsed['model'] === 'string') config.model = parsed['model'] as string;
  if (typeof parsed['max_turns'] === 'number') config.maxTurns = parsed['max_turns'] as number;
  if (typeof parsed['max_context_tokens'] === 'number')
    config.maxContextTokens = parsed['max_context_tokens'] as number;
  if (typeof parsed['compact_threshold'] === 'number')
    config.compactThreshold = parsed['compact_threshold'] as number;

  const rawProviders = parsed['providers'] as Record<string, RawSection> | undefined;
  if (rawProviders) {
    config.providers = {};
    for (const [name, pRaw] of Object.entries(rawProviders)) {
      config.providers[name] = {
        ...createDefaultProviderConfig(),
        ...parseProviderConfig(pRaw),
      };
    }
  }

  return config;
}

export function findConfigPath(cliConfig?: string): string | null {
  if (cliConfig) {
    return fs.existsSync(cliConfig) ? cliConfig : null;
  }
  const homeConfig = path.join(os.homedir(), '.config', 'rcode', 'config.toml');
  if (fs.existsSync(homeConfig)) return homeConfig;
  return null;
}

export function loadConfig(cli?: CliOptions): AgentConfig {
  const config = createDefaultAgentConfig();

  const configPath = findConfigPath(cli?.config);
  if (configPath) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = parseTomlLike(content);
      const parsedConfig = parseConfigValue(parsed);
      Object.assign(config, parsedConfig);
    } catch {
      // ignore parse errors, use defaults
    }
  }

  if (cli?.provider) {
    config.provider = cli.provider;
  }

  if (cli?.model) {
    config.model = cli.model;
  }

  if (cli?.maxTurns !== undefined) {
    config.maxTurns = cli.maxTurns;
  }

  const providerConfig =
    config.providers[config.provider] ?? createDefaultProviderConfig();
  config.providers[config.provider] = providerConfig;

  if (!providerConfig.apiKey) {
    const envKey = getEnvForProvider(config.provider);
    if (envKey) {
      providerConfig.apiKey = envKey;
    }
  }

  if (!cli?.model && providerConfig.defaultModel !== 'gpt-4o') {
    config.model = providerConfig.defaultModel;
  }

  return config;
}

function getEnvForProvider(provider: string): string | undefined {
  switch (provider) {
    case 'openai':
      return process.env['OPENAI_API_KEY'];
    case 'anthropic':
      return process.env['ANTHROPIC_API_KEY'];
    case 'openrouter':
      return process.env['OPENROUTER_API_KEY'];
    default:
      return undefined;
  }
}

export function resolveWorkingDir(cli?: CliOptions): string {
  if (cli?.dir) {
    return path.resolve(cli.dir);
  }
  return process.cwd();
}
