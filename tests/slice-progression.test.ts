import { describe, expect, it } from "vitest";
import {
  GOLDENWIND_STAGES,
  INK_FORTRESS_STAGE,
  PROLOGUE_STAGE,
  SLEEPING_CANOPY_STAGE,
  WINDMILL_HILL_STAGE,
} from "../src/game/data/slice/goldenwind";
import {
  validateAuthoredStage,
  validateStageSequence,
} from "../src/game/data/slice/validator";

describe("Authored Slice Progression & Graph Validation", () => {
  it("validates all Goldenwind Forest authored stages without issues", () => {
    const stages = Object.values(GOLDENWIND_STAGES);
    const issues = validateStageSequence(stages);
    expect(issues).toEqual([]);
  });

  it("verifies beat structure contains setup and payoff beats for every stage", () => {
    for (const stage of Object.values(GOLDENWIND_STAGES)) {
      const issues = validateAuthoredStage(stage);
      expect(issues).toEqual([]);
      expect(stage.sections.some((s) => s.purpose === "setup")).toBe(true);
      expect(stage.sections.some((s) => s.purpose === "payoff")).toBe(true);
    }
  });

  it("verifies stage graph exit links form a continuous reachability chain to boss-throne", () => {
    expect(PROLOGUE_STAGE.exit.targetStageId).toBe("windmill-hill");
    expect(WINDMILL_HILL_STAGE.exit.targetStageId).toBe("sleeping-canopy");
    expect(SLEEPING_CANOPY_STAGE.exit.targetStageId).toBe("ink-fortress");
    expect(INK_FORTRESS_STAGE.exit.targetStageId).toBe("boss-throne");
  });

  it("rejects stages with missing setup/payoff beats or broken exit references", () => {
    const invalidStage = {
      id: "invalid-stage" as any,
      title: "Invalid Stage",
      landmarkId: "windmill" as any,
      entry: { x: 0, y: 0 },
      exit: { x: 100, y: 0, targetStageId: "nonexistent-stage" as any },
      expectedMinutes: [1, 2] as [number, number],
      sections: [
        {
          id: "sec-1",
          purpose: "practice" as any,
          geometry: [],
          rushTargets: [],
          encounters: [],
          cues: [],
        },
      ],
    };

    const issues = validateStageSequence([invalidStage]);
    expect(issues.some((i) => i.code === "MISSING_SETUP_BEAT")).toBe(true);
    expect(issues.some((i) => i.code === "MISSING_PAYOFF_BEAT")).toBe(true);
    expect(issues.some((i) => i.code === "UNREACHABLE_NEXT_STAGE")).toBe(true);
  });
});
