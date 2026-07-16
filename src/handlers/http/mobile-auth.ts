import { constantTimeEquals } from "@/utils/crypto/constantTimeEquals";

export type MobilePrincipal = {
  userId: string;
};

export type AuthenticateMobilePrincipalResult =
  | { ok: true; principal: MobilePrincipal }
  | { ok: false; reason: "missing" | "invalid" | "misconfigured" };

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function tokensEqual(left: string, right: string): boolean {
  const leftBytes = encodeUtf8(left);
  const rightBytes = encodeUtf8(right);
  return constantTimeEquals(leftBytes, rightBytes);
}

export function parseMobileApiTokens(raw: string | undefined): Map<string, string> | null {
  if (!raw || raw.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const tokens = new Map<string, string>();
  for (const [token, userId] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof token !== "string" || token.trim().length === 0) continue;
    if (typeof userId !== "string" || userId.trim().length === 0) continue;
    tokens.set(token.trim(), userId.trim());
  }

  return tokens.size > 0 ? tokens : null;
}

export function authenticateMobilePrincipal(input: {
  request: Request;
  mobileApiTokens: string | undefined;
}): AuthenticateMobilePrincipalResult {
  const tokenMap = parseMobileApiTokens(input.mobileApiTokens);
  if (!tokenMap) {
    return { ok: false, reason: "misconfigured" };
  }

  const authorization = input.request.headers.get("authorization");
  if (!authorization) {
    return { ok: false, reason: "missing" };
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) {
    return { ok: false, reason: "invalid" };
  }

  const providedToken = match[1]?.trim() ?? "";
  if (!providedToken) {
    return { ok: false, reason: "invalid" };
  }

  for (const [token, userId] of tokenMap.entries()) {
    if (tokensEqual(token, providedToken)) {
      return { ok: true, principal: { userId } };
    }
  }

  return { ok: false, reason: "invalid" };
}
