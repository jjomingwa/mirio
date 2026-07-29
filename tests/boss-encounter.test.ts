import { describe, expect, it } from "vitest";
import {
  advanceBossEncounter,
  createBossEncounterState,
} from "../src/game/systems/BossEncounterMachine";

describe("Ink Warden Boss Encounter Machine (PLAN-005)", () => {
  it("starts at wind-chase phase with 6 HP and advances through 3 phases on 6 seal hits", () => {
    let state = createBossEncounterState();
    expect(state.phase).toBe("wind-chase");
    expect(state.health).toBe(6);

    state = advanceBossEncounter(state, { type: "START" }).state;
    expect(state.status).toBe("attacking");

    // Phase 1: 2 hits
    state = advanceBossEncounter(state, { type: "HIT_SEAL" }).state;
    expect(state.health).toBe(5);
    state = advanceBossEncounter(state, { type: "HIT_SEAL" }).state;
    expect(state.health).toBe(4);
    expect(state.phase).toBe("broken-mirror");

    // Phase 2: 2 hits
    state = advanceBossEncounter(state, { type: "HIT_SEAL" }).state;
    expect(state.health).toBe(3);
    state = advanceBossEncounter(state, { type: "HIT_SEAL" }).state;
    expect(state.health).toBe(2);
    expect(state.phase).toBe("crown-storm");

    // Phase 3: 2 hits -> Defeated
    state = advanceBossEncounter(state, { type: "HIT_SEAL" }).state;
    expect(state.health).toBe(1);
    state = advanceBossEncounter(state, { type: "HIT_SEAL" }).state;
    expect(state.health).toBe(0);
    expect(state.status).toBe("defeated");
  });

  it("handles red attack telegraphs and phase retries deterministically", () => {
    let state = createBossEncounterState();
    state = advanceBossEncounter(state, { type: "START" }).state;

    state = advanceBossEncounter(state, {
      type: "TRIGGER_TELEGRAPH",
      telegraph: "WARNING: Red Wave!",
      isRed: true,
    }).state;
    expect(state.isRedAttackActive).toBe(true);

    const retry = advanceBossEncounter(state, { type: "RETRY_PHASE" }).state;
    expect(retry.status).toBe("attacking");
    expect(retry.isRedAttackActive).toBe(false);
    expect(retry.sealsHitInPhase).toBe(0);
  });

  it("handles shutdown cleanly and ignores duplicate actions after defeat", () => {
    const state = createBossEncounterState();
    state.status = "defeated";
    state.health = 0;

    const res = advanceBossEncounter(state, { type: "HIT_SEAL" });
    expect(res.state.health).toBe(0);
    expect(res.events).toEqual([]);
  });
});
