import { beforeEach, describe, expect, it } from "vitest";
import {
  CAMPAIGN_CROWN_MAX,
  CROWN_PIECE_INDEXES,
  completeStage,
  createDefaultSave,
  loadSave,
  writeSave,
} from "../src/game/state/save";
import { ALL_NODES } from "../src/game/data/worlds";

describe("save progression", () => {
  beforeEach(() => localStorage.clear());

  it("unlocks only the exit that was actually cleared", () => {
    const initial = createDefaultSave();
    initial.unlockedNodeIds = ["1-1", "2-C"];
    initial.currentNodeId = "2-C";
    initial.unlockedWorldIds = ["w1", "w2"];
    const secret = completeStage(initial, "2-C", {
      exit: "secret",
      crowns: [0, 2],
      elapsedSeconds: 120,
      coins: 4,
    });
    expect(secret.unlockedNodeIds).toContain("4-1");
    expect(secret.unlockedNodeIds).not.toContain("3-1");
    expect(secret.secretExitNodeIds).toContain("2-C");
  });

  it("does not count the same crown twice", () => {
    const first = completeStage(createDefaultSave(), "1-1", {
      exit: "normal",
      crowns: [0, 1],
      elapsedSeconds: 100,
      coins: 2,
    });
    const second = completeStage(first, "1-1", {
      exit: "normal",
      crowns: [1, 2],
      elapsedSeconds: 90,
      coins: 0,
    });
    expect(second.totalCrowns).toBe(3);
    expect(second.crownPieces["1-1"]).toEqual([0, 1, 2]);
    expect(second.bestTimes["1-1"]).toBe(90);
  });

  it("derives the 162-crown maximum from all campaign stages", () => {
    let save = createDefaultSave();

    for (const stage of ALL_NODES) {
      save = completeStage(save, stage.id, {
        exit: "normal",
        crowns: [...CROWN_PIECE_INDEXES],
        elapsedSeconds: 100,
        coins: 0,
      });
    }

    expect(ALL_NODES).toHaveLength(54);
    expect(CAMPAIGN_CROWN_MAX).toBe(162);
    expect(save.totalCrowns).toBe(CAMPAIGN_CROWN_MAX);
  });

  it("normalizes inconsistent in-memory crown progress before writing", () => {
    const normalized = writeSave({
      ...createDefaultSave(),
      crownPieces: {
        "1-1": [2, 1, 1, 0],
        unknown: [0, 1, 2],
      },
      totalCrowns: 999,
    });

    expect(normalized.crownPieces).toEqual({ "1-1": [0, 1, 2] });
    expect(normalized.totalCrowns).toBe(3);
  });

  it("salvages valid crowns from malformed and oversized stored values", () => {
    const crownPieces = Object.fromEntries(
      ALL_NODES.map((stage) => [stage.id, [2, 1, 0, 2, -1, 3, 1.5, "0", null]]),
    );

    localStorage.setItem(
      "crowntrail-save-v1",
      JSON.stringify({
        ...createDefaultSave(),
        crownPieces: {
          ...crownPieces,
          unknown: [0, 1, 2],
        },
        totalCrowns: 999_999,
      }),
    );

    const loaded = loadSave();
    expect(loaded.totalCrowns).toBe(CAMPAIGN_CROWN_MAX);
    expect(Object.keys(loaded.crownPieces)).toHaveLength(ALL_NODES.length);
    expect(loaded.crownPieces.unknown).toBeUndefined();
    expect(
      Object.values(loaded.crownPieces).every(
        (indexes) =>
          JSON.stringify(indexes) === JSON.stringify(CROWN_PIECE_INDEXES),
      ),
    ).toBe(true);
  });

  it("keeps valid stage progress when one stored crown entry is malformed", () => {
    localStorage.setItem(
      "crowntrail-save-v1",
      JSON.stringify({
        ...createDefaultSave(),
        crownPieces: {
          "1-1": [0, 1],
          "1-2": "not-an-array",
        },
        totalCrowns: 999,
      }),
    );

    const loaded = loadSave();
    expect(loaded.crownPieces).toEqual({ "1-1": [0, 1] });
    expect(loaded.totalCrowns).toBe(2);
  });

  it("ignores invalid crown indexes reported by a stage", () => {
    const save = completeStage(createDefaultSave(), "1-1", {
      exit: "normal",
      crowns: [-1, 0, 0, 1.5, 3, 2],
      elapsedSeconds: 100,
      coins: 0,
    });

    expect(save.crownPieces["1-1"]).toEqual([0, 2]);
    expect(save.totalCrowns).toBe(2);
  });

  it("recovers from malformed local storage", () => {
    localStorage.setItem("crowntrail-save-v1", "{broken");
    expect(loadSave()).toEqual(createDefaultSave());
  });
});
