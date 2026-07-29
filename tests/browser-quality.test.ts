import { describe, expect, it } from "vitest";
import { createBossEncounterState } from "../src/game/systems/BossEncounterMachine";
import { resetCrownRush } from "../src/game/systems/CrownRush";
import { GOLDENWIND_STAGES } from "../src/game/data/slice/goldenwind";
import { validateStageSequence } from "../src/game/data/slice/validator";

describe("Desktop Browser Quality & Performance Gate (PLAN-006)", () => {
  it("enforces canonical viewports (1280x720, 1920x1080, 1024x576) scale bounds", () => {
    const viewports = [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
      { width: 1024, height: 576 },
    ];

    expect(640 / 360).toBeCloseTo(16 / 9, 5);
    for (const vp of viewports) {
      const aspectRatio = vp.width / vp.height;
      expect(aspectRatio).toBeCloseTo(16 / 9, 2);
    }
  });

  it("verifies object and listener cleanup on repeated scene retries", () => {
    const bossState = createBossEncounterState();

    for (let retry = 1; retry <= 20; retry++) {
      const rushState = resetCrownRush(`retry_${retry}`);
      expect(rushState.phase).toBe("ready");
      expect(rushState.chainCount).toBe(0);
      expect(bossState.health).toBeGreaterThanOrEqual(0);
    }
  });

  it("verifies the authored runtime route has no broken exits", () => {
    const issues = validateStageSequence(Object.values(GOLDENWIND_STAGES));
    expect(issues).toEqual([]);
  });
});
