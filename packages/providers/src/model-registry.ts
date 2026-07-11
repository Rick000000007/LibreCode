import { ModelMetadata, KNOWN_MODELS, getKnownModel, scoreForIntent, RoutingIntent } from './model-metadata.js';
import type { LLMProvider } from './base.js';
import type { ModelInfo } from 'librecode-types';

export interface ModelRegistration {
  modelId: string;
  providerId: string;
  metadata: ModelMetadata;
  source: 'curated' | 'discovered';
}

export type RegistryChangeCallback = (models: ModelRegistration[]) => void;

export class ModelRegistry {
  private models: Map<string, ModelRegistration> = new Map();
  private providerModels: Map<string, Set<string>> = new Map();
  private changeCallbacks: RegistryChangeCallback[] = [];
  private discoveryInterval: ReturnType<typeof setInterval> | null = null;
  private discoveredMetadata: Map<string, Partial<ModelMetadata>> = new Map();

  constructor() {
    this.loadKnown();
  }

  private loadKnown(): void {
    for (const meta of KNOWN_MODELS) {
      const key = `${meta.provider}/${meta.id}`;
      this.models.set(key, {
        modelId: meta.id,
        providerId: meta.provider,
        metadata: { ...meta },
        source: 'curated',
      });
      this.addToProviderIndex(meta.provider, key);
    }
  }

  private addToProviderIndex(provider: string, key: string): void {
    if (!this.providerModels.has(provider)) {
      this.providerModels.set(provider, new Set());
    }
    this.providerModels.get(provider)!.add(key);
  }

  registerDiscovered(providerId: string, modelInfo: ModelInfo): void {
    const key = `${providerId}/${modelInfo.id}`;
    const existing = getKnownModel(modelInfo.id);

    const metadata: ModelMetadata = existing
      ? { ...existing, discovered: true }
      : {
          id: modelInfo.id,
          provider: providerId,
          family: modelInfo.id.split(/[-/]/)[0] ?? modelInfo.id,
          displayName: modelInfo.name || modelInfo.id,
          description: `Discovered from ${providerId}`,
          contextWindow: modelInfo.contextWindow || 8_192,
          maxOutput: 4_096,
          pricing: { free: modelInfo.isFree ?? false },
          capabilities: {
            toolCalling: modelInfo.supportsToolCalling ?? true,
            vision: false,
            streaming: modelInfo.supportsStreaming ?? true,
            reasoning: false,
            thinking: false,
            jsonMode: false,
            functionCalling: modelInfo.supportsToolCalling ?? true,
            parallelToolCalls: false,
          },
          scores: {
            coding: 50, reasoning: 50, speed: 70, reliability: 60, creativity: 45, context: 40, overall: 52,
          },
          aliases: [],
          discovered: true,
        };

    const existingReg = this.models.get(key);
    if (existingReg) {
      existingReg.metadata = metadata;
    } else {
      this.models.set(key, { modelId: modelInfo.id, providerId, metadata, source: 'discovered' });
      this.addToProviderIndex(providerId, key);
    }

    this.notifyChange();
  }

  async discoverFromProvider(providerId: string, provider: LLMProvider): Promise<void> {
    try {
      const models = await provider.listModels();
      for (const m of models) {
        this.registerDiscovered(providerId, m);
      }
    } catch {
      // Provider doesn't support discovery — skip
    }
  }

  startPeriodicDiscovery(intervalMs = 300_000): void {
    if (this.discoveryInterval) return;
    this.discoveryInterval = setInterval(() => {
      // Triggered externally via discoverFromProvider calls
    }, intervalMs);
  }

  stopPeriodicDiscovery(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
  }

  getAll(): ModelRegistration[] {
    return Array.from(this.models.values());
  }

  getByProvider(providerId: string): ModelRegistration[] {
    const keys = this.providerModels.get(providerId);
    if (!keys) return [];
    return Array.from(keys)
      .map((k) => this.models.get(k))
      .filter((m): m is ModelRegistration => !!m);
  }

  getModel(id: string, provider?: string): ModelRegistration | undefined {
    if (provider) {
      return this.models.get(`${provider}/${id}`);
    }
    for (const [, reg] of this.models) {
      if (reg.modelId === id) return reg;
    }
    return undefined;
  }

  findBest(intent: RoutingIntent, options?: { freeOnly?: boolean }): ModelRegistration | undefined {
    let candidates = Array.from(this.models.values()).map((r) => r.metadata);

    if (options?.freeOnly) {
      candidates = candidates.filter((m) => m.pricing.free);
    }

    if (candidates.length === 0) return undefined;

    candidates.sort((a, b) => scoreForIntent(b, intent) - scoreForIntent(a, intent));
    const best = candidates[0]!;
    return this.getModel(best.id, best.provider);
  }

  findModels(filter: {
    provider?: string;
    family?: string;
    freeOnly?: boolean;
    intent?: RoutingIntent;
    limit?: number;
  }): ModelRegistration[] {
    let candidates = Array.from(this.models.values());

    if (filter.provider) {
      candidates = candidates.filter((r) => r.providerId === filter.provider);
    }

    if (filter.family) {
      candidates = candidates.filter((r) => r.metadata.family === filter.family);
    }

    if (filter.freeOnly) {
      candidates = candidates.filter((r) => r.metadata.pricing.free);
    }

    if (filter.intent) {
      candidates.sort((a, b) => scoreForIntent(b.metadata, filter.intent!) - scoreForIntent(a.metadata, filter.intent!));
    }

    if (filter.limit && filter.limit > 0) {
      candidates = candidates.slice(0, filter.limit);
    }

    return candidates;
  }

  onChange(callback: RegistryChangeCallback): void {
    this.changeCallbacks.push(callback);
  }

  private notifyChange(): void {
    const all = this.getAll();
    for (const cb of this.changeCallbacks) {
      try {
        cb(all);
      } catch {
        // Don't let a bad callback break the chain
      }
    }
  }

  size(): number {
    return this.models.size;
  }
}
