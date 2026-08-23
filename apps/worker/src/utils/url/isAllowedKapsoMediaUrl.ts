import type { WorkerEnv } from "types/env";
import { normalizeBaseUrl } from "@/utils/url/normalizeBaseUrl";

const DEFAULT_KAPSO_MEDIA_HOSTS = ["api.kapso.ai", "media.kapso.ai"] as const;

function collectAllowedHosts(env: WorkerEnv): Set<string> {
  const hosts = new Set<string>(DEFAULT_KAPSO_MEDIA_HOSTS);

  const baseUrl = normalizeBaseUrl(env.KAPSO_API_BASE_URL);
  if (baseUrl) {
    try {
      hosts.add(new URL(baseUrl).hostname.toLowerCase());
    } catch {
      // ignore malformed base URL
    }
  }

  const configured = env.KAPSO_MEDIA_HOST_ALLOWLIST;
  if (configured) {
    for (const rawHost of configured.split(",")) {
      const host = rawHost.trim().toLowerCase();
      if (host) hosts.add(host);
    }
  }

  return hosts;
}

export function isAllowedKapsoMediaUrl(url: string, env: WorkerEnv): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    return false;
  }

  return collectAllowedHosts(env).has(hostname);
}
