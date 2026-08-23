export type UserAiGatewayMode = "byok" | "managed";

export interface UserAiGatewayConfig {
  /** byok: usage bills to the user's own gateway account; managed: app pays */
  mode: UserAiGatewayMode;
  /** byok only: which SDK gateway the user's key belongs to */
  provider?: "vercel" | "openrouter";
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
}

export interface UserAiGatewayRepoPort {
  getByUserId(userId: string): Promise<UserAiGatewayConfig | null>;
}
