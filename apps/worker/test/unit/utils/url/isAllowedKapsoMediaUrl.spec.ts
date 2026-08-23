import { describe, expect, it } from "vitest";
import { isAllowedKapsoMediaUrl } from "@/utils/url/isAllowedKapsoMediaUrl";

describe("isAllowedKapsoMediaUrl", () => {
  const env = {
    KAPSO_API_BASE_URL: "https://api.kapso.ai/v1",
  } as never;

  it("allows default Kapso media hosts over https", () => {
    expect(isAllowedKapsoMediaUrl("https://media.kapso.ai/file.jpg", env)).toBe(true);
    expect(isAllowedKapsoMediaUrl("https://api.kapso.ai/media/1", env)).toBe(true);
  });

  it("rejects private hosts and non-https urls", () => {
    expect(isAllowedKapsoMediaUrl("http://media.kapso.ai/file.jpg", env)).toBe(false);
    expect(isAllowedKapsoMediaUrl("https://127.0.0.1/secret", env)).toBe(false);
    expect(isAllowedKapsoMediaUrl("https://evil.example/x", env)).toBe(false);
  });

  it("allows configured allowlist hosts", () => {
    expect(
      isAllowedKapsoMediaUrl("https://cdn.partner.test/a.jpg", {
        KAPSO_MEDIA_HOST_ALLOWLIST: "cdn.partner.test",
      } as never),
    ).toBe(true);
  });
});
