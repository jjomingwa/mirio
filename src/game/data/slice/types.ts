export type SliceStageId =
  "prologue" | "windmill-hill" | "sleeping-canopy" | "ink-fortress";
export type LandmarkId = "windmill" | "canopy" | "fortress" | "throne";

export interface Point {
  x: number;
  y: number;
}

export type SectionPurpose =
  "setup" | "practice" | "development" | "twist" | "discovery" | "payoff";

export interface SliceGeometry {
  x: number;
  y: number;
  width: number;
  oneWay?: boolean;
}

export interface SliceRushTargetRef {
  id: string;
  kind: "ring" | "enemy" | "crystal" | "boss-seal";
  x: number;
  y: number;
  recharge: boolean;
}

export interface SliceEncounterRef {
  id: string;
  type: "opossum" | "frog" | "eagle" | "ghost" | "lizard";
  x: number;
  y: number;
}

export interface SliceCueRef {
  id: string;
  type: "text" | "sound" | "vfx";
  x?: number;
  y?: number;
  message?: string;
}

export interface SliceSection {
  id: string;
  purpose: SectionPurpose;
  checkpoint?: Point;
  geometry: SliceGeometry[];
  rushTargets: SliceRushTargetRef[];
  encounters: SliceEncounterRef[];
  cues: SliceCueRef[];
  optionalRoute?: boolean;
}

export interface StageExit {
  x: number;
  y: number;
  targetStageId: SliceStageId | "boss-throne";
}

export interface AuthoredSliceStage {
  id: SliceStageId;
  title: string;
  landmarkId: LandmarkId;
  sections: SliceSection[];
  entry: Point;
  exit: StageExit;
  expectedMinutes: [number, number];
  shardId?: string;
  secretId?: string;
}
