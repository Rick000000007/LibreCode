export interface ModelCapabilities {
  toolCalling: boolean;
  vision: boolean;
  streaming: boolean;
  reasoning: boolean;
  thinking: boolean;
  jsonMode: boolean;
  functionCalling: boolean;
  parallelToolCalls: boolean;
}

export interface ModelPricing {
  free: boolean;
  inputPerMillion?: number;
  outputPerMillion?: number;
}

export interface ModelScore {
  coding: number;
  reasoning: number;
  speed: number;
  reliability: number;
  creativity: number;
  context: number;
  overall: number;
}

export interface ModelMetadata {
  id: string;
  provider: string;
  family: string;
  displayName: string;
  description: string;
  contextWindow: number;
  maxOutput: number;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  scores: ModelScore;
  aliases: string[];
  discovered: boolean;
  deprecation?: string;
}

export interface ProviderHealth {
  provider: string;
  model: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  errorRate: number;
  uptime: number;
  lastChecked: number;
  lastError?: string;
  consecutiveFailures: number;
  tokenThroughput: number;
}

export type RoutingIntent = 'auto' | 'coding' | 'reasoning' | 'fast' | 'cheap' | 'vision' | 'creative' | 'best-free' | 'local';

export interface RoutingRequest {
  intent: RoutingIntent;
  requiresTools?: boolean;
  requiresVision?: boolean;
  maxTokens?: number;
  preferFree?: boolean;
  preferLocal?: boolean;
}

export interface RoutingDecision {
  model: ModelMetadata;
  provider: string;
  confidence: number;
  alternatives: ModelMetadata[];
}

function computeOverall(scores: Omit<ModelScore, 'overall'>): number {
  return Math.round(
    scores.coding * 0.25 +
    scores.reasoning * 0.20 +
    scores.speed * 0.15 +
    scores.reliability * 0.15 +
    scores.creativity * 0.10 +
    scores.context * 0.15,
  );
}

function defModel(partial: Omit<ModelMetadata, 'scores'> & { scores: Omit<ModelScore, 'overall'> }): ModelMetadata {
  return {
    ...partial,
    scores: { ...partial.scores, overall: computeOverall(partial.scores) },
  };
}

export const KNOWN_MODELS: ModelMetadata[] = [
  // ── OpenAI ──
  defModel({
    id: 'gpt-4o',
    provider: 'openai',
    family: 'gpt',
    displayName: 'GPT-4o',
    description: 'OpenAI flagship multimodal model',
    contextWindow: 128_000,
    maxOutput: 16_384,
    pricing: { free: false, inputPerMillion: 2.50, outputPerMillion: 10.00 },
    capabilities: { toolCalling: true, vision: true, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 92, reasoning: 90, speed: 80, reliability: 95, creativity: 88, context: 85 },
    aliases: ['best', 'coding'],
    discovered: false,
  }),
  defModel({
    id: 'gpt-4o-mini',
    provider: 'openai',
    family: 'gpt',
    displayName: 'GPT-4o Mini',
    description: 'Fast, affordable small model',
    contextWindow: 128_000,
    maxOutput: 16_384,
    pricing: { free: false, inputPerMillion: 0.15, outputPerMillion: 0.60 },
    capabilities: { toolCalling: true, vision: true, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 78, reasoning: 75, speed: 92, reliability: 90, creativity: 70, context: 85 },
    aliases: ['fast', 'cheap'],
    discovered: false,
  }),
  defModel({
    id: 'o3-mini',
    provider: 'openai',
    family: 'o-series',
    displayName: 'o3-mini',
    description: 'OpenAI reasoning model',
    contextWindow: 200_000,
    maxOutput: 100_000,
    pricing: { free: false, inputPerMillion: 1.10, outputPerMillion: 4.40 },
    capabilities: { toolCalling: true, vision: false, streaming: true, reasoning: true, thinking: true, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 95, reasoning: 96, speed: 60, reliability: 90, creativity: 85, context: 90 },
    aliases: ['reasoning'],
    discovered: false,
  }),
  defModel({
    id: 'gpt-4.1',
    provider: 'openai',
    family: 'gpt',
    displayName: 'GPT-4.1',
    description: 'Latest GPT-4 series with 1M context',
    contextWindow: 1_000_000,
    maxOutput: 32_768,
    pricing: { free: false, inputPerMillion: 2.00, outputPerMillion: 8.00 },
    capabilities: { toolCalling: true, vision: true, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 93, reasoning: 91, speed: 78, reliability: 93, creativity: 89, context: 98 },
    aliases: ['coding', 'best'],
    discovered: false,
  }),

  // ── Anthropic ──
  defModel({
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    family: 'claude',
    displayName: 'Claude Sonnet 4',
    description: 'Anthropic balanced model, strong coding',
    contextWindow: 200_000,
    maxOutput: 8_192,
    pricing: { free: false, inputPerMillion: 3.00, outputPerMillion: 15.00 },
    capabilities: { toolCalling: true, vision: true, streaming: true, reasoning: false, thinking: true, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 94, reasoning: 92, speed: 75, reliability: 92, creativity: 90, context: 88 },
    aliases: ['best', 'coding'],
    discovered: false,
  }),
  defModel({
    id: 'claude-haiku-3-5-20241022',
    provider: 'anthropic',
    family: 'claude',
    displayName: 'Claude Haiku 3.5',
    description: 'Fast Anthropic model, affordable',
    contextWindow: 200_000,
    maxOutput: 8_192,
    pricing: { free: false, inputPerMillion: 0.80, outputPerMillion: 4.00 },
    capabilities: { toolCalling: true, vision: true, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 82, reasoning: 80, speed: 93, reliability: 90, creativity: 75, context: 88 },
    aliases: ['fast', 'cheap'],
    discovered: false,
  }),

  // ── Google Gemini ──
  defModel({
    id: 'gemini-2.0-flash',
    provider: 'gemini',
    family: 'gemini',
    displayName: 'Gemini 2.0 Flash',
    description: 'Google fast multimodal model',
    contextWindow: 1_048_576,
    maxOutput: 8_192,
    pricing: { free: true, inputPerMillion: 0.10, outputPerMillion: 0.40 },
    capabilities: { toolCalling: true, vision: true, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 82, reasoning: 78, speed: 90, reliability: 85, creativity: 75, context: 98 },
    aliases: ['best-free', 'fast-free', 'fast', 'cheap'],
    discovered: false,
  }),
  defModel({
    id: 'gemini-2.0-flash-lite',
    provider: 'gemini',
    family: 'gemini',
    displayName: 'Gemini 2.0 Flash Lite',
    description: 'Lightweight Gemini model',
    contextWindow: 1_048_576,
    maxOutput: 8_192,
    pricing: { free: true, inputPerMillion: 0.075, outputPerMillion: 0.30 },
    capabilities: { toolCalling: true, vision: false, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 70, reasoning: 68, speed: 95, reliability: 85, creativity: 60, context: 98 },
    aliases: ['fast-free', 'cheap'],
    discovered: false,
  }),
  defModel({
    id: 'gemini-1.5-flash',
    provider: 'gemini',
    family: 'gemini',
    displayName: 'Gemini 1.5 Flash',
    description: 'Previous-gen fast Gemini',
    contextWindow: 1_048_576,
    maxOutput: 8_192,
    pricing: { free: true, inputPerMillion: 0.075, outputPerMillion: 0.30 },
    capabilities: { toolCalling: true, vision: true, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: false },
    scores: { coding: 65, reasoning: 62, speed: 88, reliability: 80, creativity: 58, context: 98 },
    aliases: ['cheap'],
    discovered: false,
  }),

  // ── Groq ──
  defModel({
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    family: 'llama',
    displayName: 'Llama 3.3 70B',
    description: 'Meta Llama on Groq ultra-fast inference',
    contextWindow: 32_768,
    maxOutput: 8_192,
    pricing: { free: true },
    capabilities: { toolCalling: true, vision: false, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 80, reasoning: 78, speed: 96, reliability: 88, creativity: 72, context: 40 },
    aliases: ['fast-free', 'fast'],
    discovered: false,
  }),
  defModel({
    id: 'llama-3.1-8b-instant',
    provider: 'groq',
    family: 'llama',
    displayName: 'Llama 3.1 8B',
    description: 'Small fast model on Groq',
    contextWindow: 8_192,
    maxOutput: 8_192,
    pricing: { free: true },
    capabilities: { toolCalling: true, vision: false, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 60, reasoning: 55, speed: 98, reliability: 85, creativity: 50, context: 25 },
    aliases: ['fast'],
    discovered: false,
  }),

  // ── OpenRouter (free tier) ──
  defModel({
    id: 'google/gemini-2.0-flash:free',
    provider: 'openrouter',
    family: 'gemini',
    displayName: 'Gemini 2.0 Flash (OpenRouter)',
    description: 'Gemini via OpenRouter free tier',
    contextWindow: 1_048_576,
    maxOutput: 8_192,
    pricing: { free: true },
    capabilities: { toolCalling: true, vision: true, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 82, reasoning: 78, speed: 85, reliability: 80, creativity: 75, context: 98 },
    aliases: ['best-free'],
    discovered: false,
  }),
  defModel({
    id: 'meta-llama/llama-3.2-3b-instruct:free',
    provider: 'openrouter',
    family: 'llama',
    displayName: 'Llama 3.2 3B (OpenRouter)',
    description: 'Small free model via OpenRouter',
    contextWindow: 8_192,
    maxOutput: 8_192,
    pricing: { free: true },
    capabilities: { toolCalling: false, vision: false, streaming: true, reasoning: false, thinking: false, jsonMode: false, functionCalling: false, parallelToolCalls: false },
    scores: { coding: 35, reasoning: 30, speed: 95, reliability: 75, creativity: 25, context: 20 },
    aliases: ['small-free'],
    discovered: false,
  }),

  // ── Ollama (local) ──
  defModel({
    id: 'llama3.2',
    provider: 'ollama',
    family: 'llama',
    displayName: 'Llama 3.2 (Ollama)',
    description: 'Local Llama 3.2 via Ollama',
    contextWindow: 8_192,
    maxOutput: 4_096,
    pricing: { free: true },
    capabilities: { toolCalling: true, vision: false, streaming: true, reasoning: false, thinking: false, jsonMode: false, functionCalling: true, parallelToolCalls: false },
    scores: { coding: 55, reasoning: 50, speed: 70, reliability: 70, creativity: 45, context: 25 },
    aliases: ['local', 'small-free'],
    discovered: false,
  }),
  defModel({
    id: 'codellama',
    provider: 'ollama',
    family: 'codellama',
    displayName: 'CodeLlama (Ollama)',
    description: 'Code-focused local model via Ollama',
    contextWindow: 16_384,
    maxOutput: 4_096,
    pricing: { free: true },
    capabilities: { toolCalling: true, vision: false, streaming: true, reasoning: false, thinking: false, jsonMode: false, functionCalling: true, parallelToolCalls: false },
    scores: { coding: 60, reasoning: 45, speed: 65, reliability: 70, creativity: 35, context: 30 },
    aliases: ['code-free', 'local'],
    discovered: false,
  }),

  // ── Together AI ──
  defModel({
    id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    provider: 'together',
    family: 'llama',
    displayName: 'Llama 3.3 70B (Together)',
    description: 'Llama 3.3 70B on Together AI',
    contextWindow: 32_768,
    maxOutput: 8_192,
    pricing: { free: true, inputPerMillion: 0.59, outputPerMillion: 0.59 },
    capabilities: { toolCalling: true, vision: false, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 78, reasoning: 76, speed: 75, reliability: 80, creativity: 70, context: 40 },
    aliases: [],
    discovered: false,
  }),

  // ─── NVIDIA ──
  defModel({
    id: 'meta/llama-3.1-8b-instruct',
    provider: 'nvidia',
    family: 'llama',
    displayName: 'Llama 3.1 8B (NVIDIA)',
    description: 'Llama on NVIDIA NIM free tier',
    contextWindow: 8_192,
    maxOutput: 4_096,
    pricing: { free: true },
    capabilities: { toolCalling: true, vision: false, streaming: true, reasoning: false, thinking: false, jsonMode: true, functionCalling: true, parallelToolCalls: true },
    scores: { coding: 60, reasoning: 55, speed: 70, reliability: 75, creativity: 50, context: 25 },
    aliases: [],
    discovered: false,
  }),
];

export function getKnownModel(id: string): ModelMetadata | undefined {
  return KNOWN_MODELS.find((m) => m.id === id);
}

export function findModels(filter: Partial<ModelMetadata & { freeOnly?: boolean }>): ModelMetadata[] {
  return KNOWN_MODELS.filter((m) => {
    if (filter.freeOnly && !m.pricing.free) return false;
    if (filter.provider && m.provider !== filter.provider) return false;
    if (filter.family && m.family !== filter.family) return false;
    if (filter.id && m.id !== filter.id) return false;
    if (filter.aliases) {
      const aliasList = Array.isArray(filter.aliases) ? filter.aliases : [filter.aliases];
      if (!aliasList.some((a) => m.aliases.includes(a))) return false;
    }
    return true;
  });
}

export function scoreForIntent(model: ModelMetadata, intent: RoutingIntent): number {
  switch (intent) {
    case 'coding':
      return model.scores.coding;
    case 'reasoning':
      return model.scores.reasoning;
    case 'fast':
      return model.scores.speed;
    case 'creative':
      return model.scores.creativity;
    case 'cheap':
      return model.scores.speed + (model.pricing.free ? 100 : 0);
    case 'vision':
      return model.capabilities.vision ? model.scores.overall : 0;
    case 'best-free':
      return model.pricing.free ? model.scores.overall : 0;
    case 'local':
      return model.provider === 'ollama' ? model.scores.overall : 0;
    case 'auto':
    default:
      return model.scores.overall;
  }
}

export function isModelAlias(value: string): boolean {
  const validAliases: RoutingIntent[] = ['auto', 'coding', 'reasoning', 'fast', 'cheap', 'vision', 'creative', 'best-free', 'local'];
  return validAliases.includes(value as RoutingIntent);
}
