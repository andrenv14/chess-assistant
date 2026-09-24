export type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY = /authorization|api.?key|secret|token|prompt|fen/i;

function redact(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : value]),
  );
}

/** Emit a single-line browser log with stable event names and secret redaction. */
export function logEvent(
  level: LogLevel,
  event: string,
  data: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...redact(data),
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
}
