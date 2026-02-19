type LogContext = Record<string, unknown>;

type SanitizeOptions = {
  maxDepth?: number;
  redactedLabel?: string;
  revealLast?: number;
};

function sanitizeValue(
  value: unknown,
  keyHint: string | undefined,
  seen: WeakSet<object>,
  depth: number,
  options: Required<SanitizeOptions>,
): unknown {
  const { maxDepth } = options;
  if (depth > maxDepth) return "[truncated]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (keyHint && isSensitiveKey(keyHint)) return redact(value, options);
    return value;
  }

  if (typeof value !== "object") return value;

  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeValue(item, keyHint, seen, depth + 1, options),
    );
  }

  const output: LogContext = {};
  for (const [key, child] of Object.entries(value as LogContext)) {
    if (isSensitiveKey(key)) {
      output[key] = typeof child === "string" ? redact(child, options) : options.redactedLabel;
    } else {
      output[key] = sanitizeValue(child, key, seen, depth + 1, options);
    }
  }
  return output;
}

function redact(value: string, options: Required<SanitizeOptions>) {
  const { redactedLabel, revealLast } = options;
  if (value.length <= revealLast) return redactedLabel;
  return `${redactedLabel}${value.slice(-revealLast)}`;
}

const REDACTED_KEY_PATTERNS: RegExp[] = [
  /token/i,
  /password/i,
  /authorization/i,
  /secret/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /client[_-]?secret/i,
];

function isSensitiveKey(key: string) {
  return REDACTED_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitize(input: LogContext, options: SanitizeOptions = {}): LogContext {
  const resolved: Required<SanitizeOptions> = {
    maxDepth: options.maxDepth ?? 4,
    redactedLabel: options.redactedLabel ?? "[redacted]",
    revealLast: options.revealLast ?? 4,
  };
  return sanitizeValue(input, undefined, new WeakSet(), 0, resolved) as LogContext;
}

export { sanitize };
export type { LogContext, SanitizeOptions };
