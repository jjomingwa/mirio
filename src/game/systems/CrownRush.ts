export const CROWN_RUSH_DURATION_MS = 180;
export const CROWN_RUSH_COOLDOWN_MS = 560;
export const CROWN_RUSH_SPEED = 390;

export type CrownRushPhase = "ready" | "rushing" | "cooldown";

export interface CrownRushState {
  phase: CrownRushPhase;
  phaseEndsAt: number;
  airChargeAvailable: boolean;
}

export interface CrownRushInput {
  now: number;
  grounded: boolean;
  pressed: boolean;
  direction: -1 | 0 | 1;
}

export interface CrownRushActivation {
  direction: -1 | 1;
  speed: number;
}

export interface CrownRushStep {
  state: CrownRushState;
  activation: CrownRushActivation | null;
}

export function createCrownRushState(): CrownRushState {
  return { phase: "ready", phaseEndsAt: 0, airChargeAvailable: true };
}

export function resetCrownRush(): CrownRushState {
  return createCrownRushState();
}

export function advanceCrownRush(
  previous: CrownRushState,
  input: CrownRushInput,
): CrownRushStep {
  let state = { ...previous };
  if (input.grounded) state.airChargeAvailable = true;

  if (state.phase === "rushing" && input.now >= state.phaseEndsAt) {
    state = {
      ...state,
      phase: "cooldown",
      phaseEndsAt: input.now + CROWN_RUSH_COOLDOWN_MS,
    };
  }
  if (state.phase === "cooldown" && input.now >= state.phaseEndsAt) {
    state = { ...state, phase: "ready", phaseEndsAt: 0 };
  }

  const canActivate =
    state.phase === "ready" &&
    input.pressed &&
    input.direction !== 0 &&
    (input.grounded || state.airChargeAvailable);
  if (!canActivate) return { state, activation: null };

  if (!input.grounded) state.airChargeAvailable = false;
  state = {
    ...state,
    phase: "rushing",
    phaseEndsAt: input.now + CROWN_RUSH_DURATION_MS,
  };
  return {
    state,
    activation: {
      direction: input.direction === -1 ? -1 : 1,
      speed: CROWN_RUSH_SPEED,
    },
  };
}
