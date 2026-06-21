import { afterEach, describe, expect, it, vi } from "vitest";

import { logError } from "@/lib/operations/logger";

describe("structured logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("emits searchable JSON without production stack traces", () => {
    vi.stubEnv("NODE_ENV", "production");
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("api.failed", new Error("safe message"), { requestId: "request-1" });

    expect(write).toHaveBeenCalledOnce();
    const record = JSON.parse(String(write.mock.calls[0][0])) as Record<string, unknown>;
    expect(record).toMatchObject({ level: "error", event: "api.failed", requestId: "request-1" });
    expect(record.error).toEqual({ name: "Error", message: "safe message" });
  });
});
