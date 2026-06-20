import { describe, expect, it } from "vitest";

import { compareUsdc, divideUsdc, formatUsdcUnits, parseUsdc, sumUsdc } from "@/lib/domain/usdc";

describe("USDC amount arithmetic", () => {
  it("preserves all six USDC decimal places", () => {
    expect(parseUsdc("0.000001")).toBe(BigInt(1));
    expect(formatUsdcUnits(BigInt(1234567))).toBe("1.234567");
  });

  it("sums decimal facts without floating-point drift", () => {
    expect(sumUsdc(["0.1", "0.2", "0.000001"])).toBe("0.300001");
  });

  it("compares and divides normalized values", () => {
    expect(compareUsdc("1.000001", "1")).toBe(1);
    expect(divideUsdc("1", 3)).toBe("0.333333");
  });

  it("rejects negative values and excess precision", () => {
    expect(() => parseUsdc("-1")).toThrow("Invalid USDC amount");
    expect(() => parseUsdc("0.0000001")).toThrow("Invalid USDC amount");
  });
});
