export async function getApiErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof payload?.error === "string" && payload.error.trim() ? payload.error : fallback;
}
