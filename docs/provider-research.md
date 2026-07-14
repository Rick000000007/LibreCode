# AI Provider API Research — Complete Directory (July 2026)

## Legend

| Field | Description |
|---|---|
| **OpenAI Compat** | API follows OpenAI `/v1/chat/completions` format |
| **Chat** | `/v1/chat/completions` or equivalent |
| **Embeddings** | `/v1/embeddings` or equivalent |
| **Vision** | Accepts image inputs |
| **Image Gen** | Text-to-image generation |
| **Audio** | Speech-to-text / text-to-speech |
| **Models** | `GET /v1/models` or equivalent |
| **Streaming** | SSE-based token streaming |
| **Tools** | Function/tool calling |
| **Structured** | JSON mode / structured output |
| **Free Tier** | Free credits or free models |
| **Self-Host** | Can be self-hosted |

---

## Core AI Companies

### 1. OpenAI

| Property | Value |
|---|---|
| **Website** | https://openai.com |
| **Docs** | https://platform.openai.com/docs |
| **API Base URL** | `https://api.openai.com/v1` |
| **Auth** | Bearer token (`Authorization: Bearer sk-...`) |
| **OpenAI Compat** | Native |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | `POST /embeddings` |
| **Vision** | Yes (gpt-4o, gpt-4o-mini, o-series) |
| **Image Gen** | `POST /images/generations` (DALL-E 3) |
| **Audio** | `POST /audio/transcriptions`, `POST /audio/speech` |
| **Models** | `GET /models` |
| **Streaming** | Yes (SSE) |
| **Tools** | Yes |
| **Structured** | Yes (`response_format`) |
| **Free Tier** | $5 free credits (new accounts) |
| **Pricing** | https://openai.com/api/pricing |
| **SDKs** | Python, TypeScript, Go, Java, Ruby, Rust (community), C# (community) |
| **Models** | gpt-4o, gpt-4o-mini, o-series (o3, o4-mini), gpt-4.1, gpt-5.6 family |
| **Open Source** | No (proprietary) |
| **Self-Host** | No |

### 2. Anthropic (Claude)

| Property | Value |
|---|---|
| **Website** | https://anthropic.com |
| **Docs** | https://docs.anthropic.com |
| **API Base URL** | `https://api.anthropic.com/v1` |
| **Auth** | `x-api-key` header |
| **OpenAI Compat** | No (native Messages API) |
| **Chat** | `POST /messages` |
| **Embeddings** | No |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes (SSE) |
| **Tools** | Yes (tool_use) |
| **Structured** | Yes |
| **Free Tier** | $5 free credits (new accounts) |
| **Pricing** | https://anthropic.com/pricing |
| **SDKs** | Python, TypeScript, Go, Java, Ruby |
| **Models** | claude-opus-4, claude-sonnet-4, claude-haiku-3.5; extended: claude-opus-4.5, claude-sonnet-4.5 |
| **Open Source** | No |
| **Self-Host** | No |

### 3. Google Gemini

| Property | Value |
|---|---|
| **Website** | https://ai.google.dev |
| **Docs** | https://ai.google.dev/gemini-api/docs |
| **API Base URL** | `https://generativelanguage.googleapis.com/v1beta` |
| **OpenAI Compat Base** | `https://generativelanguage.googleapis.com/v1beta/openai` |
| **Auth** | `x-goog-api-key` header |
| **OpenAI Compat** | Yes (via `/v1beta/openai` endpoint) |
| **Chat** | `POST /models/{model}:generateContent` or `/v1beta/openai/chat/completions` |
| **Embeddings** | `POST /models/{model}:embedContent` |
| **Vision** | Yes |
| **Image Gen** | Yes (Imagen) |
| **Audio** | Yes |
| **Models** | `GET /models` |
| **Streaming** | Yes (SSE) |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier with rate limits (AI Studio) |
| **Pricing** | https://ai.google.dev/pricing |
| **SDKs** | Python (`google-genai`), TypeScript (`@google/genai`), Go, Java, Kotlin |
| **Models** | gemini-2.5-flash, gemini-2.5-pro, gemini-3.5-flash, gemini-3.5-pro |
| **Open Source** | No |
| **Self-Host** | No |

### 4. DeepSeek

| Property | Value |
|---|---|
| **Website** | https://deepseek.com |
| **Docs** | https://api-docs.deepseek.com |
| **API Base URL** | `https://api.deepseek.com` |
| **Anthropic Base** | `https://api.deepseek.com/anthropic` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `/chat/completions` or `/v1/chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes (V4 models) |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | 5M free tokens (new accounts) |
| **Pricing** | https://api-docs.deepseek.com/quick_start/pricing |
| **SDKs** | OpenAI SDK compatible; official: Python, TypeScript |
| **Models** | deepseek-v4-pro, deepseek-v4-flash; legacy: deepseek-chat, deepseek-reasoner |
| **Open Source** | Yes (open weights) |
| **Self-Host** | Yes |

### 5. Mistral AI

| Property | Value |
|---|---|
| **Website** | https://mistral.ai |
| **Docs** | https://docs.mistral.ai |
| **API Base URL** | `https://api.mistral.ai/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | `POST /embeddings` |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | `POST /audio/transcriptions` |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier with rate limits (Le Plan Gratuit) |
| **Pricing** | https://mistral.ai/products/la-plateforme#pricing |
| **SDKs** | Python (`mistralai`), TypeScript (`@mistralai/mistralai`), Go, Java, Rust, C# |
| **Models** | mistral-large-latest, mistral-small-latest, codestral, mistral-embed, mistral-moderation |
| **Open Source** | Partial (open weights) |
| **Self-Host** | Yes |

### 6. Cohere

| Property | Value |
|---|---|
| **Website** | https://cohere.com |
| **Docs** | https://docs.cohere.com |
| **API Base URL** | `https://api.cohere.com/v2` (v2), `https://api.cohere.com/v1` (legacy) |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes (Compatibility API at `/v1` with OpenAI format) |
| **Chat** | `POST /v2/chat` (native), `POST /v1/chat/completions` (OpenAI compat) |
| **Embeddings** | `POST /v2/embed` |
| **Vision** | No |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /v2/models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier (rate-limited) |
| **Pricing** | https://cohere.com/pricing |
| **SDKs** | Python (`cohere`), TypeScript (`cohere-ai`), Go, Java |
| **Models** | command-a-plus, command-r-plus, command-r, embed-english-v3.0, rerank-english-v3.0 |
| **Open Source** | No |
| **Self-Host** | No |

### 7. xAI (Grok)

| Property | Value |
|---|---|
| **Website** | https://x.ai |
| **Docs** | https://docs.x.ai |
| **API Base URL** | `https://api.x.ai/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | No |
| **Vision** | Yes |
| **Image Gen** | Yes (Grok Imagine) |
| **Audio** | Yes (Voice API) |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | No (paid only) |
| **Pricing** | https://x.ai/api#pricing |
| **SDKs** | Python (`xai_sdk`), OpenAI SDK compatible |
| **Models** | grok-4.5, grok-4.3, grok-3.5, grok-3-mini |
| **Open Source** | No |
| **Self-Host** | No |

### 8. Perplexity AI

| Property | Value |
|---|---|
| **Website** | https://perplexity.ai |
| **Docs** | https://docs.perplexity.ai |
| **API Base URL** | `https://api.perplexity.ai` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | No (search-grounded only) |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | No public models endpoint |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | $5 free credits |
| **Pricing** | https://docs.perplexity.ai/guides/pricing |
| **SDKs** | Python (`perplexity`), TypeScript (`@perplexity-ai/perplexity_ai`), OpenAI SDK compatible |
| **Models** | sonar, sonar-pro, sonar-reasoning-pro, sonar-deep-research |
| **Open Source** | No |
| **Self-Host** | No |

### 9. Zhipu AI (GLM)

| Property | Value |
|---|---|
| **Website** | https://zhipu.ai |
| **Docs** | https://open.bigmodel.cn/dev/api |
| **API Base URL** | `https://open.bigmodel.cn/api/paas/v4` |
| **Auth** | Bearer token (JWT) |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes (CogView) |
| **Audio** | Yes |
| **Models** | Yes |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free credits (new accounts) |
| **Pricing** | https://open.bigmodel.cn/pricing |
| **SDKs** | Python, TypeScript |
| **Models** | GLM-5.1, GLM-5.2, GLM-4V-Plus, CogView-4 |
| **Open Source** | Partial |
| **Self-Host** | Partial |

### 10. MiniMax

| Property | Value |
|---|---|
| **Website** | https://minimax.io |
| **Docs** | https://platform.minimax.io/docs |
| **API Base URL** | `https://api.minimax.io/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | Yes (TTS) |
| **Models** | Yes |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free credits |
| **Pricing** | https://platform.minimax.io/pricing |
| **SDKs** | Python, TypeScript |
| **Models** | MiniMax-M3, MiniMax-Text-01, MiniMax-VL-01 |
| **Open Source** | No |
| **Self-Host** | No |

### 11. Moonshot AI (Kimi)

| Property | Value |
|---|---|
| **Website** | https://moonshot.cn |
| **Docs** | https://platform.moonshot.cn/docs |
| **API Base URL** | `https://api.moonshot.cn/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | Yes |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free credits |
| **Pricing** | https://platform.moonshot.cn/pricing |
| **SDKs** | Python, TypeScript |
| **Models** | kimi-k2.5, kimi-k2.6, moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k |
| **Open Source** | No |
| **Self-Host** | No |

### 12. Baidu ERNIE

| Property | Value |
|---|---|
| **Website** | https://yiyan.baidu.com |
| **Docs** | https://cloud.baidu.com/doc/WENXINWORKSHOP/s/Fm2vrveyu |
| **API Base URL** | `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop` |
| **Auth** | Bearer token (OAuth access_token) |
| **OpenAI Compat** | No (native protocol) |
| **Chat** | `POST /chat/{model}` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | Yes |
| **Models** | Yes (via console) |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free credits |
| **Pricing** | https://cloud.baidu.com/doc/WENXINWORKSHOP/s/4lq3sf3v8 |
| **SDKs** | Python, TypeScript, Java, Go, PHP, C# |
| **Models** | ERNIE-4.5, ERNIE-3.5, ERNIE-Lite, ERNIE-Speed, ERNIE-Function |
| **Open Source** | No |
| **Self-Host** | No |

### 13. Tencent Hunyuan

| Property | Value |
|---|---|
| **Website** | https://hunyuan.tencent.com |
| **Docs** | https://cloud.tencent.com/document/product/1729 |
| **API Base URL** | `https://api.hunyuan.cloud.tencent.com/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | Yes |
| **Models** | Yes |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free credits |
| **Pricing** | https://cloud.tencent.com/product/hunyuan/pricing |
| **SDKs** | Python, TypeScript, Java, Go |
| **Models** | hunyuan-pro, hunyuan-standard, hunyuan-lite, hunyuan-vision, hunyuan-role |
| **Open Source** | No |
| **Self-Host** | No |

### 14. Alibaba Qwen

| Property | Value |
|---|---|
| **Website** | https://tongyi.aliyun.com |
| **Docs** | https://help.aliyun.com/zh/model-studio |
| **API Base URL** | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| **Auth** | Bearer token (`Authorization: Bearer sk-...`) |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes (Qwen-VL) |
| **Image Gen** | Yes (Tongyi Wanxiang) |
| **Audio** | Yes (CosyVoice) |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free credits (1M tokens) |
| **Pricing** | https://help.aliyun.com/zh/model-studio/pricing |
| **SDKs** | Python, TypeScript, Java, Go, C# |
| **Models** | qwen-turbo, qwen-plus, qwen-max, qwen3-235b-a22b, qwen3.5-397b-a17b, qwen-vl-max, qwen2.5-coder |
| **Open Source** | Yes (open weights) |
| **Self-Host** | Yes |

### 15. 01.AI (Yi)

| Property | Value |
|---|---|
| **Website** | https://01.ai |
| **Docs** | https://platform.lingyiwanwu.com/docs |
| **API Base URL** | `https://api.lingyiwanwu.com/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes (Yi-Vision) |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | Yes |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free credits |
| **Pricing** | https://platform.lingyiwanwu.com/pricing |
| **SDKs** | Python, TypeScript |
| **Models** | yi-lightning, yi-large, yi-medium, yi-vision, yi-large-turbo |
| **Open Source** | Partial |
| **Self-Host** | Yes |

### 16. AI21 Labs (Jamba)

| Property | Value |
|---|---|
| **Website** | https://ai21.com |
| **Docs** | https://docs.ai21.com |
| **API Base URL** | `https://api.ai21.com/studio/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier ($25 credits) |
| **Pricing** | https://www.ai21.com/pricing |
| **SDKs** | Python, TypeScript |
| **Models** | jamba-1.5-large, jamba-1.5-mini, jamba-1.6 |
| **Open Source** | Partial |
| **Self-Host** | Yes |

---

## Inference Platforms

### 17. OpenRouter

| Property | Value |
|---|---|
| **Website** | https://openrouter.ai |
| **Docs** | https://openrouter.ai/docs |
| **API Base URL** | `https://openrouter.ai/api/v1` |
| **EU Base URL** | `https://eu.openrouter.ai/api/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes (normalizes all providers) |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes (pass-through) |
| **Vision** | Yes (pass-through) |
| **Image Gen** | Yes (pass-through) |
| **Audio** | Yes (pass-through) |
| **Models** | `GET /api/v1/models` (500+ models) |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | 29 free models (rate-limited) |
| **Pricing** | Provider prices + 5.5% fee on credits |
| **SDKs** | OpenAI SDK compatible |
| **Models** | 500+ across 60+ providers |
| **Open Source** | No |
| **Self-Host** | No |

### 18. Together AI

| Property | Value |
|---|---|
| **Website** | https://together.ai |
| **Docs** | https://docs.together.ai |
| **API Base URL** | `https://api.together.xyz/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | `POST /embeddings` |
| **Vision** | Yes |
| **Image Gen** | Yes (FLUX, SD) |
| **Audio** | Yes (TTS) |
| **Models** | `GET /models` (200+) |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | $5 free credits |
| **Pricing** | https://together.ai/pricing |
| **SDKs** | Python (`together`), TypeScript (`together-ai`), OpenAI SDK compatible |
| **Models** | Qwen, Llama, DeepSeek, Mistral, FLUX, GLM, Kimi, GPT-OSS (200+) |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 19. Groq

| Property | Value |
|---|---|
| **Website** | https://groq.com |
| **Docs** | https://console.groq.com/docs |
| **API Base URL** | `https://api.groq.com/openai/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | No |
| **Vision** | Yes (vision models) |
| **Image Gen** | No |
| **Audio** | Yes (Whisper) |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier (rate-limited, no credit card) |
| **Pricing** | https://console.groq.com/docs/pricing |
| **SDKs** | Python (`groq`), TypeScript (`groq-sdk`), OpenAI SDK compatible |
| **Models** | llama-3.3-70b, llama-4-scout, deepseek-r1-distill, qwen-2.5-32b, mixtral-8x7b |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 20. Fireworks AI

| Property | Value |
|---|---|
| **Website** | https://fireworks.ai |
| **Docs** | https://docs.fireworks.ai |
| **API Base URL** | `https://api.fireworks.ai/inference/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | `POST /embeddings` |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | No |
| **Models** | `GET /models` (400+) |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | $10 free credits |
| **Pricing** | https://fireworks.ai/pricing |
| **SDKs** | Python (`fireworks-ai`), OpenAI SDK compatible |
| **Models** | DeepSeek-V3, Qwen-3, Llama-4, GLM-5, GPT-OSS, MiMo, Kimi-K2 (400+) |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 21. Cerebras

| Property | Value |
|---|---|
| **Website** | https://cerebras.ai |
| **Docs** | https://inference-docs.cerebras.ai |
| **API Base URL** | `https://api.cerebras.ai/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | No |
| **Vision** | No |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier |
| **Pricing** | https://cerebras.ai/pricing |
| **SDKs** | OpenAI SDK compatible |
| **Models** | llama-3.3-70b, llama-4-scout, llama-4-maverick |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 22. NVIDIA NIM

| Property | Value |
|---|---|
| **Website** | https://nvidia.com/nim |
| **Docs** | https://build.nvidia.com/docs |
| **API Base URL** | `https://integrate.api.nvidia.com/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | Yes |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier (rate-limited) |
| **Pricing** | https://build.nvidia.com/pricing |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Llama-3.1-Nemotron, Mistral-Nemo, Qwen, DeepSeek-R1 |
| **Open Source** | No (platform) |
| **Self-Host** | Yes (NIM containers) |

### 23. DeepInfra

| Property | Value |
|---|---|
| **Website** | https://deepinfra.com |
| **Docs** | https://deepinfra.com/docs |
| **API Base URL** | `https://api.deepinfra.com/v1/openai` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier (rate-limited) |
| **Pricing** | https://deepinfra.com/pricing |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Llama-4, DeepSeek-V3, Qwen-3, Mixtral, WizardLM (100+) |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 24. Hyperbolic

| Property | Value |
|---|---|
| **Website** | https://hyperbolic.xyz |
| **Docs** | https://docs.hyperbolic.xyz |
| **API Base URL** | `https://api.hyperbolic.xyz/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | No |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | No |
| **Free Tier** | Free credits |
| **Pricing** | https://hyperbolic.xyz/pricing |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Llama-4, Qwen-3, DeepSeek-V3 |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 25. Novita AI

| Property | Value |
|---|---|
| **Website** | https://novita.ai |
| **Docs** | https://docs.novita.ai |
| **API Base URL** | `https://api.novita.ai/v3/openai` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | No |
| **Models** | Yes |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Partial |
| **Free Tier** | Free credits |
| **Pricing** | https://novita.ai/pricing |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Llama, Mistral, DeepSeek, Qwen (100+) |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 26. Featherless AI

| Property | Value |
|---|---|
| **Website** | https://featherless.ai |
| **Docs** | https://docs.featherless.ai |
| **API Base URL** | `https://api.featherless.ai/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | No |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier |
| **Pricing** | https://featherless.ai/pricing |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Llama-4, Qwen-3, DeepSeek, Phi-4 |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 27. Replicate

| Property | Value |
|---|---|
| **Website** | https://replicate.com |
| **Docs** | https://replicate.com/docs |
| **API Base URL** | `https://api.replicate.com/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | No (native protocol) |
| **Chat** | `POST /models/{owner}/{name}/predict` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | Yes |
| **Models** | `GET /models` |
| **Streaming** | Yes (SSE) |
| **Tools** | No |
| **Structured** | No |
| **Free Tier** | Free tier (limited) |
| **Pricing** | https://replicate.com/pricing |
| **SDKs** | Python, TypeScript, Node.js |
| **Models** | Llama, FLUX, Stable Diffusion, Whisper, 1000+ models |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 28. Hugging Face Inference Providers

| Property | Value |
|---|---|
| **Website** | https://huggingface.co |
| **Docs** | https://huggingface.co/docs/api-inference |
| **API Base URL** | `https://api-inference.huggingface.co` |
| **OpenAI Compat Base** | `https://api-inference.huggingface.co/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes (v1 endpoint) |
| **Chat** | `POST /v1/chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | Yes |
| **Models** | Yes (100,000+) |
| **Streaming** | Yes |
| **Tools** | Partial |
| **Structured** | Partial |
| **Free Tier** | Free tier (rate-limited) |
| **Pricing** | https://huggingface.co/pricing |
| **SDKs** | Python (`huggingface_hub`), TypeScript (`@huggingface/inference`) |
| **Models** | 100,000+ community & enterprise models |
| **Open Source** | Yes (platform + many open models) |
| **Self-Host** | Yes (TGI, Text Generation Inference) |

### 29. SambaNova

| Property | Value |
|---|---|
| **Website** | https://sambanova.ai |
| **Docs** | https://docs.sambanova.ai |
| **API Base URL** | `https://api.sambanova.ai/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | No |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier |
| **Pricing** | https://sambanova.ai/pricing |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Llama-4, DeepSeek-R1, Qwen-3, Mistral |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 30. Cloudflare Workers AI

| Property | Value |
|---|---|
| **Website** | https://cloudflare.com/ai |
| **Docs** | https://developers.cloudflare.com/workers-ai |
| **API Base URL** | `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1` |
| **Auth** | Bearer token (API token) |
| **OpenAI Compat** | Yes (v1 endpoint) |
| **Chat** | `POST /run/{model}` or `POST /v1/chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | Yes |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | No |
| **Structured** | No |
| **Free Tier** | Free tier (10K requests/day) |
| **Pricing** | https://developers.cloudflare.com/workers-ai/pricing |
| **SDKs** | Python, TypeScript, Workers runtime, OpenAI SDK compatible |
| **Models** | Llama, Mistral, Qwen, DeepSeek, FLUX, whisper (50+) |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 31. GitHub Models

| Property | Value |
|---|---|
| **Website** | https://github.com/marketplace/models |
| **Docs** | https://docs.github.com/en/github-models |
| **API Base URL** | `https://models.github.ai` |
| **Auth** | Bearer token (GitHub token) |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free (rate-limited, GH account required) |
| **Pricing** | https://docs.github.com/en/github-models/limitations |
| **SDKs** | OpenAI SDK compatible |
| **Models** | GPT-4o, GPT-4o-mini, DeepSeek-V3, Llama-4, Mistral-large, Phi-4, Cohere |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 32. Nebius AI Studio

| Property | Value |
|---|---|
| **Website** | https://nebius.com/studio |
| **Docs** | https://docs.nebius.com/studio |
| **API Base URL** | `https://api.studio.nebius.ai/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free credits |
| **Pricing** | https://nebius.com/studio/pricing |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Llama-4, DeepSeek-V3, Qwen-3, Mistral-Large, FLUX |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 33. Fal AI

| Property | Value |
|---|---|
| **Website** | https://fal.ai |
| **Docs** | https://fal.ai/docs |
| **API Base URL** | `https://fal.run` |
| **Auth** | Bearer token |
| **OpenAI Compat** | No (native protocol) |
| **Chat** | No (inference-focused) |
| **Embeddings** | No |
| **Vision** | Yes (via models) |
| **Image Gen** | Yes (FLUX, SD, Grok Imagine) |
| **Audio** | Yes |
| **Models** | Yes |
| **Streaming** | Yes |
| **Tools** | No |
| **Structured** | No |
| **Free Tier** | Free credits |
| **Pricing** | https://fal.ai/pricing |
| **SDKs** | Python, TypeScript |
| **Models** | FLUX, Stable Diffusion, Grok Imagine, Whisper |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 34. Lepton AI

| Property | Value |
|---|---|
| **Website** | https://lepton.ai |
| **Docs** | https://lepton.ai/docs |
| **API Base URL** | `https://{workspace}.lepton.run/api/v1` |
| **Auth** | Bearer token |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free credits |
| **Pricing** | https://lepton.ai/pricing |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Llama, DeepSeek, Qwen, Mistral |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 35. Baseten

| Property | Value |
|---|---|
| **Website** | https://baseten.co |
| **Docs** | https://docs.baseten.co |
| **API Base URL** | `https://app.baseten.co/models/{model_id}/predict` |
| **Auth** | Bearer token |
| **OpenAI Compat** | No (Truss-based deployments) |
| **Chat** | Custom per model |
| **Embeddings** | Custom |
| **Vision** | Custom |
| **Image Gen** | Custom |
| **Audio** | Custom |
| **Models** | Custom |
| **Streaming** | Yes |
| **Tools** | Custom |
| **Structured** | Custom |
| **Free Tier** | Free credits |
| **Pricing** | https://baseten.co/pricing |
| **SDKs** | Python, TypeScript |
| **Models** | Customer-deployed (any open model) |
| **Open Source** | No (platform) |
| **Self-Host** | No |

### 36. RunPod Serverless

| Property | Value |
|---|---|
| **Website** | https://runpod.io |
| **Docs** | https://docs.runpod.io/serverless |
| **API Base URL** | `https://api.runpod.ai/v2/{endpoint_id}` |
| **Auth** | Bearer token |
| **OpenAI Compat** | No (RunPod native protocol) |
| **Chat** | Custom endpoints |
| **Embeddings** | Custom |
| **Vision** | Custom |
| **Image Gen** | Custom |
| **Audio** | Custom |
| **Models** | Custom |
| **Streaming** | Yes |
| **Tools** | Custom |
| **Structured** | Custom |
| **Free Tier** | No |
| **Pricing** | https://runpod.io/pricing |
| **SDKs** | Python, TypeScript |
| **Models** | Customer-deployed (any open model) |
| **Open Source** | No (platform) |
| **Self-Host** | No |

---

## Local / Self-Hosted

### 37. Ollama

| Property | Value |
|---|---|
| **Website** | https://ollama.ai |
| **Docs** | https://github.com/ollama/ollama/tree/main/docs |
| **API Base URL** | `http://localhost:11434` |
| **Auth** | None (local) / optional |

| **OpenAI Compat** | No (native API, but Ollama has `/v1/chat/completions` compat) |
| **Chat** | `POST /api/chat` (native), `POST /v1/chat/completions` (OpenAI compat) |
| **Embeddings** | `POST /api/embed` |
| **Vision** | Yes (llava, bakllava) |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /api/tags` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free (local) |
| **Pricing** | Free |
| **SDKs** | Python, TypeScript, Go, Rust (community) |
| **Models** | Llama, Mistral, DeepSeek, Qwen, Phi, Gemma, CodeGemma (100+) |
| **Open Source** | Yes |
| **Self-Host** | Yes (native) |

### 38. LM Studio

| Property | Value |
|---|---|
| **Website** | https://lmstudio.ai |
| **Docs** | https://lmstudio.ai/docs |
| **API Base URL** | `http://localhost:1234/v1` |
| **Auth** | None (local) |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | `POST /embeddings` |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free (local) |
| **Pricing** | Free |
| **SDKs** | OpenAI SDK compatible |
| **Models** | User-downloaded (any GGUF) |
| **Open Source** | No (closed source app) |
| **Self-Host** | Yes (local app) |

### 39. vLLM

| Property | Value |
|---|---|
| **Website** | https://vllm.ai |
| **Docs** | https://docs.vllm.ai |
| **API Base URL** | `http://localhost:8000/v1` |
| **Auth** | None (local) / configurable |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | `POST /embeddings` |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free (self-hosted) |
| **Pricing** | Free |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Any HuggingFace model |
| **Open Source** | Yes |
| **Self-Host** | Yes (native) |

### 40. LiteLLM

| Property | Value |
|---|---|
| **Website** | https://litellm.ai |
| **Docs** | https://docs.litellm.ai |
| **API Base URL** | `http://localhost:4000` |
| **Auth** | Configurable |
| **OpenAI Compat** | Yes (translates all providers) |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | Yes |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free (self-hosted) |
| **Pricing** | Free (open source), Enterprise cloud |
| **SDKs** | Python (`litellm`), OpenAI SDK compatible |
| **Models** | 100+ providers (translation layer) |
| **Open Source** | Yes |
| **Self-Host** | Yes |

### 41. LocalAI

| Property | Value |
|---|---|
| **Website** | https://localai.io |
| **Docs** | https://localai.io/docs |
| **API Base URL** | `http://localhost:8080/v1` |
| **Auth** | None (local) / configurable |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | `POST /embeddings` |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | Yes (Whisper, TTS) |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free (self-hosted) |
| **Pricing** | Free |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Any GGUF/GPTQ model |
| **Open Source** | Yes |
| **Self-Host** | Yes (native) |

### 42. llama.cpp Server

| Property | Value |
|---|---|
| **Website** | https://github.com/ggml-org/llama.cpp |
| **Docs** | https://github.com/ggml-org/llama.cpp/tree/master/examples/server |
| **API Base URL** | `http://localhost:8080/v1` |
| **Auth** | None (local) / configurable |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | `POST /embeddings` |
| **Vision** | Yes (llava) |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free (local) |
| **Pricing** | Free |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Any GGUF model |
| **Open Source** | Yes |
| **Self-Host** | Yes (native) |

### 43. Text Generation Inference (TGI)

| Property | Value |
|---|---|
| **Website** | https://huggingface.co/docs/text-generation-inference |
| **Docs** | https://huggingface.co/docs/text-generation-inference |
| **API Base URL** | `http://localhost:8080` |
| **Auth** | None (local) / configurable |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /v1/chat/completions` |
| **Embeddings** | No |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | Yes |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free (self-hosted) |
| **Pricing** | Free |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Any HuggingFace model |
| **Open Source** | Yes |
| **Self-Host** | Yes (native) |

### 44. KoboldCpp

| Property | Value |
|---|---|
| **Website** | https://github.com/LostRuins/koboldcpp |
| **Docs** | https://github.com/LostRuins/koboldcpp |
| **API Base URL** | `http://localhost:5001` |
| **Auth** | None (local) |
| **OpenAI Compat** | Yes |
| **Chat** | `/v1/chat/completions` |
| **Embeddings** | No |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | No |
| **Streaming** | Yes |
| **Tools** | No |
| **Structured** | No |
| **Free Tier** | Free (local) |
| **Pricing** | Free |
| **SDKs** | OpenAI SDK compatible |
| **Models** | Any GGUF model |
| **Open Source** | Yes |
| **Self-Host** | Yes (native) |

### 45. Jan AI

| Property | Value |
|---|---|
| **Website** | https://jan.ai |
| **Docs** | https://jan.ai/docs |
| **API Base URL** | `http://localhost:1337/v1` |
| **Auth** | None (local) |
| **OpenAI Compat** | Yes |
| **Chat** | `POST /chat/completions` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Partial |
| **Free Tier** | Free (local) |
| **Pricing** | Free |
| **SDKs** | OpenAI SDK compatible |
| **Models** | User-downloaded (GGUF) |
| **Open Source** | Yes |
| **Self-Host** | Yes (local app) |

---

## Cloud Providers

### 46. Azure OpenAI

| Property | Value |
|---|---|
| **Website** | https://azure.microsoft.com/products/ai-services/openai-service |
| **Docs** | https://learn.microsoft.com/azure/ai-services/openai |
| **API Base URL** | `https://{resource}.openai.azure.com/openai/deployments/{deployment-id}` |
| **Auth** | Bearer token (Azure AD) or API key |
| **OpenAI Compat** | Yes |
| **Chat** | `/chat/completions?api-version=2025-01-01-preview` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes (DALL-E) |
| **Audio** | Yes (Whisper, TTS) |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | $200 free credits |
| **Pricing** | https://azure.microsoft.com/pricing/details/cognitive-services/openai-service |
| **SDKs** | Python, TypeScript, Go, Java, .NET, OpenAI SDK compatible |
| **Models** | GPT-4o, GPT-4o-mini, o-series, DALL-E 3, Whisper, TTS |
| **Open Source** | No |
| **Self-Host** | No (managed service) |

### 47. Amazon Bedrock

| Property | Value |
|---|---|
| **Website** | https://aws.amazon.com/bedrock |
| **Docs** | https://docs.aws.amazon.com/bedrock |
| **API Base URL** | `https://bedrock-runtime.{region}.amazonaws.com` |
| **Auth** | AWS Signature V4 (IAM) |
| **OpenAI Compat** | Yes (Bedrock Converse API) |
| **Chat** | `POST /model/{modelId}/converse` or `POST /model/{modelId}/converseStream` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | No |
| **Models** | `GET /foundation-models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier (limited) |
| **Pricing** | https://aws.amazon.com/bedrock/pricing |
| **SDKs** | Python, TypeScript, Go, Java, .NET, Rust |
| **Models** | Claude, Llama, Mistral, Titan, Jurassic-2, Cohere, Stable Diffusion, DeepSeek |
| **Open Source** | No (managed service) |
| **Self-Host** | No |

### 48. Google Vertex AI

| Property | Value |
|---|---|
| **Website** | https://cloud.google.com/vertex-ai |
| **Docs** | https://cloud.google.com/vertex-ai/docs |
| **API Base URL** | `https://{region}-aiplatform.googleapis.com/v1` |
| **Auth** | OAuth (GCP service account) |
| **OpenAI Compat** | Yes (Vertex AI with OpenAI compat endpoint) |
| **Chat** | `POST /projects/{project}/locations/{region}/publishers/google/models/{model}:streamGenerateContent` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes (Imagen) |
| **Audio** | Yes |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | $300 free credits (new GCP accounts) |
| **Pricing** | https://cloud.google.com/vertex-ai/generative-ai/pricing |
| **SDKs** | Python, TypeScript, Go, Java, .NET |
| **Models** | Gemini, Claude (via Anthropic), Llama, Gemma, Imagen |
| **Open Source** | No (managed service) |
| **Self-Host** | No |

### 49. IBM watsonx.ai

| Property | Value |
|---|---|
| **Website** | https://ibm.com/products/watsonx-ai |
| **Docs** | https://cloud.ibm.com/docs/watsonx |
| **API Base URL** | `https://{region}.ml.cloud.ibm.com/ml/v1` |
| **Auth** | Bearer token (IAM) |
| **OpenAI Compat** | No (native protocol) |
| **Chat** | `POST /text/generation` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | No |
| **Audio** | No |
| **Models** | `GET /foundation_models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free tier (rate-limited) |
| **Pricing** | https://cloud.ibm.com/watsonx/pricing |
| **SDKs** | Python, TypeScript, Java, Go |
| **Models** | Granite, Llama, Mistral, Mixtral |
| **Open Source** | Partial (Granite open) |
| **Self-Host** | Yes (Granite) |

### 50. Oracle OCI Generative AI

| Property | Value |
|---|---|
| **Website** | https://oracle.com/artificial-intelligence/generative-ai |
| **Docs** | https://docs.oracle.com/iaas/Content/generative-ai |
| **API Base URL** | `https://inference.generativeai.{region}.oci.oraclecloud.com` |
| **Auth** | OCI Signature (IAM) |
| **OpenAI Compat** | No (native protocol) |
| **Chat** | `POST /chat` |
| **Embeddings** | Yes |
| **Vision** | Yes |
| **Image Gen** | Yes |
| **Audio** | No |
| **Models** | `GET /models` |
| **Streaming** | Yes |
| **Tools** | Yes |
| **Structured** | Yes |
| **Free Tier** | Free credits |
| **Pricing** | https://oracle.com/artificial-intelligence/generative-ai/pricing |
| **SDKs** | Python, TypeScript, Java, Go |
| **Models** | Cohere Command, Llama |
| **Open Source** | No (managed service) |
| **Self-Host** | No |

---

## Quick Reference: OpenAI-Compatibility Summary

| Provider | OpenAI Compat | Base URL (for OpenAI SDK) | Chat Endpoint | Models Endpoint |
|---|---|---|---|---|
| OpenAI | **Native** | `https://api.openai.com/v1` | `/chat/completions` | `/models` |
| Anthropic | No (adapter needed) | `https://api.anthropic.com/v1` | `/messages` | `/models` |
| Google Gemini | **Yes** | `https://generativelanguage.googleapis.com/v1beta/openai` | `/chat/completions` | `/models` |
| DeepSeek | **Yes** | `https://api.deepseek.com` | `/chat/completions` | `/models` |
| Mistral | **Yes** | `https://api.mistral.ai/v1` | `/chat/completions` | `/models` |
| Cohere | **Yes** | `https://api.cohere.com/v1` (OpenAI compat) | `/chat/completions` | `/models` |
| xAI Grok | **Yes** | `https://api.x.ai/v1` | `/chat/completions` | `/models` |
| Perplexity | **Yes** | `https://api.perplexity.ai` | `/chat/completions` | — |
| Zhipu GLM | **Yes** | `https://open.bigmodel.cn/api/paas/v4` | `/chat/completions` | Yes |
| MiniMax | **Yes** | `https://api.minimax.io/v1` | `/chat/completions` | Yes |
| Moonshot | **Yes** | `https://api.moonshot.cn/v1` | `/chat/completions` | Yes |
| Tencent Hunyuan | **Yes** | `https://api.hunyuan.cloud.tencent.com/v1` | `/chat/completions` | Yes |
| Alibaba Qwen | **Yes** | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `/chat/completions` | `/models` |
| 01.AI (Yi) | **Yes** | `https://api.lingyiwanwu.com/v1` | `/chat/completions` | Yes |
| AI21 Labs | **Yes** | `https://api.ai21.com/studio/v1` | `/chat/completions` | `/models` |
| OpenRouter | **Yes** | `https://openrouter.ai/api/v1` | `/chat/completions` | `/api/v1/models` |
| Together AI | **Yes** | `https://api.together.xyz/v1` | `/chat/completions` | `/models` |
| Groq | **Yes** | `https://api.groq.com/openai/v1` | `/chat/completions` | `/models` |
| Fireworks AI | **Yes** | `https://api.fireworks.ai/inference/v1` | `/chat/completions` | `/models` |
| Cerebras | **Yes** | `https://api.cerebras.ai/v1` | `/chat/completions` | `/models` |
| NVIDIA NIM | **Yes** | `https://integrate.api.nvidia.com/v1` | `/chat/completions` | `/models` |
| DeepInfra | **Yes** | `https://api.deepinfra.com/v1/openai` | `/chat/completions` | `/models` |
| Hyperbolic | **Yes** | `https://api.hyperbolic.xyz/v1` | `/chat/completions` | `/models` |
| SambaNova | **Yes** | `https://api.sambanova.ai/v1` | `/chat/completions` | `/models` |
| Cloudflare AI | **Yes** | `https://api.cloudflare.com/client/v4/accounts/{id}/ai/v1` | `/chat/completions` | `/models` |
| GitHub Models | **Yes** | `https://models.github.ai` | `/chat/completions` | `/models` |
| Nebius | **Yes** | `https://api.studio.nebius.ai/v1` | `/chat/completions` | `/models` |
| Ollama | **Yes** | `http://localhost:11434/v1` | `/chat/completions` | `/models` |
| LM Studio | **Yes** | `http://localhost:1234/v1` | `/chat/completions` | `/models` |
| vLLM | **Yes** | `http://localhost:8000/v1` | `/chat/completions` | `/models` |
| LiteLLM | **Yes** | `http://localhost:4000` | `/chat/completions` | `/models` |
| LocalAI | **Yes** | `http://localhost:8080/v1` | `/chat/completions` | `/models` |
| llama.cpp | **Yes** | `http://localhost:8080/v1` | `/chat/completions` | `/models` |
| TGI | **Yes** | `http://localhost:8080` | `/v1/chat/completions` | Yes |
| Jan AI | **Yes** | `http://localhost:1337/v1` | `/chat/completions` | `/models` |
| Azure OpenAI | **Yes** | `https://{resource}.openai.azure.com/openai/deployments/{id}` | `/chat/completions` | `/models` |
| Amazon Bedrock | **Yes** (Converse) | region-specific | `/converse` | `/foundation-models` |
| Vertex AI | **Yes** | region-specific | `/streamGenerateContent` | `/models` |
| IBM watsonx | No | region-specific | `/text/generation` | `/foundation_models` |
| OCI GenAI | No | region-specific | `/chat` | `/models` |
| Replicate | No | `https://api.replicate.com/v1` | `/models/{owner}/{name}/predict` | `/models` |
| Fal AI | No | `https://fal.run` | N/A | Yes |
| Baseten | No | `https://app.baseten.co/models/{id}/predict` | N/A | Custom |
| RunPod | No | `https://api.runpod.ai/v2/{id}` | N/A | Custom |
