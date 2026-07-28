import { create } from "zustand";
import {
  completeStage,
  createDefaultSave,
  eraseSave,
  loadSave,
  loseLife,
  moveToNode,
  updateSettings,
  type GameSave,
  type GameSettings,
  type StageResult,
} from "./save";

export type UiMode = "title" | "intro" | "map" | "course" | "boss" | "ending";

export interface HudSnapshot {
  stageLabel: string;
  stageTitle: string;
  lives: number;
  coins: number;
  crowns: number;
  time: number;
  bossHealth?: number;
}

interface GameStore {
  save: GameSave;
  mode: UiMode;
  started: boolean;
  paused: boolean;
  settingsOpen: boolean;
  toast: string | null;
  hud: HudSnapshot | null;
  setMode: (mode: UiMode) => void;
  start: () => void;
  setPaused: (paused: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setToast: (message: string | null) => void;
  setHud: (hud: HudSnapshot | null) => void;
  finishStage: (nodeId: string, result: StageResult) => void;
  moveToNode: (nodeId: string) => void;
  loseLife: () => void;
  setSettings: (settings: GameSettings) => void;
  resetProgress: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  save: loadSave(),
  mode: "title",
  started: false,
  paused: false,
  settingsOpen: false,
  toast: null,
  hud: null,
  setMode: (mode) => set({ mode }),
  start: () => set({ started: true, mode: "intro" }),
  setPaused: (paused) => set({ paused }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setToast: (toast) => set({ toast }),
  setHud: (hud) => set({ hud }),
  finishStage: (nodeId, result) =>
    set({ save: completeStage(get().save, nodeId, result) }),
  moveToNode: (nodeId) => set({ save: moveToNode(get().save, nodeId) }),
  loseLife: () => set({ save: loseLife(get().save) }),
  setSettings: (settings) =>
    set({ save: updateSettings(get().save, settings) }),
  resetProgress: () => set({ save: eraseSave(), hud: null, paused: false }),
}));

export function resetStoreForTests(): void {
  useGameStore.setState({ save: createDefaultSave() });
}
