import type { User } from "@/domain/user/entity";
import { authenticateMobilePrincipal } from "@/handlers/http/mobile-auth";
import type { UserRepoPort } from "@/ports/user-repo.port";

export type ResolvedMobileIntentRequest = {
  userId: string;
  text: string;
  user: User;
};

export type ResolveMobileIntentRequestResult =
  | {
      ok: true;
      value: ResolvedMobileIntentRequest;
    }
  | {
      ok: false;
      response: Response;
    };

export async function resolveMobileIntentRequest(input: {
  request: Request;
  userRepo: UserRepoPort;
  mobileApiTokens: string | undefined;
}): Promise<ResolveMobileIntentRequestResult> {
  const auth = authenticateMobilePrincipal({
    request: input.request,
    mobileApiTokens: input.mobileApiTokens,
  });

  if (!auth.ok) {
    return {
      ok: false,
      response: Response.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  let payload: unknown;
  try {
    payload = await input.request.json();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "invalid_json" }, { status: 400 }),
    };
  }

  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      response: Response.json({ error: "invalid_payload" }, { status: 400 }),
    };
  }

  const record = payload as Record<string, unknown>;
  const bodyUserId = typeof record.userId === "string" ? record.userId.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";

  if (!text) {
    return {
      ok: false,
      response: Response.json({ error: "text_required" }, { status: 400 }),
    };
  }

  if (bodyUserId && bodyUserId !== auth.principal.userId) {
    return {
      ok: false,
      response: Response.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  const userId = auth.principal.userId;
  const user = await input.userRepo.getById(userId);
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  return {
    ok: true,
    value: {
      userId,
      text,
      user,
    },
  };
}
