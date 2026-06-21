export class RequestBodyTooLargeError extends Error {}
export class UnsupportedMediaTypeError extends Error {}
export class CrossSiteRequestError extends Error {}

function allowedOrigins(request: Request) {
  const origins = new Set([new URL(request.url).origin]);
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      origins.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
    } catch {
      // Deployment configuration validation reports malformed public URLs separately.
    }
  }
  return origins;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins(request).has(origin)) {
    throw new CrossSiteRequestError("Cross-site mutation requests are not allowed");
  }
}

export async function readJsonBody(
  request: Request,
  options: { maxBytes?: number; allowEmpty?: boolean } = {},
): Promise<unknown> {
  assertSameOrigin(request);
  const maxBytes = options.maxBytes ?? 64 * 1024;
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new UnsupportedMediaTypeError("Content-Type must be application/json");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError(`Request body exceeds ${maxBytes} bytes`);
  }
  if (!request.body) {
    if (options.allowEmpty) return {};
    throw new SyntaxError("Request body must be valid JSON");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError(`Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(chunk.value);
  }
  if (bytes === 0 && options.allowEmpty) return {};
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch (error) {
    if (error instanceof SyntaxError) throw error;
    throw new SyntaxError("Request body must be valid UTF-8 JSON");
  }
}
