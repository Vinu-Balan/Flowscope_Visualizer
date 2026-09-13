const SENSITIVE_KEY_PATTERN = /password|secret|token|credential|authorization|api[-_]?key/i;

/**
 * Recursively replaces values whose key looks sensitive (password, token,
 * secret, credential, authorization, api key, ...) with a fixed placeholder.
 * Applied to every log call's metadata — see docs/CODING_GUIDELINES.md
 * ("never log credentials, tokens, secrets, or personal data").
 */
export function redact<T>(meta: T): T {
  if (meta === null || typeof meta !== 'object') {
    return meta;
  }
  if (Array.isArray(meta)) {
    return meta.map((item: unknown) => redact(item)) as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redact(value);
  }
  return result as T;
}
