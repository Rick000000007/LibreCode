import type { ProviderPlugin, ProviderAdapter } from './types.js';

export interface PluginConfig {
  id: string;
  name: string;
  version: string;
  createAdapter(config: Record<string, unknown>): ProviderAdapter;
  validateConfig?(config: Record<string, unknown>): { valid: boolean; errors?: string[] };
  getCapabilities?(): string[];
}

export function createProviderPlugin(config: PluginConfig): ProviderPlugin {
  return {
    id: config.id,
    name: config.name,
    version: config.version,
    createAdapter: config.createAdapter,
    validateConfig: config.validateConfig ?? (() => ({ valid: true })),
    getCapabilities: config.getCapabilities ?? (() => ['chat']),
  };
}
