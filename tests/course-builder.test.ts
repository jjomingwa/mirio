import { describe, expect, it } from "vitest";
import { ALL_NODES, getNode } from "../src/game/data/worlds";
import { buildCourse } from "../src/game/systems/CourseBuilder";

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("course builder", () => {
  it("is deterministic for a stage seed", () => {
    expect(buildCourse(getNode("6-3"))).toEqual(buildCourse(getNode("6-3")));
  });

  it("places three distinct crown pieces in every standard course", () => {
    for (const id of ["1-1", "2-4", "4-3", "7-4", "8-5"]) {
      const crowns = buildCourse(getNode(id)).pickups.filter(
        (pickup) => pickup.type === "crown",
      );
      expect(crowns.map((pickup) => pickup.index)).toEqual([0, 1, 2]);
    }
  });

  it("builds the secret high route only for secret-exit stages", () => {
    expect(buildCourse(getNode("2-C")).secretGoal).toBeDefined();
    expect(buildCourse(getNode("2-4")).secretGoal).toBeUndefined();
  });

  it("keeps elevated platforms visually separated in every course", () => {
    for (const stage of ALL_NODES.filter((node) => node.kind === "course")) {
      const layout = buildCourse(stage);
      const elevated = layout.platforms.filter(
        (platform) => platform.y < layout.groundY - 20,
      );

      for (let leftIndex = 0; leftIndex < elevated.length; leftIndex += 1) {
        const left = elevated[leftIndex];
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < elevated.length;
          rightIndex += 1
        ) {
          const right = elevated[rightIndex];
          const horizontalGap =
            Math.abs(left.x - right.x) - (left.width + right.width) / 2;
          expect(
            horizontalGap,
            `${stage.id}: elevated platforms overlap near x=${left.x}/${right.x}`,
          ).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });

  it("never overlaps apples and crown gems", () => {
    for (const stage of ALL_NODES.filter((node) => node.kind === "course")) {
      const pickups = buildCourse(stage).pickups;
      for (let leftIndex = 0; leftIndex < pickups.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < pickups.length;
          rightIndex += 1
        ) {
          expect(
            distance(pickups[leftIndex], pickups[rightIndex]),
            `${stage.id}: pickups overlap at x=${pickups[leftIndex].x}`,
          ).toBeGreaterThanOrEqual(16);
        }
      }
    }
  });

  it("keeps every elevated pickup on a reachable platform route", () => {
    for (const stage of ALL_NODES.filter((node) => node.kind === "course")) {
      const layout = buildCourse(stage);
      const ground = layout.platforms.filter(
        (platform) => platform.y >= layout.groundY - 20,
      );
      const elevated = layout.platforms.filter(
        (platform) => platform.y < layout.groundY - 20,
      );
      const reachable = new Set(ground);

      let changed = true;
      while (changed) {
        changed = false;
        for (const target of elevated) {
          if (reachable.has(target)) continue;
          const canReach = [...reachable].some((source) => {
            const ascent = source.y - target.y;
            const edgeGap = Math.max(
              0,
              Math.abs(source.x - target.x) - (source.width + target.width) / 2,
            );
            return ascent <= 72 && edgeGap <= 112;
          });
          if (canReach) {
            reachable.add(target);
            changed = true;
          }
        }
      }

      for (const pickup of layout.pickups) {
        const host = layout.platforms.find(
          (platform) =>
            reachable.has(platform) &&
            Math.abs(platform.x - pickup.x) <= platform.width / 2 + 8 &&
            pickup.y < platform.y &&
            platform.y - pickup.y <= 46,
        );
        const nearby = layout.platforms
          .filter((platform) => Math.abs(platform.x - pickup.x) < 120)
          .map((platform) => ({
            x: platform.x,
            y: platform.y,
            width: platform.width,
            reachable: reachable.has(platform),
          }));
        expect(
          host,
          `${stage.id}: unreachable ${pickup.type} at ${pickup.x},${pickup.y}; nearby=${JSON.stringify(nearby)}`,
        ).toBeDefined();
      }
    }
  });
});
