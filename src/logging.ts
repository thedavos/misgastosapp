export function safeLog(event: string, data: Record<string, unknown> = {}) {
  try {
    console.log(JSON.stringify({ event, ...data }));
  } catch {
    console.log(`[${event}]`, data);
  }
}
