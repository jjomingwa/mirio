import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const validatorScript = path.join(
  repositoryRoot,
  "scripts",
  "validate-goal.mjs",
);
const canonicalDocuments = [
  "goal.json",
  "gates.json",
  "rubric.json",
  "backlog.json",
  "assets.json",
];

let fixtureRoot = "";

function fixturePath(...segments: string[]) {
  return path.join(fixtureRoot, ".goal", ...segments);
}

function mutateJson(
  relativePath: string,
  mutate: (value: Record<string, unknown>) => void,
) {
  const absolutePath = fixturePath(relativePath);
  const value = JSON.parse(readFileSync(absolutePath, "utf8")) as Record<
    string,
    unknown
  >;
  mutate(value);
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runValidator() {
  return spawnSync(process.execPath, [validatorScript], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: { ...process.env, GOAL_HARNESS_ROOT: fixtureRoot },
  });
}

beforeEach(() => {
  fixtureRoot = mkdtempSync(path.join(tmpdir(), "crowntrail-goal-schema-"));
  const fixtureGoalDir = fixturePath();
  mkdirSync(fixtureGoalDir, { recursive: true });
  for (const document of canonicalDocuments) {
    cpSync(
      path.join(repositoryRoot, ".goal", document),
      path.join(fixtureGoalDir, document),
    );
  }
  cpSync(
    path.join(repositoryRoot, ".goal", "schemas"),
    path.join(fixtureGoalDir, "schemas"),
    { recursive: true },
  );
});

afterEach(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("goal schema integration", () => {
  it("validates the current canonical corpus", () => {
    const result = runValidator();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("DECISION_HOLES 0");
    expect(result.stdout).toContain(
      "HARNESS PASS (6 gates, 5 backlog items, 7 rubric dimensions)",
    );
    expect(result.stderr).toBe("");
  });

  it("fails a canonical schema violation with an exact JSON path", () => {
    mutateJson("goal.json", (goal) => {
      goal.version = 3;
    });

    const result = runValidator();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "FAIL .goal/goal.json $.version [const] must equal the constant value",
    );
  });

  it("fails closed when a schema contains an unsupported keyword", () => {
    mutateJson(path.join("schemas", "goal.schema.json"), (goalSchema) => {
      goalSchema.oneOf = [];
    });

    const result = runValidator();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "FAIL Schema .goal/schemas/goal.schema.json #/oneOf [oneOf] unsupported schema keyword",
    );
  });

  it("fails when a declared canonical schema is missing", () => {
    rmSync(fixturePath("schemas", "goal.schema.json"));

    const result = runValidator();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "FAIL Missing referenced schema: ./schemas/goal.schema.json",
    );
  });
});
