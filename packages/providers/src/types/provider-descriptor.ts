export type ProviderCategory =
  | 'core-ai'
  | 'inference-platform'
  | 'local-server'
  | 'cloud-provider';

export type Capability =
  | 'chat'
  | 'embeddings'
  | 'vision'
  | 'image-generation'
  | 'audio'
  | 'streaming'
  | 'tools'
  | 'structured-output'
  | 'function-calling'
  | 'fine-tuning';

export type Protocol = 'openai-chat' | 'anthropic-messages' | 'google-gemini' | 'native';

export type AuthType =
  | { type: 'bearer'; envVar?: string }
  | { type: 'header'; headerName: string; envVar?: string }
  | { type: 'oauth'; authUrl: string; tokenUrl: string; scopes?: string[] }
  | { type: 'aws-sigv4'; service: string; region: string }
  | { type: 'none' };

export interface ProviderDescriptor {
  id: string;
  name: string;
  category: ProviderCategory;
  protocols: Protocol[];
  baseUrl: string;
  defaultModel: string;
  capabilities: Capability[];
  authType: AuthType;
  adapterType: 'openai-compatible' | 'custom' | 'plugin';
  adapterModule?: string;
  website?: string;
  docsUrl?: string;
  pricingUrl?: string;
  isFree: boolean;
  isSelfHostable: boolean;
  isOpenSource: boolean;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
  organization?: string;
  [key: string]: unknown;
}
