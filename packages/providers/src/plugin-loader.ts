import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProviderPlugin } from './types/adapter.js';

const BUILTIN_PLUGINS = new Map<string, string>();

export function registerBuiltinPlugin(id: string, packageName: string): void {
  BUILTIN_PLUGINS.set(id, packageName);
}

export interface PluginDiscoveryResult {
  plugin: ProviderPlugin;
  source: 'builtin' | 'directory' | 'npm';
  error?: string;
}

export class PluginLoader {
  private loaded = new Map<string, ProviderPlugin>();

  async loadFromPackage(packageName: string): Promise<ProviderPlugin> {
    const mod = await this.importModule(packageName);
    const plugin: ProviderPlugin = mod['default'] ?? mod;
    this.validate(plugin);
    this.loaded.set(plugin.id, plugin);
    return plugin;
  }

  async loadFromDirectory(dir: string): Promise<ProviderPlugin[]> {
    const plugins: ProviderPlugin[] = [];
    if (!fs.existsSync(dir)) return plugins;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(dir, entry.name, 'manifest.json');
      const pkgJsonPath = path.join(dir, entry.name, 'package.json');

      let modPath: string | null = null;
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          modPath = manifest.main || 'index.js';
        } catch {
          continue;
        }
      } else if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
          modPath = pkg.main || 'index.js';
        } catch {
          continue;
        }
      }

      if (modPath) {
        try {
          const fullPath = path.join(dir, entry.name, modPath);
          if (fs.existsSync(fullPath)) {
            const modUrl = pathToFileURL(fullPath);
            const mod = await this.importModule(modUrl);
            const plugin: ProviderPlugin = mod['default'] ?? mod;
            this.validate(plugin);
            this.loaded.set(plugin.id, plugin);
            plugins.push(plugin);
          }
        } catch {
          continue;
        }
      }
    }

    return plugins;
  }

  async discoverInstalled(): Promise<PluginDiscoveryResult[]> {
    const results: PluginDiscoveryResult[] = [];

    for (const [id, pkg] of BUILTIN_PLUGINS) {
      try {
        const plugin = await this.loadFromPackage(pkg);
        results.push({ plugin, source: 'builtin' });
      } catch (err) {
        results.push({
          plugin: { id, name: id, version: '0.0.0' } as ProviderPlugin,
          source: 'builtin',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  async discoverNpmPlugins(
    prefix: string = 'librecode-provider-',
  ): Promise<PluginDiscoveryResult[]> {
    const results: PluginDiscoveryResult[] = [];
    const seen = new Set<string>();

    try {
      const packageJson = JSON.parse(
        fs.readFileSync(
          path.resolve(process.cwd(), 'package.json'),
          'utf-8',
        ),
      );

      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
      };

      for (const [depName] of Object.entries(deps)) {
        if (typeof depName !== 'string') continue;
        if (!depName.startsWith(prefix)) continue;

        const pluginId = depName.slice(prefix.length);
        if (seen.has(pluginId)) continue;
        seen.add(pluginId);

        try {
          const plugin = await this.loadFromPackage(depName);
          results.push({ plugin, source: 'npm' });
        } catch (err) {
          results.push({
            plugin: { id: pluginId, name: depName, version: '0.0.0' } as ProviderPlugin,
            source: 'npm',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch {
    }

    return results;
  }

  private async importModule(name: string): Promise<any> {
    return import(name);
  }

  private validate(plugin: ProviderPlugin): void {
    if (!plugin.id) throw new Error('Plugin missing id');
    if (!plugin.createAdapter) throw new Error(`Plugin ${plugin.id} missing createAdapter`);
  }

  unload(pluginId: string): void {
    this.loaded.delete(pluginId);
  }

  getLoaded(): ProviderPlugin[] {
    return Array.from(this.loaded.values());
  }

  get(id: string): ProviderPlugin | undefined {
    return this.loaded.get(id);
  }

  clear(): void {
    this.loaded.clear();
  }
}

function pathToFileURL(p: string): string {
  if (p.startsWith('/')) return 'file://' + p;
  return 'file://' + path.resolve(p);
}
