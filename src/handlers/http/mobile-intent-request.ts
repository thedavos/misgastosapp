import type { User } from "@/domain/user/entity";
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
}): Promise<ResolveMobileIntentRequestResult> {
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
  const userId = typeof record.userId === "string" ? record.userId.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";

  if (!userId || !text) {
    return {
      ok: false,
      response: Response.json({ error: "userId_and_text_required" }, { status: 400 }),
    };
  }

  const user = await input.userRepo.getById(userId);
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "user_not_found" }, { status: 404 }),
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
