import type { WorkerEnv } from "types/env";
import { createOpenAiCompatibleAiAdapter } from "@/adapters/ai/openai-compatible.adapter";
import type { AiPort } from "@/ports/ai.port";

const DEFAULT_VERCEL_AI_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_VERCEL_AI_MODEL = "openai/gpt-4o-mini";

export function resolveVercelAiConfig(env: WorkerEnv): {
  apiKey?: string;
  baseURL: string;
  modelId: string;
} {
  return {
    apiKey: env.VERCEL_AI_API_KEY,
    baseURL: env.VERCEL_AI_BASE_URL?.trim() || DEFAULT_VERCEL_AI_BASE_URL,
    modelId: env.VERCEL_AI_MODEL?.trim() || DEFAULT_VERCEL_AI_MODEL,
  };
}

export function createVercelAiAdapter(env: WorkerEnv): AiPort {
  const config = resolveVercelAiConfig(env);
  return createOpenAiCompatibleAiAdapter({
    providerName: "vercel-ai",
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    modelId: config.modelId,
    promptsKv: env.PROMPTS_KV,
  });
}
