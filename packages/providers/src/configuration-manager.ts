import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { LibreConfig, ProviderEntry } from 'librecode-types';

const CONFIG_DIR = '.config/librecode';
const CONFIG_FILE = 'config.json';

export class ConfigurationManager {
  private configPath: string;

  constructor(configDir?: string) {
    const base = configDir ?? path.join(os.homedir(), CONFIG_DIR);
    this.configPath = path.join(base, CONFIG_FILE);
  }

  configFilePath(): string {
    return this.configPath;
  }

  isConfigured(): boolean {
    return fs.existsSync(this.configPath);
  }

  load(): LibreConfig {
    if (!this.isConfigured()) {
      return this.defaults();
    }
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<LibreConfig>;
      return {
        defaultProvider: parsed.defaultProvider ?? 'free',
        providers: parsed.providers ?? {},
      };
    } catch {
      return this.defaults();
    }
  }

  save(config: LibreConfig): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }

  getProvider(name: string): ProviderEntry | undefined {
    return this.load().providers[name];
  }

  setProvider(name: string, entry: ProviderEntry): void {
    const config = this.load();
    config.providers[name] = entry;
    this.save(config);
  }

  removeProvider(name: string): void {
    const config = this.load();
    delete config.providers[name];
    this.save(config);
  }

  setDefaultProvider(name: string): void {
    const config = this.load();
    config.defaultProvider = name;
    this.save(config);
  }

  enabledProviders(): string[] {
    const config = this.load();
    return Object.entries(config.providers)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);
  }

  private defaults(): LibreConfig {
    return {
      defaultProvider: 'free',
      providers: {},
    };
  }
}
