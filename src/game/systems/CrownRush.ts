export const CROWN_RUSH_HOLD_MAX_MS = 450;
export const CROWN_RUSH_AIM_TIME_SCALE = 0.35;
export const CROWN_RUSH_TARGET_RANGE_PX = 220;
export const CROWN_RUSH_FREE_DISTANCE_PX = 150;
export const CROWN_RUSH_MAX_CHAINS = 4;
export const CROWN_RUSH_DURATION_MS = 180;
export const CROWN_RUSH_COOLDOWN_MS = 300;
export const CROWN_RUSH_REBOUND_MS = 120;
export const CROWN_RUSH_SPEED = 480;
export const CROWN_RUSH_CONE_ANGLE_DEG = 35;
export const CROWN_RUSH_ASSIST_CONE_ANGLE_DEG = 50;

export type CrownRushPhase =
  "ready" | "aiming" | "rushing" | "rebound" | "recovery" | "disabled";

export type RushTargetKind = "ring" | "enemy" | "crystal" | "boss-seal";

export interface RushTarget {
  id: string;
  kind: RushTargetKind;
  x: number;
  y: number;
  recharge: boolean;
  enabled: boolean;
}

export interface InputSnapshot {
  moveX: number;
  aimX: number;
  aimY: number;
  jumpPressed?: boolean;
  rushHeld: boolean;
  rushReleased: boolean;
}

export type RushCommandKind =
  | "set_time_scale"
  | "set_velocity"
  | "play_sfx"
  | "trigger_vfx"
  | "camera_cue"
  | "hit_target"
  | "clear_tint";

export interface RushCommand {
  kind: RushCommandKind;
  payload?: any;
}

export interface CrownRushState {
  phase: CrownRushPhase;
  phaseEndsAt: number;
  aimStartedAt: number;
  charges: number;
  chainCount: number;
  lastAimX: number;
  lastAimY: number;
  selectedTargetId: string | null;
  targetX: number | null;
  targetY: number | null;
  rushDirX: number;
  rushDirY: number;
}

export interface CrownRushContext {
  now: number;
  playerX: number;
  playerY: number;
  grounded: boolean;
  targets?: RushTarget[];
  aimAssistEnabled?: boolean;
}

export interface CrownRushStepResult {
  state: CrownRushState;
  commands: RushCommand[];
}

export function createCrownRushState(): CrownRushState {
  return {
    phase: "ready",
    phaseEndsAt: 0,
    aimStartedAt: 0,
    charges: 1,
    chainCount: 0,
    lastAimX: 1,
    lastAimY: 0,
    selectedTargetId: null,
    targetX: null,
    targetY: null,
    rushDirX: 0,
    rushDirY: 0,
  };
}

export function resetCrownRush(_reason = "manual"): CrownRushState {
  return createCrownRushState();
}

export function selectRushTarget(
  playerX: number,
  playerY: number,
  aimX: number,
  aimY: number,
  targets: RushTarget[],
  aimAssistEnabled = false,
): RushTarget | null {
  if (!targets || targets.length === 0) return null;

  let normAimX = aimX;
  let normAimY = aimY;
  const aimMag = Math.hypot(aimX, aimY);
  if (aimMag === 0) return null;
  normAimX /= aimMag;
  normAimY /= aimMag;

  const aimAngle = Math.atan2(normAimY, normAimX);
  const maxCone = aimAssistEnabled
    ? CROWN_RUSH_ASSIST_CONE_ANGLE_DEG
    : CROWN_RUSH_CONE_ANGLE_DEG;

  const candidates: { target: RushTarget; angleDiff: number; dist: number }[] =
    [];

  for (const t of targets) {
    if (!t.enabled) continue;
    const dx = t.x - playerX;
    const dy = t.y - playerY;
    const dist = Math.hypot(dx, dy);

    if (dist > CROWN_RUSH_TARGET_RANGE_PX) continue;

    const tAngle = Math.atan2(dy, dx);
    let diffRad = tAngle - aimAngle;
    while (diffRad > Math.PI) diffRad -= 2 * Math.PI;
    while (diffRad < -Math.PI) diffRad += 2 * Math.PI;
    const diffDeg = Math.abs((diffRad * 180) / Math.PI);

    if (diffDeg <= maxCone) {
      candidates.push({ target: t, angleDiff: diffDeg, dist });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (Math.abs(a.angleDiff - b.angleDiff) > 0.001) {
      return a.angleDiff - b.angleDiff;
    }
    if (Math.abs(a.dist - b.dist) > 0.001) {
      return a.dist - b.dist;
    }
    return a.target.id.localeCompare(b.target.id);
  });

  return candidates[0].target;
}

export function advanceCrownRush(
  previous: CrownRushState,
  input: InputSnapshot,
  context: CrownRushContext,
): CrownRushStepResult {
  const commands: RushCommand[] = [];
  const state: CrownRushState = { ...previous };

  if (context.grounded && state.phase === "ready") {
    state.charges = 1;
    state.chainCount = 0;
  }

  let aimX = input.aimX;
  let aimY = input.aimY;
  const mag = Math.hypot(aimX, aimY);
  if (mag > 0.1) {
    state.lastAimX = aimX / mag;
    state.lastAimY = aimY / mag;
  } else {
    aimX = state.lastAimX;
    aimY = state.lastAimY;
  }

  const selected = selectRushTarget(
    context.playerX,
    context.playerY,
    aimX,
    aimY,
    context.targets ?? [],
    context.aimAssistEnabled,
  );
  state.selectedTargetId = selected?.id ?? null;

  if (state.phase === "ready") {
    if (input.rushHeld && state.charges > 0) {
      state.phase = "aiming";
      state.aimStartedAt = context.now;
      commands.push({
        kind: "set_time_scale",
        payload: CROWN_RUSH_AIM_TIME_SCALE,
      });
      commands.push({ kind: "play_sfx", payload: "aim_start" });
    }
  } else if (state.phase === "aiming") {
    const timeInAim = context.now - state.aimStartedAt;
    const shouldLaunch =
      input.rushReleased || timeInAim >= CROWN_RUSH_HOLD_MAX_MS;

    if (shouldLaunch) {
      state.phase = "rushing";
      state.phaseEndsAt = context.now + CROWN_RUSH_DURATION_MS;

      let dirX = aimX;
      let dirY = aimY;

      if (selected) {
        const dx = selected.x - context.playerX;
        const dy = selected.y - context.playerY;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
          dirX = dx / dist;
          dirY = dy / dist;
        }
        state.targetX = selected.x;
        state.targetY = selected.y;
      } else {
        const dMag = Math.hypot(dirX, dirY);
        if (dMag > 0) {
          dirX /= dMag;
          dirY /= dMag;
        } else {
          dirX = state.lastAimX;
          dirY = state.lastAimY;
        }
        state.targetX = context.playerX + dirX * CROWN_RUSH_FREE_DISTANCE_PX;
        state.targetY = context.playerY + dirY * CROWN_RUSH_FREE_DISTANCE_PX;
      }

      state.rushDirX = dirX;
      state.rushDirY = dirY;
      state.charges = Math.max(0, state.charges - 1);

      commands.push({ kind: "set_time_scale", payload: 1.0 });
      commands.push({
        kind: "set_velocity",
        payload: { x: dirX * CROWN_RUSH_SPEED, y: dirY * CROWN_RUSH_SPEED },
      });
      commands.push({ kind: "play_sfx", payload: "crown_rush" });
      commands.push({ kind: "trigger_vfx", payload: "dash_trail" });
    }
  } else if (state.phase === "rushing") {
    if (context.now >= state.phaseEndsAt) {
      state.phase = "recovery";
      state.phaseEndsAt = context.now + CROWN_RUSH_COOLDOWN_MS;
      commands.push({ kind: "set_time_scale", payload: 1.0 });
      commands.push({ kind: "clear_tint" });
    }
  } else if (state.phase === "rebound") {
    if (context.now >= state.phaseEndsAt) {
      state.phase = "ready";
      state.phaseEndsAt = 0;
    }
  } else if (state.phase === "recovery") {
    if (context.now >= state.phaseEndsAt) {
      state.phase = "ready";
      state.phaseEndsAt = 0;
    }
  }

  return { state, commands };
}

export function notifyTargetHit(
  previous: CrownRushState,
  target: RushTarget,
  now: number,
): CrownRushStepResult {
  const commands: RushCommand[] = [];
  const state = { ...previous };

  if (state.phase !== "rushing") return { state, commands };

  commands.push({ kind: "hit_target", payload: target.id });

  if (target.recharge) {
    if (state.chainCount < CROWN_RUSH_MAX_CHAINS) {
      state.chainCount += 1;
      state.charges = 1;
    }
    state.phase = "rebound";
    state.phaseEndsAt = now + CROWN_RUSH_REBOUND_MS;
    commands.push({ kind: "play_sfx", payload: "target_hit" });
    commands.push({ kind: "trigger_vfx", payload: "burst_ring" });
    commands.push({ kind: "set_time_scale", payload: 1.0 });
  } else {
    state.phase = "recovery";
    state.phaseEndsAt = now + CROWN_RUSH_COOLDOWN_MS;
    commands.push({ kind: "set_time_scale", payload: 1.0 });
    commands.push({ kind: "clear_tint" });
  }

  return { state, commands };
}
