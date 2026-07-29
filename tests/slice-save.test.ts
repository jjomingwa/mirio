import { describe, expect, it } from "vitest";
import {
  createDefaultSliceSave,
  normalizeSliceSave,
} from "../src/game/state/sliceSave";

describe("SliceSaveV2 Schema & Normalization (PLAN-005)", () => {
  it("creates a valid default v2 save state", () => {
    const save = createDefaultSliceSave();
    expect(save.version).toBe(2);
    expect(save.currentStageId).toBe("prologue");
    expect(save.completedStageIds).toEqual([]);
    expect(save.collectedShardIds).toEqual([]);
  });

  it("normalizes partial and duplicate save data without throwing", () => {
    const raw = {
      version: 2,
      currentStageId: "windmill-hill",
      completedStageIds: ["prologue", "prologue", "windmill-hill"],
      collectedShardIds: ["shard-1", "shard-1"],
      discoveredSecretIds: ["secret-vault"],
    };

    const save = normalizeSliceSave(raw);
    expect(save.currentStageId).toBe("windmill-hill");
    expect(save.completedStageIds).toEqual(["prologue", "windmill-hill"]);
    expect(save.collectedShardIds).toEqual(["shard-1"]);
    expect(save.discoveredSecretIds).toEqual(["secret-vault"]);
  });

  it("falls back to default save safely when given null or malformed data", () => {
    expect(normalizeSliceSave(null)).toEqual(createDefaultSliceSave());
    expect(normalizeSliceSave("corrupted string")).toEqual(
      createDefaultSliceSave(),
    );
    expect(normalizeSliceSave({ version: 999 })).toEqual(
      createDefaultSliceSave(),
    );
  });
});
