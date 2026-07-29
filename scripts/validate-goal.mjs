#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  preflightSchema,
  validateSchemaDocument,
} from "./lib/schema-validator.mjs";

const ROOT = process.env.GOAL_HARNESS_ROOT
  ? path.resolve(process.env.GOAL_HARNESS_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOAL_DIR = path.join(ROOT, ".goal");
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function load(name) {
  const absolutePath = path.join(GOAL_DIR, name);
  check(existsSync(absolutePath), `Missing .goal/${name}`);
  if (!existsSync(absolutePath)) return null;
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    errors.push(`Invalid JSON .goal/${name}: ${error.message}`);
    return null;
  }
}

function unique(values, label) {
  check(new Set(values).size === values.length, `Duplicate ${label}`);
}

function decodePointerToken(token) {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function formatJsonPath(instancePath) {
  if (!instancePath) return "$";
  return instancePath
    .slice(1)
    .split("/")
    .map(decodePointerToken)
    .reduce((jsonPath, token) => {
      if (/^(0|[1-9][0-9]*)$/u.test(token)) return `${jsonPath}[${token}]`;
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(token))
        return `${jsonPath}.${token}`;
      return `${jsonPath}[${JSON.stringify(token)}]`;
    }, "$");
}

function findDecisionHoles(value) {
  if (value === "NEEDS_USER_DECISION") return 1;
  if (Array.isArray(value))
    return value.reduce((total, entry) => total + findDecisionHoles(entry), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce(
      (total, entry) => total + findDecisionHoles(entry),
      0,
    );
  }
  return 0;
}

const goal = load("goal.json");
const gatesDocument = load("gates.json");
const rubric = load("rubric.json");
const backlog = load("backlog.json");
const assets = load("assets.json");

const canonicalDocuments = [
  ["goal.json", goal, "./schemas/goal.schema.json"],
  ["gates.json", gatesDocument, "./schemas/gates.schema.json"],
  ["rubric.json", rubric, "./schemas/rubric.schema.json"],
  ["backlog.json", backlog, "./schemas/backlog.schema.json"],
  ["assets.json", assets, "./schemas/assets.schema.json"],
];
const standaloneSchemas = [
  "./schemas/evidence.schema.json",
  "./schemas/review.schema.json",
  "./schemas/external-review.schema.json",
  "./schemas/content-matrix.schema.json",
  "./schemas/funnel.schema.json",
];
const schemas = new Map();

for (const schemaReference of [
  ...canonicalDocuments.map(([, , reference]) => reference),
  ...standaloneSchemas,
]) {
  const schemaPath = path.resolve(GOAL_DIR, schemaReference);
  const relativePath = path.relative(GOAL_DIR, schemaPath);
  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    !relativePath.startsWith(`schemas${path.sep}`)
  ) {
    errors.push(`Schema must stay inside .goal/schemas: ${schemaReference}`);
    continue;
  }
  if (!existsSync(schemaPath)) {
    errors.push(`Missing referenced schema: ${schemaReference}`);
    continue;
  }

  let schema;
  try {
    schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  } catch (error) {
    errors.push(`Invalid schema JSON ${schemaReference}: ${error.message}`);
    continue;
  }

  const schemaDocument = `.goal/${relativePath.replaceAll(path.sep, "/")}`;
  const schemaIssues = preflightSchema(schema, { document: schemaDocument });
  for (const issue of schemaIssues) {
    errors.push(
      `Schema ${schemaDocument} ${issue.schemaPath} [${issue.keyword}] ${issue.message}`,
    );
  }
  if (schemaIssues.length === 0) schemas.set(schemaReference, schema);
}

for (const [name, document, expectedSchema] of canonicalDocuments) {
  if (!document) continue;
  check(
    document.$schema === expectedSchema,
    `.goal/${name} $.$schema must equal ${expectedSchema}`,
  );
  const schema = schemas.get(expectedSchema);
  if (!schema) continue;

  const documentIssues = validateSchemaDocument({
    schema,
    value: document,
    document: `.goal/${name}`,
  });
  for (const issue of documentIssues) {
    errors.push(
      `.goal/${name} ${formatJsonPath(issue.instancePath)} [${issue.keyword}] ${issue.message} (schema ${issue.schemaPath})`,
    );
  }
}

const gates = gatesDocument?.gates ?? [];
const gateIds = gates.map((gate) => gate.id);
unique(gateIds, "gate IDs");
check(
  JSON.stringify(gateIds) ===
    JSON.stringify(["W0", "W1", "W2", "W3", "W4", "W5"]),
  "Gate IDs must be W0 through W5 in order",
);
const requirementIds = gates.flatMap((gate) =>
  (gate.requirements ?? []).map((requirement) => requirement.id),
);
unique(requirementIds, "gate requirement IDs");
for (const gate of gates) {
  for (const requirement of gate.requirements ?? []) {
    check(
      requirement.id.startsWith(`${gate.id}-`),
      `${requirement.id} does not belong to ${gate.id}`,
    );
  }
}

const dimensions = rubric?.dimensions ?? [];
unique(
  dimensions.map((dimension) => dimension.id),
  "rubric dimension IDs",
);
check(
  dimensions.reduce((total, dimension) => total + dimension.weight, 0) === 100,
  "Rubric weights must total 100",
);

const items = backlog?.items ?? [];
const itemIds = items.map((item) => item.id);
unique(itemIds, "backlog item IDs");
check(
  items.filter((item) => item.status === "active").length <= 1,
  "At most one backlog item may be active",
);
for (const item of items) {
  check(
    gateIds.includes(item.target_gate),
    `${item.id} targets unknown gate ${item.target_gate}`,
  );
  for (const dependency of item.dependencies ?? []) {
    check(
      itemIds.includes(dependency),
      `${item.id} has unknown dependency ${dependency}`,
    );
    check(dependency !== item.id, `${item.id} depends on itself`);
  }
  if (item.status === "blocked")
    check(
      (item.blockers ?? []).length > 0,
      `${item.id} is blocked without blockers`,
    );
  if (item.status === "done")
    check(
      (item.evidence_ids ?? []).length > 0,
      `${item.id} is done without evidence`,
    );
}

function visit(id, chain = []) {
  if (chain.includes(id)) {
    errors.push(`Backlog dependency cycle: ${[...chain, id].join(" -> ")}`);
    return;
  }
  const item = items.find((candidate) => candidate.id === id);
  for (const dependency of item?.dependencies ?? [])
    visit(dependency, [...chain, id]);
}
for (const id of itemIds) visit(id);

if (goal) {
  check(goal.version === 2, "Goal version must be 2");
  check(
    goal.status === "UNPROVEN" || goal.status === "PROVEN",
    "Goal status must be UNPROVEN or PROVEN",
  );
  check(
    goal.acceptance_authority?.user_acceptance_required === true,
    "User acceptance must be required",
  );
  console.log(`DECISION_HOLES ${findDecisionHoles(goal)}`);
}

if (assets) {
  const packages = assets.packages ?? [];
  unique(
    packages.map((entry) => entry.id),
    "asset package IDs",
  );
  for (const entry of packages) {
    check(
      ["NEEDS_HUMAN_REVIEW", "APPROVED", "REJECTED"].includes(
        entry.commercial_status,
      ),
      `${entry.id} has invalid commercial_status`,
    );
  }
}

if (errors.length) {
  for (const error of errors) console.error(`FAIL ${error}`);
  console.error(`HARNESS FAIL (${errors.length} errors)`);
  process.exit(1);
}

console.log(
  `HARNESS PASS (${gates.length} gates, ${items.length} backlog items, ${dimensions.length} rubric dimensions)`,
);
