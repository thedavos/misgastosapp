export function normalizeText(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
