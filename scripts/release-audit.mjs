#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function record(id, status, detail) {
  checks.push({ id, status, detail });
  console.log(`${status} ${id}: ${detail}`);
}

function readJson(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    record(`file:${relativePath}`, "FAIL", "required file is missing");
    return null;
  }
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    record(`json:${relativePath}`, "FAIL", error.message);
    return null;
  }
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const absolutePath = path.join(directory, name);
    return statSync(absolutePath).isDirectory()
      ? walk(absolutePath)
      : [absolutePath];
  });
}

const goal = readJson(".goal/goal.json");
const gatesDocument = readJson(".goal/gates.json");
const backlog = readJson(".goal/backlog.json");

if (goal) {
  const serialized = JSON.stringify(goal);
  record(
    "goal-decisions",
    serialized.includes("NEEDS_USER_DECISION") ? "FAIL" : "PASS",
    serialized.includes("NEEDS_USER_DECISION")
      ? "commercial target decisions are unresolved"
      : "commercial target decisions are explicit",
  );
}

if (gatesDocument) {
  const gates = Array.isArray(gatesDocument)
    ? gatesDocument
    : Array.isArray(gatesDocument.gates)
      ? gatesDocument.gates
      : Object.entries(gatesDocument.gates ?? {}).map(([id, value]) => ({
          id,
          ...value,
        }));
  const incomplete = gates
    .filter((gate) => gate.status !== "PASS")
    .map((gate) => gate.id);
  record(
    "release-gates",
    incomplete.length ? "FAIL" : "PASS",
    incomplete.length
      ? `not proven: ${incomplete.join(", ")}`
      : "all gates have PASS evidence",
  );
}

if (backlog?.items) {
  const blockers = backlog.items
    .filter(
      (item) =>
        ["G1", "G2", "G3", "G4"].includes(item.target_gate) &&
        item.status !== "done",
    )
    .map((item) => item.id);
  record(
    "release-blockers",
    blockers.length ? "FAIL" : "PASS",
    blockers.length
      ? `open blockers: ${blockers.join(", ")}`
      : "no open release blockers",
  );
}

const forbidden = [
  { label: "Bowser", pattern: /\bBowser\b/giu },
  { label: "Junior Koopa", pattern: /\bJunior\s+Koopa\b/giu },
  { label: "Koopa Korean", pattern: /쿠파/gu },
];
const sourceFiles = [
  ...walk(path.join(ROOT, "src")).filter((file) =>
    /\.(ts|tsx|js|jsx|json)$/i.test(file),
  ),
  path.join(ROOT, "README.md"),
  path.join(ROOT, "THIRD_PARTY_ASSETS.md"),
  ...walk(path.join(ROOT, "docs")).filter((file) => /\.md$/i.test(file)),
].filter((file) => existsSync(file));
const violations = [];
for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8");
  for (const term of forbidden) {
    if (term.pattern.test(content)) {
      violations.push(
        `${path.relative(ROOT, file).replaceAll(path.sep, "/")}:${term.label}`,
      );
    }
    term.pattern.lastIndex = 0;
  }
}
record(
  "third-party-identifiers",
  violations.length ? "FAIL" : "PASS",
  violations.length
    ? violations.join(", ")
    : "no blocked identifiers in runtime source",
);

const assetReview = readJson(".goal/assets.json");
if (assetReview) {
  const unresolved = (assetReview.packages ?? [])
    .filter((entry) => entry.commercial_status !== "APPROVED")
    .map((entry) => entry.id);
  record(
    "asset-provenance",
    unresolved.length ? "FAIL" : "PASS",
    unresolved.length
      ? `human review required: ${unresolved.join(", ")}`
      : "all asset packages approved",
  );
}

const failed = checks.filter((check) => check.status !== "PASS");
console.log(
  `SUMMARY ${checks.length - failed.length} PASS / ${failed.length} FAIL`,
);
if (failed.length) process.exitCode = 1;
