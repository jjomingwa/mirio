export type BossPhase = "wind-chase" | "broken-mirror" | "crown-storm";

export type BossStatus =
  "intro" | "attacking" | "vulnerable" | "transition" | "defeated" | "shutdown";

export interface BossState {
  phase: BossPhase;
  health: number; // 6 to 0
  status: BossStatus;
  sealsHitInPhase: number; // 0 to 2
  telegraph?: string;
  isRedAttackActive: boolean;
}

export interface BossStepResult {
  state: BossState;
  events: string[];
}

export function createBossEncounterState(): BossState {
  return {
    phase: "wind-chase",
    health: 6,
    status: "intro",
    sealsHitInPhase: 0,
    telegraph: "바람의 추격: 이동하는 고리를 노리세요!",
    isRedAttackActive: false,
  };
}

export function advanceBossEncounter(
  state: BossState,
  action:
    | { type: "START" }
    | { type: "HIT_SEAL" }
    | { type: "TRIGGER_TELEGRAPH"; telegraph: string; isRed?: boolean }
    | { type: "RETRY_PHASE" }
    | { type: "SHUTDOWN" },
): BossStepResult {
  const events: string[] = [];
  const next = { ...state };

  if (action.type === "SHUTDOWN") {
    next.status = "shutdown";
    events.push("boss_shutdown");
    return { state: next, events };
  }

  if (state.status === "defeated" || state.status === "shutdown") {
    return { state, events };
  }

  switch (action.type) {
    case "START":
      next.status = "attacking";
      events.push("boss_started");
      break;

    case "TRIGGER_TELEGRAPH":
      next.telegraph = action.telegraph;
      next.isRedAttackActive = !!action.isRed;
      events.push(
        action.isRed ? "red_attack_telegraphed" : "normal_telegraphed",
      );
      break;

    case "HIT_SEAL":
      if (next.status !== "vulnerable" && next.status !== "attacking") break;

      next.health = Math.max(0, next.health - 1);
      next.sealsHitInPhase += 1;
      events.push(`seal_damaged_hp_${next.health}`);

      if (next.health === 0) {
        next.status = "defeated";
        events.push("boss_victory");
      } else if (next.sealsHitInPhase >= 2) {
        next.sealsHitInPhase = 0;
        next.status = "attacking";
        if (next.phase === "wind-chase") {
          next.phase = "broken-mirror";
          next.telegraph = "깨진 거울: 투사체를 반사 결전에 부딪히세요!";
        } else if (next.phase === "broken-mirror") {
          next.phase = "crown-storm";
          next.telegraph = "왕관 폭풍: 4연쇄 질주로 최종 봉인을 해제하세요!";
        }
        events.push(`transition_to_${next.phase}`);
      }
      break;

    case "RETRY_PHASE":
      next.status = "attacking";
      next.sealsHitInPhase = 0;
      next.isRedAttackActive = false;
      events.push(`retry_${next.phase}`);
      break;
  }

  return { state: next, events };
}
