import { z } from "zod";
import { ALL_NODES, getNode, getWorldForNode } from "../data/worlds";
import { WORLD_IDS, type WorldId } from "../data/types";

const STORAGE_KEY = "crowntrail-save-v1";

export const CROWN_PIECE_INDEXES = [0, 1, 2] as const;
export const CROWNS_PER_STAGE = CROWN_PIECE_INDEXES.length;
export const CAMPAIGN_CROWN_MAX = ALL_NODES.length * CROWNS_PER_STAGE;

export const SettingsSchema = z.object({
  musicVolume: z.number().min(0).max(1).default(0.68),
  sfxVolume: z.number().min(0).max(1).default(0.82),
  reducedMotion: z.boolean().default(false),
  reducedFlash: z.boolean().default(false),
  screenShake: z.boolean().default(true),
  touchControls: z.boolean().default(false),
});

const SaveSchema = z.object({
  version: z.literal(1),
  currentNodeId: z.string(),
  unlockedNodeIds: z.array(z.string()),
  clearedNodeIds: z.array(z.string()),
  secretExitNodeIds: z.array(z.string()),
  unlockedWorldIds: z.array(z.enum(WORLD_IDS)),
  crownPieces: z.record(
    z.string(),
    z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(CROWNS_PER_STAGE - 1),
      )
      .max(CROWNS_PER_STAGE),
  ),
  bestTimes: z.record(z.string(), z.number().positive()),
  lives: z.number().int().min(0).max(99),
  coins: z.number().int().min(0).max(9999),
  totalCrowns: z.number().int().min(0).max(CAMPAIGN_CROWN_MAX),
  settings: SettingsSchema,
});

const StoredSaveSchema = SaveSchema.omit({
  crownPieces: true,
  totalCrowns: true,
}).extend({
  crownPieces: z.record(z.string(), z.array(z.unknown()).catch([])).catch({}),
  totalCrowns: z.unknown().optional(),
});

export type GameSettings = z.infer<typeof SettingsSchema>;
export type GameSave = z.infer<typeof SaveSchema>;

export interface StageResult {
  exit: "normal" | "secret";
  crowns: number[];
  elapsedSeconds: number;
  coins: number;
}

function normalizeCrownIndexes(values: readonly unknown[]): number[] {
  const validIndexes = new Set<number>(CROWN_PIECE_INDEXES);
  return Array.from(
    new Set(
      values.filter(
        (value): value is number =>
          typeof value === "number" &&
          Number.isInteger(value) &&
          validIndexes.has(value),
      ),
    ),
  ).sort((left, right) => left - right);
}

function normalizeSave(storedSave: z.infer<typeof StoredSaveSchema>): GameSave {
  const crownPieces: Record<string, number[]> = {};

  for (const stage of ALL_NODES) {
    const indexes = normalizeCrownIndexes(
      storedSave.crownPieces[stage.id] ?? [],
    );
    if (indexes.length > 0) crownPieces[stage.id] = indexes;
  }

  const totalCrowns = Object.values(crownPieces).reduce(
    (total, indexes) => total + indexes.length,
    0,
  );

  return SaveSchema.parse({
    ...storedSave,
    crownPieces,
    totalCrowns,
  });
}

export function createDefaultSave(): GameSave {
  return {
    version: 1,
    currentNodeId: "1-1",
    unlockedNodeIds: ["1-1"],
    clearedNodeIds: [],
    secretExitNodeIds: [],
    unlockedWorldIds: ["w1"],
    crownPieces: {},
    bestTimes: {},
    lives: 5,
    coins: 0,
    totalCrowns: 0,
    settings: SettingsSchema.parse({}),
  };
}

export function loadSave(): GameSave {
  if (typeof localStorage === "undefined") return createDefaultSave();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSave();
    return normalizeSave(StoredSaveSchema.parse(JSON.parse(raw)));
  } catch {
    return createDefaultSave();
  }
}

export function writeSave(save: GameSave): GameSave {
  const parsed = normalizeSave(StoredSaveSchema.parse(save));
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  }
  return parsed;
}

export function completeStage(
  save: GameSave,
  nodeId: string,
  result: StageResult,
): GameSave {
  const normalizedSave = normalizeSave(StoredSaveSchema.parse(save));
  const stage = getNode(nodeId);
  const unlocked = new Set(normalizedSave.unlockedNodeIds);
  const cleared = new Set(normalizedSave.clearedNodeIds);
  const secretExits = new Set(normalizedSave.secretExitNodeIds);
  const worlds = new Set<WorldId>(normalizedSave.unlockedWorldIds);
  const nextIds = result.exit === "secret" ? stage.secretNext : stage.next;

  if (result.exit === "secret") secretExits.add(nodeId);
  else cleared.add(nodeId);

  for (const nextId of nextIds) {
    unlocked.add(nextId);
    worlds.add(getWorldForNode(nextId).id);
  }

  const crowns = normalizeCrownIndexes(result.crowns);
  const previousCrowns = normalizedSave.crownPieces[nodeId] ?? [];
  const mergedCrowns = normalizeCrownIndexes([...previousCrowns, ...crowns]);
  const previousBest = normalizedSave.bestTimes[nodeId];

  return writeSave({
    ...normalizedSave,
    currentNodeId: nextIds[0] ?? nodeId,
    unlockedNodeIds: Array.from(unlocked),
    clearedNodeIds: Array.from(cleared),
    secretExitNodeIds: Array.from(secretExits),
    unlockedWorldIds: Array.from(worlds),
    crownPieces: {
      ...normalizedSave.crownPieces,
      [nodeId]: mergedCrowns,
    },
    bestTimes: {
      ...normalizedSave.bestTimes,
      [nodeId]: previousBest
        ? Math.min(previousBest, result.elapsedSeconds)
        : result.elapsedSeconds,
    },
    coins: Math.min(9999, normalizedSave.coins + result.coins),
    totalCrowns: normalizedSave.totalCrowns,
  });
}

export function loseLife(save: GameSave): GameSave {
  const lives = save.lives > 0 ? save.lives - 1 : 5;
  return writeSave({ ...save, lives });
}

export function moveToNode(save: GameSave, nodeId: string): GameSave {
  if (!save.unlockedNodeIds.includes(nodeId)) {
    throw new Error(`Cannot move to locked stage ${nodeId}.`);
  }
  getNode(nodeId);
  return writeSave({ ...save, currentNodeId: nodeId });
}

export function updateSettings(
  save: GameSave,
  settings: GameSettings,
): GameSave {
  return writeSave({ ...save, settings: SettingsSchema.parse(settings) });
}

export function eraseSave(): GameSave {
  if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  return createDefaultSave();
}
