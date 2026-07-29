import { describe, expect, it } from "vitest";

const lifecycleIntegrityModulePath = "../scripts/lib/lifecycle-integrity.mjs";
const { invalidateCompletedItem } = await import(lifecycleIntegrityModulePath);

describe("completed work-item invalidation", () => {
  it("returns a completed item to active while preserving its historical evidence", () => {
    const item = {
      id: "Q-008-HARNESS-EVIDENCE-INTEGRITY",
      status: "done",
      completed_at: "2026-07-29T00:00:00.000Z",
      evidence_ids: ["evidence.json"],
    };

    invalidateCompletedItem(item, {
      reason: "The independent review trust anchor is inside the checkout.",
      at: "2026-07-29T01:00:00.000Z",
    });

    expect(item).toMatchObject({
      status: "active",
      evidence_ids: ["evidence.json"],
      invalidations: [
        {
          reason: "The independent review trust anchor is inside the checkout.",
          invalidated_at: "2026-07-29T01:00:00.000Z",
        },
      ],
    });
    expect(item).not.toHaveProperty("completed_at");
  });

  it("refuses to invalidate an item that is not completed", () => {
    expect(() =>
      invalidateCompletedItem(
        { id: "Q-008", status: "review" },
        {
          reason: "Missing evidence.",
          at: "2026-07-29T01:00:00.000Z",
        },
      ),
    ).toThrow("only completed items can be invalidated");
  });
});
