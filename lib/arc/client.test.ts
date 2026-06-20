import { describe, expect, it } from "vitest";

import { demoArcAdapter, LiveArcAdapterUnavailableError } from "@/lib/arc/client";
import { DEMO_WALLET } from "@/lib/demo/mock-payments";

describe("demo Arc adapter boundaries", () => {
  it("serves only the declared deterministic demo wallet", async () => {
    await expect(demoArcAdapter.getAgentSummary(DEMO_WALLET)).resolves.toMatchObject({
      analysis: { source: "demo", isLive: false },
    });
    await expect(
      demoArcAdapter.getAgentSummary("0x0000000000000000000000000000000000000000"),
    ).rejects.toBeInstanceOf(LiveArcAdapterUnavailableError);
  });
});
