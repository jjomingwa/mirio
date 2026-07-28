import { describe, expect, it } from "vitest";
import {
  getCompletionSceneForStage,
  getGameplaySceneForStage,
  STAGE_KIND_SCENE_CONTRACT,
} from "../src/game/data/routing";
import {
  ALL_NODES,
  getNode,
  getWorldForNode,
  WORLDS,
} from "../src/game/data/worlds";
import { completeStage, createDefaultSave } from "../src/game/state/save";

describe("world graph", () => {
  it("contains the complete campaign contract", () => {
    expect(WORLDS).toHaveLength(8);
    expect(ALL_NODES).toHaveLength(54);
    expect(new Set(ALL_NODES.map((node) => node.id)).size).toBe(54);
    expect(ALL_NODES.filter((node) => node.kind === "fortress")).toHaveLength(
      8,
    );
    expect(ALL_NODES.filter((node) => node.kind === "castle")).toHaveLength(8);
    expect(
      ALL_NODES.filter((node) => node.kind === "final").map((node) => node.id),
    ).toEqual(["8-F"]);
  });

  it("routes every stage kind to its intended gameplay scene", () => {
    for (const stage of ALL_NODES) {
      expect(getGameplaySceneForStage(stage)).toBe(
        STAGE_KIND_SCENE_CONTRACT[stage.kind],
      );
    }

    expect(
      ALL_NODES.filter((stage) => getGameplaySceneForStage(stage) === "Level"),
    ).toHaveLength(45);
    expect(
      ALL_NODES.filter((stage) => getGameplaySceneForStage(stage) === "Boss"),
    ).toHaveLength(9);
  });

  it("unlocks and selects the next node after every non-final boss", () => {
    const fortresses = ALL_NODES.filter((stage) => stage.kind === "fortress");

    for (const fortress of fortresses) {
      const completed = completeStage(createDefaultSave(), fortress.id, {
        exit: "normal",
        crowns: [0, 1, 2],
        elapsedSeconds: 120,
        coins: 0,
      });

      expect(fortress.next).toHaveLength(1);
      expect(completed.currentNodeId).toBe(fortress.next[0]);
      expect(completed.unlockedNodeIds).toContain(fortress.next[0]);
      expect(completed.unlockedWorldIds).toContain(
        getWorldForNode(fortress.next[0]).id,
      );
      expect(getCompletionSceneForStage(fortress)).toBe("WorldMap");
    }
  });

  it("keeps both major route choices mutually exclusive", () => {
    const routeChoices = [
      { stageId: "2-C", normalNext: "3-1", secretNext: "4-1" },
      { stageId: "5-C", normalNext: "6-1", secretNext: "7-1" },
    ];

    for (const route of routeChoices) {
      const normal = completeStage(createDefaultSave(), route.stageId, {
        exit: "normal",
        crowns: [],
        elapsedSeconds: 120,
        coins: 0,
      });
      const secret = completeStage(createDefaultSave(), route.stageId, {
        exit: "secret",
        crowns: [],
        elapsedSeconds: 120,
        coins: 0,
      });

      expect(normal.currentNodeId).toBe(route.normalNext);
      expect(normal.unlockedNodeIds).toContain(route.normalNext);
      expect(normal.unlockedNodeIds).not.toContain(route.secretNext);
      expect(secret.currentNodeId).toBe(route.secretNext);
      expect(secret.unlockedNodeIds).toContain(route.secretNext);
      expect(secret.unlockedNodeIds).not.toContain(route.normalNext);
      expect(secret.secretExitNodeIds).toContain(route.stageId);
    }
  });

  it("reaches the final battle from the first course", () => {
    const visited = new Set<string>();
    const queue = ["1-1"];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      const node = getNode(id);
      queue.push(...node.next, ...node.secretNext);
    }
    expect(visited.has("8-F")).toBe(true);
    expect(
      ALL_NODES.filter((stage) => stage.kind === "final").map(
        (stage) => stage.id,
      ),
    ).toEqual(["8-F"]);
    expect(getGameplaySceneForStage(getNode("8-F"))).toBe("Boss");
    expect(getCompletionSceneForStage(getNode("8-F"))).toBe("Ending");
  });
});
