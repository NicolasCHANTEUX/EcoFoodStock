export function getOrCreateRequestId(candidate?: string | null) {
  const normalized = candidate?.trim();

  if (normalized && /^[a-zA-Z0-9_-]{8,128}$/.test(normalized)) {
    return normalized;
  }

  return crypto.randomUUID();
}
