import { describe, expect, it } from "vitest";

import {
  CrossSiteRequestError,
  RequestBodyTooLargeError,
  UnsupportedMediaTypeError,
  readJsonBody,
} from "@/lib/application/request-security";

describe("request security", () => {
  it("parses bounded same-origin JSON", async () => {
    const request = new Request("https://cfo.example.com/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://cfo.example.com" },
      body: JSON.stringify({ name: "Research" }),
    });
    await expect(readJsonBody(request)).resolves.toEqual({ name: "Research" });
  });

  it("rejects oversized streamed bodies even without Content-Length", async () => {
    const request = new Request("https://cfo.example.com/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(100) }),
    });
    await expect(readJsonBody(request, { maxBytes: 32 })).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("rejects non-JSON and cross-site mutation requests", async () => {
    await expect(
      readJsonBody(
        new Request("https://cfo.example.com/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "{}",
        }),
      ),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
    await expect(
      readJsonBody(
        new Request("https://cfo.example.com/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
          body: "{}",
        }),
      ),
    ).rejects.toBeInstanceOf(CrossSiteRequestError);
  });

  it("allows an explicitly empty JSON body only when requested", async () => {
    const request = new Request("https://cfo.example.com/api/risks/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    await expect(readJsonBody(request, { allowEmpty: true })).resolves.toEqual({});
  });
});
