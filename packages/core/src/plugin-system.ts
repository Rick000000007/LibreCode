import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  entry: string;
  dependencies?: Record<string, string>;
  requires?: string[];
  capabilities?: string[];
}

export interface PluginAPI {
  manifest: PluginManifest;
  hooks: PluginHooks;
}

export interface PluginHooks {
  onAgentInit?: (agent: any) => void | Promise<void>;
  onProviderInit?: (provider: any) => void | Promise<void>;
  onToolRegister?: (tools: any) => void | Promise<void>;
  onPromptBuild?: (prompt: string, options: any) => string | Promise<string>;
  onPlanCreate?: (goal: string, plan: any) => void | Promise<void>;
  onPlanExecute?: (task: any) => void | Promise<void>;
  onToolBefore?: (toolName: string, args: any) => any | Promise<any>;
  onToolAfter?: (toolName: string, args: any, result: any) => void | Promise<void>;
  onUIInit?: (ui: any) => void | Promise<void>;
  onEvent?: (event: any) => void | Promise<void>;
}

export interface PluginOptions {
  pluginsDir?: string;
  enabledPlugins?: string[];
  disabledPlugins?: string[];
}

interface LoadedPlugin {
  api: PluginAPI;
  enabled: boolean;
  loadTime: number;
}

export class PluginSystem {
  private loaded: Map<string, LoadedPlugin> = new Map();
  private options: Required<PluginOptions>;

  constructor(options?: PluginOptions) {
    this.options = {
      pluginsDir: '',
      enabledPlugins: [],
      disabledPlugins: [],
      ...options,
    };
  }

  async discover(dir?: string): Promise<PluginManifest[]> {
    const scanDir = dir ?? this.options.pluginsDir;
    if (!scanDir || !fs.existsSync(scanDir)) return [];

    const manifests: PluginManifest[] = [];
    const entries = fs.readdirSync(scanDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(scanDir, entry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(raw) as PluginManifest;
        manifest.id = manifest.id ?? entry.name;
        manifests.push(manifest);
      } catch {
        continue;
      }
    }

    return manifests;
  }

  async load(manifest: PluginManifest): Promise<boolean> {
    if (this.loaded.has(manifest.id)) {
      return false;
    }

    const deps = manifest.dependencies ?? {};
    for (const [depId, depVersion] of Object.entries(deps)) {
      const dep = this.loaded.get(depId);
      if (!dep) {
        console.error(`Plugin "${manifest.id}" missing dependency: ${depId}`);
        return false;
      }
      if (depVersion !== '*' && dep.api.manifest.version !== depVersion) {
        console.error(`Plugin "${manifest.id}" requires ${depId}@${depVersion}, got ${dep.api.manifest.version}`);
        return false;
      }
    }

    const entryPath = path.resolve(this.options.pluginsDir, manifest.id, manifest.entry);
    if (!fs.existsSync(entryPath)) {
      console.error(`Plugin entry not found: ${entryPath}`);
      return false;
    }

    try {
      const mod = await import(entryPath);
      const api: PluginAPI = {
        manifest,
        hooks: mod.default?.hooks ?? mod.hooks ?? {},
      };

      const enabled = this.isEnabled(manifest.id);
      const loaded: LoadedPlugin = { api, enabled, loadTime: Date.now() };
      this.loaded.set(manifest.id, loaded);

      return true;
    } catch (err) {
      console.error(`Failed to load plugin "${manifest.id}":`, err);
      return false;
    }
  }

  async loadAll(dir?: string): Promise<number> {
    const manifests = await this.discover(dir);
    let loaded = 0;
    for (const manifest of manifests) {
      if (await this.load(manifest)) {
        loaded++;
      }
    }
    return loaded;
  }

  unload(id: string): boolean {
    return this.loaded.delete(id);
  }

  getPlugin(id: string): PluginAPI | undefined {
    return this.loaded.get(id)?.api;
  }

  getAllPlugins(): PluginAPI[] {
    return Array.from(this.loaded.values())
      .filter(p => p.enabled)
      .map(p => p.api);
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }

  enable(id: string): void {
    const plugin = this.loaded.get(id);
    if (plugin) plugin.enabled = true;
  }

  disable(id: string): void {
    const plugin = this.loaded.get(id);
    if (plugin) plugin.enabled = false;
  }

  async runHook<K extends keyof PluginHooks>(
    hook: K,
    ...args: Parameters<NonNullable<PluginHooks[K]>>
  ): Promise<void> {
    for (const [, loaded] of this.loaded) {
      if (!loaded.enabled) continue;
      const fn = loaded.api.hooks[hook] as any;
      if (fn) {
        await fn(...args);
      }
    }
  }

  async runHookWithReturn<K extends keyof PluginHooks>(
    hook: K,
    initial: any,
    ...extra: any[]
  ): Promise<any> {
    let result = initial;
    for (const [, loaded] of this.loaded) {
      if (!loaded.enabled) continue;
      const fn = loaded.api.hooks[hook] as any;
      if (fn) {
        result = await fn(result, ...extra);
      }
    }
    return result;
  }

  private isEnabled(id: string): boolean {
    if (this.options.disabledPlugins.includes(id)) return false;
    if (this.options.enabledPlugins.length > 0) {
      return this.options.enabledPlugins.includes(id);
    }
    return true;
  }
}

export function createPluginManifest(overrides: Partial<PluginManifest> & { id: string }): PluginManifest {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    version: overrides.version ?? '1.0.0',
    description: overrides.description ?? '',
    author: overrides.author,
    license: overrides.license,
    entry: overrides.entry ?? 'index.js',
    dependencies: overrides.dependencies,
    requires: overrides.requires,
    capabilities: overrides.capabilities,
  };
}
