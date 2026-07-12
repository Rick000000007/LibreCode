import { OpenAICompatibleProvider } from './packages/providers/dist/openai-compatible.js';

const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
    console.log("No NVIDIA_API_KEY");
    process.exit(1);
}

const provider = new OpenAICompatibleProvider({
  name: 'nvidia',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  apiKey,
  defaultModel: 'meta/llama-3.1-8b-instruct',
  timeout: 30000,
});

async function run() {
  console.log("Testing NVIDIA connection...");
  const res = await provider.testConnection();
  console.log(res);
}

run().catch(console.error);
