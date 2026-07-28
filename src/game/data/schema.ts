import { z } from "zod";
import { WORLD_IDS, type WorldDefinition } from "./types";

const WorldIdSchema = z.enum(WORLD_IDS);
const ThemeSchema = z.enum([
  "meadow",
  "desert",
  "coast",
  "forest",
  "frost",
  "mountain",
  "sky",
  "lava",
]);

const PointSchema = z.object({
  x: z.number().min(0).max(480),
  y: z.number().min(0).max(270),
});

const StageNodeSchema = z.object({
  id: z.string().min(3),
  worldId: WorldIdSchema,
  label: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(["course", "fortress", "castle", "final"]),
  theme: ThemeSchema,
  pace: z.enum(["gentle", "rhythm", "vertical", "precision", "gauntlet"]),
  position: PointSchema,
  seed: z.number().int().positive(),
  difficulty: z.number().int().min(1).max(10),
  timeLimit: z.number().int().min(120).max(600),
  next: z.array(z.string()),
  secretNext: z.array(z.string()),
  secretExit: z.boolean(),
});

const WorldDefinitionSchema = z.object({
  id: WorldIdSchema,
  number: z.number().int().min(1).max(8),
  name: z.string().min(2),
  subtitle: z.string().min(2),
  theme: ThemeSchema,
  palette: z.object({
    sky: z.number().int().nonnegative(),
    haze: z.number().int().nonnegative(),
    path: z.number().int().nonnegative(),
    accent: z.number().int().nonnegative(),
  }),
  startNodeId: z.string(),
  nodes: z.array(StageNodeSchema).min(1),
});

export function validateWorldDefinitions(input: unknown): WorldDefinition[] {
  const worlds = z.array(WorldDefinitionSchema).length(8).parse(input);
  assertGraphInvariants(worlds);
  return worlds;
}

export function assertGraphInvariants(worlds: WorldDefinition[]): void {
  const nodes = worlds.flatMap((world) => world.nodes);
  const ids = new Set(nodes.map((node) => node.id));

  if (nodes.length !== 54) {
    throw new Error(
      `World graph must contain exactly 54 stages; found ${nodes.length}.`,
    );
  }

  if (ids.size !== nodes.length) {
    throw new Error("World graph contains duplicate stage IDs.");
  }

  for (const world of worlds) {
    if (!ids.has(world.startNodeId)) {
      throw new Error(
        `World ${world.id} start node does not exist: ${world.startNodeId}`,
      );
    }

    if (!world.nodes.some((node) => node.kind === "fortress")) {
      throw new Error(
        `World ${world.id} must contain a Crown Warden fortress.`,
      );
    }
  }

  for (const node of nodes) {
    if (node.secretExit !== node.secretNext.length > 0) {
      throw new Error(`Secret-exit flag and route disagree at ${node.id}.`);
    }

    for (const target of [...node.next, ...node.secretNext]) {
      if (!ids.has(target)) {
        throw new Error(`Stage ${node.id} points to missing stage ${target}.`);
      }
    }
  }

  const finalNodes = nodes.filter((node) => node.kind === "final");
  if (finalNodes.length !== 1 || finalNodes[0]?.id !== "8-F") {
    throw new Error(
      "World graph must contain exactly one final Vespera stage at 8-F.",
    );
  }

  const twoCastle = nodes.find((node) => node.id === "2-C");
  const fiveCastle = nodes.find((node) => node.id === "5-C");
  if (
    !twoCastle?.next.includes("3-1") ||
    !twoCastle.secretNext.includes("4-1")
  ) {
    throw new Error(
      "World 2 must branch to World 3 normally and World 4 secretly.",
    );
  }
  if (
    !fiveCastle?.next.includes("6-1") ||
    !fiveCastle.secretNext.includes("7-1")
  ) {
    throw new Error(
      "World 5 must branch to World 6 normally and World 7 secretly.",
    );
  }

  const visited = new Set<string>();
  const queue = ["1-1"];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const node = nodes.find((candidate) => candidate.id === id);
    if (node) queue.push(...node.next, ...node.secretNext);
  }
  if (!visited.has("8-F")) {
    throw new Error("Final stage is unreachable from the opening stage.");
  }
}
