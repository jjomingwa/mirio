import type { AuthoredSliceStage, SliceStageId } from "./types";

export const PROLOGUE_STAGE: AuthoredSliceStage = {
  id: "prologue",
  title: "여우 전령과 왕관의 서막",
  landmarkId: "windmill",
  entry: { x: 80, y: 220 },
  exit: { x: 900, y: 220, targetStageId: "windmill-hill" },
  expectedMinutes: [1, 2],
  sections: [
    {
      id: "prologue-setup",
      purpose: "setup",
      checkpoint: { x: 80, y: 220 },
      geometry: [{ x: 40, y: 240, width: 400 }],
      rushTargets: [],
      encounters: [],
      cues: [
        {
          id: "c1",
          type: "text",
          message: "여우 전령이 왕관의 빛을 따라 발걸음을 옮깁니다.",
        },
      ],
    },
    {
      id: "prologue-payoff",
      purpose: "payoff",
      geometry: [{ x: 460, y: 240, width: 500 }],
      rushTargets: [],
      encounters: [],
      cues: [
        {
          id: "c2",
          type: "text",
          message: "먹빛 균열이 숲의 관문을 덮쳐옵니다.",
        },
      ],
    },
  ],
};

export const WINDMILL_HILL_STAGE: AuthoredSliceStage = {
  id: "windmill-hill",
  title: "1장: 바람개비 언덕",
  landmarkId: "windmill",
  entry: { x: 80, y: 220 },
  exit: { x: 1400, y: 220, targetStageId: "sleeping-canopy" },
  expectedMinutes: [10, 15],
  shardId: "shard-1",
  sections: [
    {
      id: "wh-setup",
      purpose: "setup",
      checkpoint: { x: 80, y: 220 },
      geometry: [{ x: 40, y: 240, width: 300 }],
      rushTargets: [],
      encounters: [],
      cues: [
        {
          id: "wh1",
          type: "text",
          message: "방향을 잡고 질주(SHIFT/X)를 누르면 순간 돌진합니다.",
        },
      ],
    },
    {
      id: "wh-practice",
      purpose: "practice",
      geometry: [{ x: 360, y: 240, width: 300 }],
      rushTargets: [
        { id: "wh-ring-1", kind: "ring", x: 480, y: 180, recharge: true },
      ],
      encounters: [{ id: "op-1", type: "opossum", x: 550, y: 220 }],
      cues: [],
    },
    {
      id: "wh-development",
      purpose: "development",
      checkpoint: { x: 680, y: 220 },
      geometry: [{ x: 680, y: 240, width: 350 }],
      rushTargets: [
        { id: "wh-ring-2", kind: "ring", x: 800, y: 160, recharge: true },
      ],
      encounters: [{ id: "frog-1", type: "frog", x: 880, y: 220 }],
      cues: [],
    },
    {
      id: "wh-discovery",
      purpose: "discovery",
      optionalRoute: true,
      geometry: [{ x: 1040, y: 160, width: 160, oneWay: true }],
      rushTargets: [
        { id: "wh-ring-shard", kind: "ring", x: 1100, y: 100, recharge: true },
      ],
      encounters: [],
      cues: [{ id: "wh-shard-cue", type: "text", message: "왕관 조각 획득!" }],
    },
    {
      id: "wh-payoff",
      purpose: "payoff",
      geometry: [{ x: 1220, y: 240, width: 250 }],
      rushTargets: [],
      encounters: [],
      cues: [],
    },
  ],
};

export const SLEEPING_CANOPY_STAGE: AuthoredSliceStage = {
  id: "sleeping-canopy",
  title: "2장: 잠든 수관",
  landmarkId: "canopy",
  entry: { x: 80, y: 220 },
  exit: { x: 1600, y: 220, targetStageId: "ink-fortress" },
  expectedMinutes: [12, 18],
  shardId: "shard-2",
  secretId: "secret-canopy-vault",
  sections: [
    {
      id: "sc-setup",
      purpose: "setup",
      checkpoint: { x: 80, y: 220 },
      geometry: [{ x: 40, y: 240, width: 300 }],
      rushTargets: [],
      encounters: [],
      cues: [
        {
          id: "sc1",
          type: "text",
          message: "수관 위 거울 결정을 이용해 질주 방향을 전환하세요.",
        },
      ],
    },
    {
      id: "sc-twist",
      purpose: "twist",
      geometry: [
        { x: 360, y: 240, width: 400 }, // safe lower route
        { x: 360, y: 140, width: 300, oneWay: true }, // chain upper route
      ],
      rushTargets: [
        { id: "crystal-1", kind: "crystal", x: 500, y: 100, recharge: true },
        { id: "ring-sc-1", kind: "ring", x: 620, y: 100, recharge: true },
      ],
      encounters: [{ id: "eagle-1", type: "eagle", x: 550, y: 160 }],
      cues: [],
    },
    {
      id: "sc-discovery",
      purpose: "discovery",
      optionalRoute: true,
      geometry: [{ x: 800, y: 100, width: 200 }],
      rushTargets: [
        { id: "crystal-shard", kind: "crystal", x: 880, y: 60, recharge: true },
      ],
      encounters: [],
      cues: [
        {
          id: "secret-cue",
          type: "text",
          message: "비밀 방 발견: 왕관의 보물고",
        },
      ],
    },
    {
      id: "sc-payoff",
      purpose: "payoff",
      geometry: [{ x: 1400, y: 240, width: 300 }],
      rushTargets: [],
      encounters: [],
      cues: [],
    },
  ],
};

export const INK_FORTRESS_STAGE: AuthoredSliceStage = {
  id: "ink-fortress",
  title: "3장: 먹빛 성채",
  landmarkId: "fortress",
  entry: { x: 80, y: 220 },
  exit: { x: 1800, y: 220, targetStageId: "boss-throne" },
  expectedMinutes: [15, 20],
  shardId: "shard-3",
  sections: [
    {
      id: "if-setup",
      purpose: "setup",
      checkpoint: { x: 80, y: 220 },
      geometry: [{ x: 40, y: 240, width: 300 }],
      rushTargets: [],
      encounters: [],
      cues: [
        {
          id: "if1",
          type: "text",
          message: "성채의 파수병과 고리를 연속 4회 연쇄하여 봉인을 푸세요.",
        },
      ],
    },
    {
      id: "if-development",
      purpose: "development",
      geometry: [{ x: 360, y: 240, width: 500 }],
      rushTargets: [
        { id: "if-ring-1", kind: "ring", x: 450, y: 180, recharge: true },
        { id: "if-enemy-1", kind: "enemy", x: 580, y: 140, recharge: true },
        { id: "if-ring-2", kind: "ring", x: 700, y: 180, recharge: true },
      ],
      encounters: [{ id: "ghost-1", type: "ghost", x: 580, y: 140 }],
      cues: [],
    },
    {
      id: "if-discovery",
      purpose: "discovery",
      optionalRoute: true,
      geometry: [{ x: 900, y: 120, width: 220 }],
      rushTargets: [
        {
          id: "if-seal-shard",
          kind: "boss-seal",
          x: 1000,
          y: 80,
          recharge: true,
        },
      ],
      encounters: [],
      cues: [
        { id: "if-shortcut-cue", type: "text", message: "숙련자 지름길 개척!" },
      ],
    },
    {
      id: "if-payoff",
      purpose: "payoff",
      geometry: [{ x: 1600, y: 240, width: 300 }],
      rushTargets: [],
      encounters: [],
      cues: [
        {
          id: "boss-unlocked-cue",
          type: "text",
          message: "부서진 왕좌의 결계가 해제되었습니다!",
        },
      ],
    },
  ],
};

export const GOLDENWIND_STAGES: Record<SliceStageId, AuthoredSliceStage> = {
  prologue: PROLOGUE_STAGE,
  "windmill-hill": WINDMILL_HILL_STAGE,
  "sleeping-canopy": SLEEPING_CANOPY_STAGE,
  "ink-fortress": INK_FORTRESS_STAGE,
};
