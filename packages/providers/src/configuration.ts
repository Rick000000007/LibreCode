import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { LibreConfig } from 'librecode-types';

const CONFIG_DIR = '.config/librecode';
const CONFIG_FILE = 'config.json';

export interface EnrichedConfig extends LibreConfig {
  defaultModel?: string;
  routing?: {
    intent?: string;
    preferFree?: boolean;
    preferLocal?: boolean;
  };
  healthCheck?: {
    intervalMs?: number;
    enabled?: boolean;
  };
}

export class LayeredConfig {
  private configs: EnrichedConfig[] = [];
  private merged: EnrichedConfig | null = null;

  constructor() {
    this.loadAll();
  }

  private loadAll(): void {
    // Priority order (high to low): CLI > Env > Project > Global > Default
    const projectConfig = this.loadFile(this.findProjectConfig());
    const globalConfig = this.loadFile(this.globalConfigPath());

    this.configs = [];
    if (globalConfig) this.configs.push(globalConfig);
    if (projectConfig) this.configs.push(projectConfig);

    const envConfig = this.fromEnv();
    if (envConfig) this.configs.push(envConfig);
  }

  private fromEnv(): EnrichedConfig | null {
    const providers: LibreConfig['providers'] = {};

    const OPENAI_KEY = process.env['OPENAI_API_KEY'];
    if (OPENAI_KEY) {
      providers['openai'] = { enabled: true, apiKey: OPENAI_KEY, defaultModel: 'gpt-4o' };
    }

    const ANTHROPIC_KEY = process.env['ANTHROPIC_API_KEY'];
    if (ANTHROPIC_KEY) {
      providers['anthropic'] = { enabled: true, apiKey: ANTHROPIC_KEY, defaultModel: 'claude-sonnet-4-20250514' };
    }

    const GEMINI_KEY = process.env['GEMINI_API_KEY'];
    if (GEMINI_KEY) {
      providers['gemini'] = { enabled: true, apiKey: GEMINI_KEY, defaultModel: 'gemini-2.0-flash' };
    }

    const GROQ_KEY = process.env['GROQ_API_KEY'];
    if (GROQ_KEY) {
      providers['groq'] = { enabled: true, apiKey: GROQ_KEY, defaultModel: 'llama-3.3-70b-versatile' };
    }

    const OPENROUTER_KEY = process.env['OPENROUTER_API_KEY'];
    if (OPENROUTER_KEY) {
      providers['openrouter'] = { enabled: true, apiKey: OPENROUTER_KEY, defaultModel: 'google/gemini-2.0-flash:free' };
    }

    const TOGETHER_KEY = process.env['TOGETHER_API_KEY'];
    if (TOGETHER_KEY) {
      providers['together'] = { enabled: true, apiKey: TOGETHER_KEY, defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' };
    }

    const NVIDIA_KEY = process.env['NVIDIA_API_KEY'];
    if (NVIDIA_KEY) {
      providers['nvidia'] = { enabled: true, apiKey: NVIDIA_KEY, defaultModel: 'meta/llama-3.1-8b-instruct' };
    }

    const defaultModel = process.env['LIBRECODE_DEFAULT_MODEL'];
    if (!defaultModel && Object.keys(providers).length === 0) {
      return null;
    }

    return {
      defaultProvider: 'free',
      defaultModel: defaultModel ?? 'best-free',
      providers,
    };
  }

  private findProjectConfig(): string | null {
    const candidates = [
      path.join(process.cwd(), '.rcode', 'config.json'),
      path.join(process.cwd(), '.rcode.json'),
      path.join(process.cwd(), '.librecode.json'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  private globalConfigPath(): string {
    return path.join(os.homedir(), CONFIG_DIR, CONFIG_FILE);
  }

  private loadFile(filePath: string | null): EnrichedConfig | null {
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as EnrichedConfig;
    } catch {
      return null;
    }
  }

  private defaults(): EnrichedConfig {
    return {
      defaultProvider: 'free',
      defaultModel: 'best-free',
      providers: {},
      routing: {
        intent: 'auto',
        preferFree: true,
        preferLocal: false,
      },
      healthCheck: {
        intervalMs: 60_000,
        enabled: true,
      },
    };
  }

  merge(cliOverrides?: Partial<EnrichedConfig>): EnrichedConfig {
    const base: EnrichedConfig = { ...this.defaults() };

    for (const cfg of this.configs) {
      this.deepMerge(base, cfg);
    }

    if (cliOverrides) {
      this.deepMerge(base, cliOverrides as object);
    }

    this.merged = base;
    return base;
  }

  private deepMerge(target: object, source: object): void {
    const t = target as Record<string, unknown>;
    const s = source as Record<string, unknown>;
    for (const key of Object.keys(s)) {
      const val = s[key];
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        t[key] = t[key] ?? {};
        this.deepMerge(t[key] as object, val as object);
      } else if (val !== undefined) {
        t[key] = val;
      }
    }
  }

  getConfig(): EnrichedConfig {
    if (!this.merged) {
      return this.merge();
    }
    return this.merged;
  }

  async saveGlobal(config: EnrichedConfig): Promise<void> {
    const dir = path.dirname(this.globalConfigPath());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const toSave: LibreConfig = {
      defaultProvider: config.defaultProvider ?? 'free',
      providers: config.providers ?? {},
    };
    fs.writeFileSync(this.globalConfigPath(), JSON.stringify(toSave, null, 2), 'utf-8');
  }

  isFirstRun(): boolean {
    return !fs.existsSync(this.globalConfigPath());
  }
}
