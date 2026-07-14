# Provider API Comparison Matrix

## Feature Support Matrix

| Provider | OpenAI Compat | Custom Adapter | `/v1/chat/completions` | Embeddings | Models Endpoint | Streaming | Tools | JSON Output | Multimodal |
|---|---|---|---|---|---|---|---|---|---|
| **OpenAI** | ✅ Native | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Anthropic** | ❌ | ✅ Required | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Google Gemini** | ✅ | Optional | ✅ (OpenAI compat) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DeepSeek** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Mistral** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Cohere** | ✅ | Optional | ✅ (OpenAI compat) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **xAI Grok** | ✅ | — | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Perplexity** | ✅ | — | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Zhipu GLM** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **MiniMax** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Moonshot** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Baidu ERNIE** | ❌ | ✅ Required | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Tencent Hunyuan** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Alibaba Qwen** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **01.AI (Yi)** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **AI21 Labs** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **OpenRouter** | ✅ | — | ✅ | ✅ (pass) | ✅ | ✅ | ✅ | ✅ | ✅ (pass) |
| **Together AI** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Groq** | ✅ | — | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Fireworks AI** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Cerebras** | ✅ | — | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **NVIDIA NIM** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DeepInfra** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Hyperbolic** | ✅ | — | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **SambaNova** | ✅ | — | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Cloudflare AI** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **GitHub Models** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Nebius** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Ollama** | ✅ | — | ✅ (v1 compat) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **LM Studio** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **vLLM** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **LiteLLM** | ✅ | — | ✅ | ✅ (pass) | ✅ | ✅ | ✅ | ✅ | ✅ (pass) |
| **LocalAI** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **llama.cpp** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **TGI** | ✅ | — | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Jan AI** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Azure OpenAI** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Amazon Bedrock** | ✅ | Optional | ✅ (Converse) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Vertex AI** | ✅ | Optional | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **IBM watsonx** | ❌ | ✅ Required | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **OCI GenAI** | ❌ | ✅ Required | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Replicate** | ❌ | ✅ Required | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Fal AI** | ❌ | ✅ Required | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Baseten** | ❌ | ✅ Required | ❌ | Custom | Custom | ✅ | Custom | Custom | Custom |
| **RunPod** | ❌ | ✅ Required | ❌ | Custom | Custom | ✅ | Custom | Custom | Custom |

## Provider Categorization

### Category A: Native OpenAI-Compatible (36 providers)
No adapter needed — works with `OpenAICompatibleProvider`:
OpenAI, Google Gemini, DeepSeek, Mistral, Cohere, xAI Grok, Perplexity, Zhipu GLM, MiniMax, Moonshot, Tencent Hunyuan, Alibaba Qwen, 01.AI (Yi), AI21 Labs, OpenRouter, Together AI, Groq, Fireworks AI, Cerebras, NVIDIA NIM, DeepInfra, Hyperbolic, SambaNova, Cloudflare AI, GitHub Models, Nebius, Ollama, LM Studio, vLLM, LiteLLM, LocalAI, llama.cpp, TGI, Jan AI, Azure OpenAI, Amazon Bedrock (Converse), Vertex AI (OpenAI compat)

### Category B: Custom Adapter Required (8 providers)
Anthropic, Baidu ERNIE, IBM watsonx.ai, OCI GenAI, Replicate, Fal AI, Baseten, RunPod

### Category C: Speech/Image Specialized (3 providers)
Fal AI (image/video), Replicate (general), Baseten (custom deployments)

## Protocol Classification

### Native OpenAI `/v1/chat/completions`
OpenAI, DeepSeek, Mistral, xAI Grok, Perplexity, Zhipu, MiniMax, Moonshot, Tencent Hunyuan, 01.AI (Yi), AI21 Labs, OpenRouter, Together AI, Groq, Fireworks, Cerebras, NVIDIA, DeepInfra, Hyperbolic, SambaNova, Nebius, most local servers

### Non-OpenAI Native Protocol
- **Anthropic**: `POST /v1/messages` (with `x-api-key` header)
- **Google Gemini**: `POST /v1beta/models/{model}:generateContent` (with `x-goog-api-key`)
- **Baidu ERNIE**: `POST /rpc/2.0/ai_custom/v1/wenxinworkshop/chat/{model}`
- **IBM watsonx**: `POST /ml/v1/text/generation`
- **OCI GenAI**: `POST /chat`
- **Replicate**: `POST /models/{owner}/{name}/predict`
- **Azure OpenAI**: `POST /openai/deployments/{deployment-id}/chat/completions` (OpenAI compatible)
- **Amazon Bedrock**: `POST /model/{modelId}/converse` (Converse API)
