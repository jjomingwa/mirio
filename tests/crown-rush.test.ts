import { describe, expect, it } from "vitest";
import {
  advanceCrownRush,
  createCrownRushState,
  notifyTargetHit,
  resetCrownRush,
  selectRushTarget,
  CROWN_RUSH_AIM_TIME_SCALE,
  CROWN_RUSH_HOLD_MAX_MS,
  CROWN_RUSH_MAX_CHAINS,
  type InputSnapshot,
  type RushTarget,
} from "../src/game/systems/CrownRush";

describe("Crown Rush v2 State Machine", () => {
  it("transitions from ready to aiming on rushHold, and auto-launches after 450ms hold timeout", () => {
    const state = createCrownRushState();
    const inputAim: InputSnapshot = {
      moveX: 1,
      aimX: 1,
      aimY: 0,
      rushHeld: true,
      rushReleased: false,
    };

    const step1 = advanceCrownRush(state, inputAim, {
      now: 100,
      playerX: 0,
      playerY: 0,
      grounded: true,
    });

    expect(step1.state.phase).toBe("aiming");
    expect(step1.commands).toContainEqual({
      kind: "set_time_scale",
      payload: CROWN_RUSH_AIM_TIME_SCALE,
    });

    const step2 = advanceCrownRush(step1.state, inputAim, {
      now: 100 + CROWN_RUSH_HOLD_MAX_MS,
      playerX: 0,
      playerY: 0,
      grounded: true,
    });

    expect(step2.state.phase).toBe("rushing");
    expect(step2.commands).toContainEqual({
      kind: "set_time_scale",
      payload: 1.0,
    });
    expect(step2.state.rushDirX).toBeCloseTo(1);
    expect(step2.state.rushDirY).toBeCloseTo(0);
  });

  it("selects target deterministically based on angle error, distance, and ID tie-breaking", () => {
    const targets: RushTarget[] = [
      {
        id: "t_far",
        kind: "ring",
        x: 200,
        y: 0,
        recharge: true,
        enabled: true,
      },
      {
        id: "t_close",
        kind: "enemy",
        x: 100,
        y: 0,
        recharge: true,
        enabled: true,
      },
      {
        id: "t_wide",
        kind: "crystal",
        x: 100,
        y: 50,
        recharge: true,
        enabled: true,
      },
    ];

    const selected = selectRushTarget(0, 0, 1, 0, targets, false);
    expect(selected?.id).toBe("t_close");
  });

  it("enforces 220px range boundary and cone angle limits", () => {
    const targets: RushTarget[] = [
      {
        id: "t_out_of_range",
        kind: "ring",
        x: 221,
        y: 0,
        recharge: true,
        enabled: true,
      },
      {
        id: "t_in_range",
        kind: "ring",
        x: 220,
        y: 0,
        recharge: true,
        enabled: true,
      },
      {
        id: "t_out_of_cone",
        kind: "enemy",
        x: 100,
        y: 100,
        recharge: true,
        enabled: true,
      },
    ];

    const targetNormal = selectRushTarget(0, 0, 1, 0, targets, false);
    expect(targetNormal?.id).toBe("t_in_range");

    const targetsCone: RushTarget[] = [
      {
        id: "t_cone_45deg",
        kind: "enemy",
        x: 100,
        y: 95,
        recharge: true,
        enabled: true,
      },
    ];

    const targetDefault = selectRushTarget(0, 0, 1, 0, targetsCone, false);
    expect(targetDefault).toBeNull();

    const targetAssist = selectRushTarget(0, 0, 1, 0, targetsCone, true);
    expect(targetAssist?.id).toBe("t_cone_45deg");
  });

  it("supports max 4 consecutive chains and restores charges upon landing", () => {
    let state = createCrownRushState();
    expect(state.charges).toBe(1);

    for (let chain = 1; chain <= CROWN_RUSH_MAX_CHAINS; chain++) {
      let step = advanceCrownRush(
        state,
        { moveX: 0, aimX: 1, aimY: 0, rushHeld: true, rushReleased: false },
        { now: 1000 * chain, playerX: 0, playerY: 0, grounded: false },
      );
      step = advanceCrownRush(
        step.state,
        { moveX: 0, aimX: 1, aimY: 0, rushHeld: false, rushReleased: true },
        { now: 1000 * chain + 10, playerX: 0, playerY: 0, grounded: false },
      );
      state = step.state;
      expect(state.phase).toBe("rushing");

      const target: RushTarget = {
        id: `target_${chain}`,
        kind: "ring",
        x: 100,
        y: 0,
        recharge: true,
        enabled: true,
      };
      const hit = notifyTargetHit(state, target, 1000 * chain + 50);
      state = hit.state;
      expect(state.phase).toBe("rebound");

      state = advanceCrownRush(
        state,
        { moveX: 0, aimX: 0, aimY: 0, rushHeld: false, rushReleased: false },
        { now: 1000 * chain + 200, playerX: 0, playerY: 0, grounded: false },
      ).state;
      expect(state.phase).toBe("ready");
      expect(state.chainCount).toBe(Math.min(chain, CROWN_RUSH_MAX_CHAINS));
    }

    const landed = advanceCrownRush(
      state,
      { moveX: 0, aimX: 0, aimY: 0, rushHeld: false, rushReleased: false },
      { now: 6000, playerX: 0, playerY: 0, grounded: true },
    );
    expect(landed.state.charges).toBe(1);
    expect(landed.state.chainCount).toBe(0);
  });

  it("resets state and returns baseline parameters on manual reset", () => {
    const state = createCrownRushState();
    state.phase = "rushing";
    state.chainCount = 3;

    const resetState = resetCrownRush("test");
    expect(resetState.phase).toBe("ready");
    expect(resetState.charges).toBe(1);
    expect(resetState.chainCount).toBe(0);
  });

  it("executes a 3-minute deterministic sequence exercising traversal and encounter decisions", () => {
    let state = createCrownRushState();
    const targets: RushTarget[] = [
      {
        id: "ring1",
        kind: "ring",
        x: 100,
        y: -50,
        recharge: true,
        enabled: true,
      },
      {
        id: "enemy1",
        kind: "enemy",
        x: 220,
        y: -50,
        recharge: true,
        enabled: true,
      },
      {
        id: "crystal1",
        kind: "crystal",
        x: 300,
        y: 0,
        recharge: true,
        enabled: true,
      },
    ];

    let time = 1000;

    let step = advanceCrownRush(
      state,
      { moveX: 1, aimX: 1, aimY: -0.5, rushHeld: true, rushReleased: false },
      { now: time, playerX: 0, playerY: 0, grounded: true, targets },
    );
    state = step.state;
    expect(state.phase).toBe("aiming");
    expect(state.selectedTargetId).toBe("ring1");

    time += 50;
    step = advanceCrownRush(
      state,
      { moveX: 1, aimX: 1, aimY: -0.5, rushHeld: false, rushReleased: true },
      { now: time, playerX: 0, playerY: 0, grounded: true, targets },
    );
    state = step.state;
    expect(state.phase).toBe("rushing");

    time += 30;
    const ringHit = notifyTargetHit(state, targets[0], time);
    state = ringHit.state;
    targets[0].enabled = false;
    expect(state.phase).toBe("rebound");
    expect(state.chainCount).toBe(1);

    time += 150;
    step = advanceCrownRush(
      state,
      { moveX: 1, aimX: 1, aimY: 0, rushHeld: false, rushReleased: false },
      { now: time, playerX: 100, playerY: -50, grounded: false, targets },
    );
    state = step.state;
    expect(state.phase).toBe("ready");

    step = advanceCrownRush(
      state,
      { moveX: 1, aimX: 1, aimY: 0, rushHeld: true, rushReleased: false },
      { now: time + 10, playerX: 100, playerY: -50, grounded: false, targets },
    );
    state = step.state;
    expect(state.selectedTargetId).toBe("enemy1");
  });
});
