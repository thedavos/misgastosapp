import type { User } from "@/domain/user/entity";
import type { UserRepoPort } from "@/ports/user-repo.port";

export type ResolvedMobileIntentRequest = {
  customerId: string;
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
  const customerId = typeof record.customerId === "string" ? record.customerId.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";

  if (!customerId || !text) {
    return {
      ok: false,
      response: Response.json({ error: "customerId_and_text_required" }, { status: 400 }),
    };
  }

  const user = await input.userRepo.getById(customerId);
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "customer_not_found" }, { status: 404 }),
    };
  }

  return {
    ok: true,
    value: {
      customerId,
      text,
      user,
    },
  };
}
