import type { WorkerEnv } from "types/env";
import { createCloudflareAiAdapter } from "@/adapters/ai/cloudflare-ai.adapter";
import { createOpenAiCompatibleAiAdapter } from "@/adapters/ai/openai-compatible.adapter";
import { resolveOpenRouterConfig } from "@/adapters/ai/openrouter.adapter";
import { resolveVercelAiConfig } from "@/adapters/ai/vercel-ai.adapter";
import type {
  AiCallScope,
  AiPort,
  CategoryClassificationInput,
  ExtractedTransaction,
  MessageGenerationInput,
} from "@/ports/ai.port";
import type { LoggerPort } from "@/ports/logger.port";
import type { UserAiGatewayConfig, UserAiGatewayRepoPort } from "@/ports/user-ai-gateway-repo.port";

export type CreateUserScopedAiAdapterDeps = {
  env: WorkerEnv;
  default: AiPort;
  userGatewayRepo: UserAiGatewayRepoPort;
  logger: LoggerPort;
};

const BUILTIN_MANAGED_MODELS: Record<"cloudflare" | "vercel" | "openrouter", string[]> = {
  cloudflare: ["@cf/qwen/qwen3-30b-a3b-fp8", "@cf/meta/llama-3.1-8b-instruct-fast"],
  vercel: ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku-latest"],
  openrouter: ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku"],
};

function resolvePlatformProvider(env: WorkerEnv): "cloudflare" | "vercel" | "openrouter" {
  return env.AI_PROVIDER === "vercel" || env.AI_PROVIDER === "openrouter"
    ? env.AI_PROVIDER
    : "cloudflare";
}

function resolveManagedModelAllowlist(env: WorkerEnv): string[] {
  const configured = env.PLATFORM_MANAGED_MODELS?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return configured?.length ? configured : BUILTIN_MANAGED_MODELS[resolvePlatformProvider(env)];
}

/**
 * Routes AI calls through a per-user preference when present:
 * - byok: the user's own gateway account (their API key pays for usage).
 * - managed: a model the user picked, executed on the platform gateway
 *   (app pays; restricted to PLATFORM_MANAGED_MODELS to bound cost).
 * Falls back to the platform default adapter otherwise.
 */
export function createUserScopedAiAdapter(deps: CreateUserScopedAiAdapterDeps): AiPort {
  const userAdapters = new Map<string, AiPort>();

  function buildAdapter(config: NonNullable<UserAiGatewayConfig>): AiPort | null {
    if (config.mode === "managed") {
      const modelId = config.modelId?.trim();
      if (!modelId || !resolveManagedModelAllowlist(deps.env).includes(modelId)) {
        deps.logger.warn("ai.managed_model_not_allowed", { modelId });
        return null;
      }

      const provider = resolvePlatformProvider(deps.env);
      if (provider === "cloudflare") {
        return createCloudflareAiAdapter(deps.env, { modelId });
      }

      const platformConfig =
        provider === "openrouter"
          ? resolveOpenRouterConfig(deps.env)
          : resolveVercelAiConfig(deps.env);

      return createOpenAiCompatibleAiAdapter({
        providerName: provider === "openrouter" ? "openrouter" : "vercel-ai",
        apiKey: platformConfig.apiKey,
        baseURL: platformConfig.baseURL,
        modelId,
        promptsKv: deps.env.PROMPTS_KV,
      });
    }

    if (!config.provider || !config.apiKey) return null;

    const platformConfig =
      config.provider === "openrouter"
        ? resolveOpenRouterConfig(deps.env)
        : resolveVercelAiConfig(deps.env);

    return createOpenAiCompatibleAiAdapter({
      providerName: config.provider === "openrouter" ? "openrouter" : "vercel-ai",
      apiKey: config.apiKey,
      baseURL: config.baseUrl?.trim() || platformConfig.baseURL,
      modelId: config.modelId?.trim() || platformConfig.modelId,
      promptsKv: deps.env.PROMPTS_KV,
    });
  }

  async function resolveAdapter(scope?: AiCallScope): Promise<AiPort> {
    const userId = scope?.userId;
    if (!userId) return deps.default;

    const cached = userAdapters.get(userId);
    if (cached) return cached;

    let config: UserAiGatewayConfig | null = null;
    try {
      config = await deps.userGatewayRepo.getByUserId(userId);
    } catch (cause) {
      deps.logger.warn("ai.user_gateway_lookup_failed", { userId, cause });
      config = null;
    }

    if (!config) return deps.default;

    const adapter = buildAdapter(config);
    if (!adapter) return deps.default;

    userAdapters.set(userId, adapter);
    deps.logger.info("ai.user_gateway_active", {
      userId,
      mode: config.mode,
      provider: config.provider ?? resolvePlatformProvider(deps.env),
      modelId: config.modelId,
    });

    return adapter;
  }

  return {
    extractTransaction(input: string, scope?: AiCallScope): Promise<ExtractedTransaction | null> {
      return resolveAdapter(scope).then((adapter) => adapter.extractTransaction(input, scope));
    },

    classifyCategory(
      input: CategoryClassificationInput,
      scope?: AiCallScope,
    ): Promise<{ categoryId: string | null; confidence: number }> {
      return resolveAdapter(scope).then((adapter) => adapter.classifyCategory(input, scope));
    },

    generateMessage(input: MessageGenerationInput, scope?: AiCallScope): Promise<string> {
      return resolveAdapter(scope).then((adapter) => adapter.generateMessage(input, scope));
    },
  };
}
