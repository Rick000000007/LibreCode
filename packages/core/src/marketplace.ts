import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  entry: string;
  dependencies?: string[];
  permissions?: string[];
  category?: string;
  icon?: string;
  repository?: string;
  license?: string;
}

export interface PluginPackage {
  manifest: PluginManifest;
  enabled: boolean;
  installedAt: Date;
  updatedAt: Date;
  size: number;
  integrity: string;
}

export interface MarketplaceListing {
  manifest: PluginManifest;
  downloads: number;
  rating: number;
  reviews: number;
  updatedAt: Date;
  verified: boolean;
}

export class PluginMarketplace {
  private plugins = new Map<string, PluginPackage>();
  private events = new EventEmitter();
  private listings: MarketplaceListing[] = [];
  private sandboxEnabled = true;

  install(manifest: PluginManifest, code: string): PluginPackage {
    this.validateManifest(manifest);

    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} already installed`);
    }

    if (this.sandboxEnabled) {
      this.validatePermissions(manifest);
    }

    const pkg: PluginPackage = {
      manifest,
      enabled: true,
      installedAt: new Date(),
      updatedAt: new Date(),
      size: code.length,
      integrity: this.hash(code),
    };

    this.plugins.set(manifest.id, pkg);
    this.events.emit('plugin:installed', pkg);
    return pkg;
  }

  uninstall(id: string): boolean {
    const pkg = this.plugins.get(id);
    if (!pkg) return false;
    this.plugins.delete(id);
    this.events.emit('plugin:uninstalled', id);
    return true;
  }

  enable(id: string): boolean {
    const pkg = this.plugins.get(id);
    if (!pkg) return false;
    pkg.enabled = true;
    this.events.emit('plugin:enabled', id);
    return true;
  }

  disable(id: string): boolean {
    const pkg = this.plugins.get(id);
    if (!pkg) return false;
    pkg.enabled = false;
    this.events.emit('plugin:disabled', id);
    return true;
  }

  getPlugin(id: string): PluginPackage | undefined {
    return this.plugins.get(id);
  }

  listPlugins(filter?: { enabled?: boolean; category?: string }): PluginPackage[] {
    let result = Array.from(this.plugins.values());
    if (filter?.enabled !== undefined) result = result.filter(p => p.enabled === filter.enabled);
    if (filter?.category) result = result.filter(p => p.manifest.category === filter.category);
    return result;
  }

  async fetchListings(url?: string): Promise<MarketplaceListing[]> {
    if (url) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (response.ok) {
          this.listings = await response.json() as MarketplaceListing[];
        }
      } catch { /* fallback to defaults */ }
    }
    return this.listings;
  }

  getListings(): MarketplaceListing[] {
    return [...this.listings];
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.events.on(event, handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.events.off(event, handler);
  }

  setSandbox(enabled: boolean): void {
    this.sandboxEnabled = enabled;
  }

  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id || !manifest.name || !manifest.version || !manifest.entry) {
      throw new Error('Invalid plugin manifest: missing required fields');
    }
    if (!/^[a-z0-9_-]+$/.test(manifest.id)) {
      throw new Error('Plugin ID must only contain lowercase alphanumeric characters, hyphens, and underscores');
    }
    if (manifest.id.length > 64) {
      throw new Error('Plugin ID must be 64 characters or fewer');
    }
  }

  private validatePermissions(manifest: PluginManifest): void {
    const allowed = new Set(['read:files', 'write:files', 'read:config', 'write:config', 'network', 'exec']);
    for (const perm of manifest.permissions ?? []) {
      if (!allowed.has(perm)) {
        throw new Error(`Plugin ${manifest.id} requires unknown permission: ${perm}`);
      }
    }
  }

  private hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
