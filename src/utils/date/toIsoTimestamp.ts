export function toIsoTimestamp(timestamp: unknown): string {
  if (typeof timestamp === "string" && timestamp.length > 0) return timestamp;
  if (typeof timestamp === "number") return new Date(timestamp * 1000).toISOString();
  return new Date().toISOString();
}
