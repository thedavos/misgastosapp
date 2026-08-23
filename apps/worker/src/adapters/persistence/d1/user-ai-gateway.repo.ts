import type { WorkerEnv } from "types/env";
import type {
  UserAiGatewayConfig,
  UserAiGatewayMode,
  UserAiGatewayRepoPort,
} from "@/ports/user-ai-gateway-repo.port";
import { decryptSecret } from "@/utils/crypto/aesGcm";

type GatewayRow = {
  user_id: string;
  mode: string;
  provider: string | null;
  api_key_encrypted: string | null;
  base_url: string | null;
  model: string | null;
  enabled: number;
};

function parseMode(mode: string): UserAiGatewayMode | null {
  return mode === "byok" || mode === "managed" ? mode : null;
}

export function createD1UserAiGatewayRepo(env: WorkerEnv): UserAiGatewayRepoPort {
  return {
    async getByUserId(userId: string): Promise<UserAiGatewayConfig | null> {
      const encryptionKey = env.USER_AI_GATEWAY_ENC_KEY;
      if (!encryptionKey) {
        return null;
      }

      const row = await env.DB.prepare(
        `SELECT user_id, mode, provider, api_key_encrypted, base_url, model, enabled
         FROM user_ai_gateways
         WHERE user_id = ? AND enabled = 1
         LIMIT 1`,
      )
        .bind(userId)
        .first<GatewayRow>();

      if (!row) return null;

      const mode = parseMode(row.mode);
      if (!mode) return null;

      if (mode === "byok") {
        const provider =
          row.provider === "vercel" || row.provider === "openrouter" ? row.provider : null;
        if (!provider || !row.api_key_encrypted) return null;

        try {
          const apiKey = await decryptSecret(row.api_key_encrypted, encryptionKey);
          return {
            mode,
            provider,
            apiKey,
            baseUrl: row.base_url ?? undefined,
            modelId: row.model ?? undefined,
          };
        } catch {
          return null;
        }
      }

      if (!row.model) return null;
      return { mode, modelId: row.model };
    },
  };
}
