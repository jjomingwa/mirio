import { describe, expect, it } from "vitest";
import {
  advanceCrownRush,
  createCrownRushState,
  resetCrownRush,
} from "../src/game/systems/CrownRush";

describe("Crown Rush", () => {
  it("activates a directed burst and enters cooldown after its fixed duration", () => {
    let state = createCrownRushState();
    const start = advanceCrownRush(state, {
      now: 100,
      grounded: true,
      pressed: true,
      direction: 1,
    });
    state = start.state;

    expect(start.activation).toEqual({ direction: 1, speed: 390 });
    expect(state.phase).toBe("rushing");

    const end = advanceCrownRush(state, {
      now: 290,
      grounded: false,
      pressed: false,
      direction: 1,
    });
    expect(end.state.phase).toBe("cooldown");
  });

  it("allows one air burst and restores that charge only after landing", () => {
    let state = createCrownRushState();
    state = advanceCrownRush(state, {
      now: 10,
      grounded: false,
      pressed: true,
      direction: -1,
    }).state;
    state = advanceCrownRush(state, {
      now: 220,
      grounded: false,
      pressed: false,
      direction: -1,
    }).state;
    state = advanceCrownRush(state, {
      now: 820,
      grounded: false,
      pressed: true,
      direction: -1,
    }).state;

    expect(state.phase).toBe("ready");
    expect(state.airChargeAvailable).toBe(false);

    const landed = advanceCrownRush(state, {
      now: 830,
      grounded: true,
      pressed: false,
      direction: 0,
    });
    expect(landed.state.airChargeAvailable).toBe(true);
  });

  it("rejects repeated, directionless, and cooldown input without mutating progression", () => {
    const state = createCrownRushState();
    const directionless = advanceCrownRush(state, {
      now: 10,
      grounded: true,
      pressed: true,
      direction: 0,
    });
    const started = advanceCrownRush(state, {
      now: 10,
      grounded: true,
      pressed: true,
      direction: 1,
    });
    const repeated = advanceCrownRush(started.state, {
      now: 20,
      grounded: true,
      pressed: true,
      direction: 1,
    });

    expect(directionless.activation).toBeNull();
    expect(repeated.activation).toBeNull();
    expect(resetCrownRush()).toEqual(createCrownRushState());
  });
});
