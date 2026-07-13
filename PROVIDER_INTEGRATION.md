# Provider Integration Guide

This guide explains how to add a new AI provider to LibreCode and how to specify its capabilities. The CLI features adapt automatically based on these capabilities.

## 1. Provider Capability Matrix

This matrix serves as the source of truth for the Provider Registry. Below is the list of currently supported providers and their verified capabilities:

| Provider | Local | API Key | OAuth | Device Flow | Model Discovery | Streaming | Tool Calling | Embeddings |
|----------|-------|---------|-------|-------------|-----------------|-----------|--------------|------------|
| Free | No | No | No | No | Auto | Yes | Yes | No |
| OpenAI | No | Yes | No | No | Yes | Yes | Yes | Yes |
| Anthropic| No | Yes | No | No | No | Yes | Yes | No |
| Gemini | No | Yes | No | No | Yes | Yes | Yes | No |
| Ollama | Yes | No | No | No | Yes | Yes | Yes | Yes |
| OpenRouter| No | Yes | No | No | Yes | Yes | Yes | No |
| NVIDIA | No | Yes | No | No | Yes | Yes | Yes | No |
| Groq | No | Yes | No | No | Yes | Yes | Yes | No |
| Together | No | Yes | No | No | Yes | Yes | Yes | No |
| XAI | No | Yes | No | No | Yes | Yes | Yes | No |
| Mistral | No | Yes | No | No | Yes | Yes | Yes | No |
| Cohere | No | Yes | No | No | Yes | Yes | Yes | Yes |
| DeepSeek | No | Yes | No | No | Yes | Yes | Yes | No |

*Note: At this time, no built-in LibreCode provider natively supports OAuth (`browserLogin`) or Device Flow (`deviceFlow`) within the CLI interface. All remote providers use standard API key authentication. Do NOT simulate browser or device flows if the underlying provider module lacks actual OAuth clients.*

## 2. Define the Built-in Provider

In `packages/providers/src/provider-registry.ts`, add your new provider to the `BUILTIN_PROVIDERS` array.

```typescript
{
  id: 'myprovider',
  name: 'My Provider',
  description: 'Description of the provider',
  baseUrl: 'https://api.myprovider.com/v1',
  requiresApiKey: true,
  hasFreeTier: false,
  website: 'https://myprovider.com',
  defaultModel: 'my-model-1',
  supportsStreaming: true,
  supportsToolCalling: true,
  docsUrl: 'https://docs.myprovider.com',
  envKey: 'MYPROVIDER_API_KEY',
}
```

## 3. Implement the Capabilities Interface

Providers must declare their capabilities accurately so the CLI knows how to interact with them:

```typescript
export interface ProviderCapabilities {
  chatCompletions: boolean;
  responsesApi: boolean;
  streaming: boolean;
  vision: boolean;
  toolCalling: boolean;
  reasoning: boolean;
  jsonMode: boolean;
  embeddings: boolean;
  modelDiscovery: boolean;
  
  // Auth Capabilities
  browserLogin: boolean;
  deviceFlow: boolean;
  apiKeys: boolean;
  localServer: boolean;
}
```

## 4. Authentication Flows

The onboarding system (`/setup`, `/provider`) dynamically adjusts its UI based on these capabilities:

- **`apiKeys`**: Setup prompts for the key, provides a link to `docsUrl`, and immediately validates the key against the API via `provider.health()`. If validation fails (e.g., expired key, rate limited, connection failure), it gracefully prints the failure reason.
- **`localServer`**: Setup attempts auto-discovery on `localhost`.
- **`browserLogin` & `deviceFlow`**: Currently marked as "Not yet implemented" in the CLI. Only enable these for a provider if you have built a real OAuth client listener or polling mechanism for that provider. Simulated success delays are strictly forbidden.

## 5. Implement the LLMProvider Interface

Implement the `LLMProvider` interface in `packages/providers/src/base.ts`. Your implementation must support:
- `complete()`
- `streamComplete()`
- `listModels()` (crucial for model discovery if `modelDiscovery` is true)
- `health()` (crucial for validating authentication configurations immediately)
