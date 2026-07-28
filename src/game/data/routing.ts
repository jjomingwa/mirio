import type { StageKind, StageNode } from "./types";

export type GameplaySceneKey = "Level" | "Boss";
export type CompletionSceneKey = "WorldMap" | "Ending";

function assertNever(value: never): never {
  throw new Error(`Unsupported stage kind: ${String(value)}`);
}

export function getGameplaySceneForStage(
  stage: Pick<StageNode, "kind">,
): GameplaySceneKey {
  switch (stage.kind) {
    case "course":
    case "castle":
      return "Level";
    case "fortress":
    case "final":
      return "Boss";
    default:
      return assertNever(stage.kind);
  }
}

export function getCompletionSceneForStage(
  stage: Pick<StageNode, "kind">,
): CompletionSceneKey {
  return stage.kind === "final" ? "Ending" : "WorldMap";
}

export const STAGE_KIND_SCENE_CONTRACT: Readonly<
  Record<StageKind, GameplaySceneKey>
> = {
  course: "Level",
  castle: "Level",
  fortress: "Boss",
  final: "Boss",
};
