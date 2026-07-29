import { z } from "zod";
import type { SliceStageId } from "../data/slice/types";
import { SettingsSchema, type GameSettings } from "./save";

export interface SliceSaveV2 {
  version: 2;
  currentStageId: SliceStageId;
  completedStageIds: SliceStageId[];
  collectedShardIds: string[];
  discoveredSecretIds: string[];
  bestClearMs?: number;
  settings: GameSettings;
}

export const STORAGE_KEY_V2 = "crowntrail.slice.v2";

export const sliceSaveSchema = z.object({
  version: z.literal(2),
  currentStageId: z.enum([
    "prologue",
    "windmill-hill",
    "sleeping-canopy",
    "ink-fortress",
  ]),
  completedStageIds: z.array(z.string()),
  collectedShardIds: z.array(z.string()),
  discoveredSecretIds: z.array(z.string()),
  bestClearMs: z.number().optional(),
  settings: z.any().optional(),
});

export function createDefaultSliceSave(): SliceSaveV2 {
  return {
    version: 2,
    currentStageId: "prologue",
    completedStageIds: [],
    collectedShardIds: [],
    discoveredSecretIds: [],
    settings: SettingsSchema.parse({}),
  };
}

export function normalizeSliceSave(raw: unknown): SliceSaveV2 {
  try {
    if (!raw || typeof raw !== "object") return createDefaultSliceSave();

    const parsed = sliceSaveSchema.safeParse(raw);
    if (!parsed.success) return createDefaultSliceSave();

    const data = parsed.data;
    return {
      version: 2,
      currentStageId: data.currentStageId as SliceStageId,
      completedStageIds: Array.from(
        new Set(data.completedStageIds),
      ) as SliceStageId[],
      collectedShardIds: Array.from(new Set(data.collectedShardIds)),
      discoveredSecretIds: Array.from(new Set(data.discoveredSecretIds)),
      bestClearMs: data.bestClearMs,
      settings: { ...SettingsSchema.parse({}), ...(data.settings || {}) },
    };
  } catch {
    return createDefaultSliceSave();
  }
}

export function loadSliceSave(): SliceSaveV2 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) return createDefaultSliceSave();
    return normalizeSliceSave(JSON.parse(raw));
  } catch {
    return createDefaultSliceSave();
  }
}

export function writeSliceSave(save: SliceSaveV2): boolean {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
