import { ModelRegistry } from './model-registry.js';
import { HealthMonitor } from './health-monitor.js';
import { scoreForIntent, RoutingIntent, RoutingRequest, RoutingDecision } from './model-metadata.js';

export interface RouterOptions {
  preferFree?: boolean;
  preferLocal?: boolean;
  defaultIntent?: RoutingIntent;
}

export class AutoRouter {
  private registry: ModelRegistry;
  private health: HealthMonitor;
  private options: RouterOptions;

  constructor(registry: ModelRegistry, health: HealthMonitor, options: RouterOptions = {}) {
    this.registry = registry;
    this.health = health;
    this.options = {
      preferFree: true,
      preferLocal: false,
      defaultIntent: 'auto',
      ...options,
    };
  }

  setOptions(opts: Partial<RouterOptions>): void {
    Object.assign(this.options, opts);
  }

  async route(request?: Partial<RoutingRequest>): Promise<RoutingDecision> {
    const intent = request?.intent ?? this.options.defaultIntent ?? 'auto';
    const preferFree = request?.preferFree ?? this.options.preferFree ?? true;
    const preferLocal = request?.preferLocal ?? this.options.preferLocal ?? false;

    const healthSnapshot = this.health.getSnapshot();

    let candidates = this.registry.findModels({ intent, freeOnly: preferFree });

    // If nothing found and preferFree, try without the free filter
    if (candidates.length === 0 && preferFree) {
      candidates = this.registry.findModels({ intent });
    }

    // Filter by health status
    const healthy = candidates.filter((c) => {
      const h = healthSnapshot.get(c.providerId);
      if (!h) return true;
      return h.status === 'healthy' || h.status === 'unknown';
    });

    const degraded = candidates.filter((c) => {
      const h = healthSnapshot.get(c.providerId);
      return h?.status === 'degraded';
    });

    // Prefer healthy, fall back to degraded
    const preferred = healthy.length > 0 ? healthy : (degraded.length > 0 ? degraded : candidates);

    if (preferred.length === 0) {
      return {
        model: this.registry.findBest('auto')!.metadata,
        provider: 'free',
        confidence: 0,
        alternatives: [],
      };
    }

    // Score each candidate considering health
    const scored = preferred.map((c) => {
      const baseScore = scoreForIntent(c.metadata, intent);
      const health = healthSnapshot.get(c.providerId);
      const healthPenalty = health
        ? health.status === 'healthy' ? 0
          : health.status === 'degraded' ? baseScore * 0.3
          : baseScore * 0.8
        : 0;
      const localBonus = preferLocal && c.metadata.provider === 'ollama' ? 20 : 0;
      return {
        registration: c,
        score: baseScore - healthPenalty + localBonus,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0]!;
    const alternatives = scored.slice(1, 4).map((s) => s.registration.metadata);

    const maxScore = scored.reduce((max, s) => Math.max(max, s.score), 0);

    return {
      model: best.registration.metadata,
      provider: best.registration.providerId,
      confidence: maxScore > 0 ? best.score / maxScore : 0.5,
      alternatives,
    };
  }

  resolveAlias(alias: string): RoutingIntent | null {
    const validIntents: RoutingIntent[] = ['auto', 'coding', 'reasoning', 'fast', 'cheap', 'vision', 'creative', 'best-free', 'local'];
    if (validIntents.includes(alias as RoutingIntent)) {
      return alias as RoutingIntent;
    }
    return null;
  }
}
