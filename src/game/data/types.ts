export const WORLD_IDS = [
  "w1",
  "w2",
  "w3",
  "w4",
  "w5",
  "w6",
  "w7",
  "w8",
] as const;

export type WorldId = (typeof WORLD_IDS)[number];

export type ThemeId =
  | "meadow"
  | "desert"
  | "coast"
  | "forest"
  | "frost"
  | "mountain"
  | "sky"
  | "lava";

export type StageKind = "course" | "fortress" | "castle" | "final";

export type CoursePace =
  "gentle" | "rhythm" | "vertical" | "precision" | "gauntlet";

export interface Point {
  x: number;
  y: number;
}

export interface StageNode {
  id: string;
  worldId: WorldId;
  label: string;
  title: string;
  kind: StageKind;
  theme: ThemeId;
  pace: CoursePace;
  position: Point;
  seed: number;
  difficulty: number;
  timeLimit: number;
  next: string[];
  secretNext: string[];
  secretExit: boolean;
}

export interface WorldDefinition {
  id: WorldId;
  number: number;
  name: string;
  subtitle: string;
  theme: ThemeId;
  palette: {
    sky: number;
    haze: number;
    path: number;
    accent: number;
  };
  startNodeId: string;
  nodes: StageNode[];
}

export interface CoursePlatform {
  x: number;
  y: number;
  width: number;
  oneWay?: boolean;
  motion?: {
    axis: "x" | "y";
    distance: number;
    duration: number;
  };
}

export interface CourseSpawn {
  x: number;
  y: number;
  type: "opossum" | "frog" | "eagle" | "lizard" | "ghost";
}

export interface CoursePickup {
  x: number;
  y: number;
  type: "coin" | "crown";
  index?: number;
}

export interface CourseHazard {
  x: number;
  y: number;
  width: number;
  type: "spikes" | "lava";
}

export interface CourseLayout {
  width: number;
  groundY: number;
  platforms: CoursePlatform[];
  enemies: CourseSpawn[];
  pickups: CoursePickup[];
  hazards: CourseHazard[];
  checkpointX: number;
  goalX: number;
  secretGoal?: Point;
}
