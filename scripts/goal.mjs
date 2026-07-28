#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOAL_DIR = path.join(ROOT, ".goal");
const BACKLOG_PATH = path.join(GOAL_DIR, "backlog.json");
const REVIEW_DIR = path.join(GOAL_DIR, "evidence", "reviews");

function fail(message, code = 1) {
  console.error(`ERROR: ${message}`);
  process.exit(code);
}

function readJson(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!existsSync(absolutePath))
    fail(`Required harness file is missing: ${relativePath}`);

  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    fail(`Invalid JSON in ${relativePath}: ${error.message}`);
  }
}

function writeJson(absolutePath, value) {
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArguments(argv) {
  const command = (argv[0] ?? "status").toLowerCase();
  const options = {};

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("-")) continue;
    const key = token.replace(/^-+/, "").toLowerCase();
    const next = argv[index + 1];
    if (next && !next.startsWith("-")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }

  return { command, options };
}

function getGates(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.gates)) return data.gates;
  return Object.entries(data.gates ?? {}).map(([id, gate]) => ({
    id,
    ...gate,
  }));
}

function getItems(data) {
  if (!Array.isArray(data.items))
    fail(".goal/backlog.json must contain an items array.");
  return data.items;
}

function collectDecisionHoles(value, prefix = "") {
  const holes = [];
  if (value === "NEEDS_USER_DECISION") holes.push(prefix || "<root>");
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      holes.push(...collectDecisionHoles(entry, `${prefix}[${index}]`)),
    );
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      holes.push(
        ...collectDecisionHoles(entry, prefix ? `${prefix}.${key}` : key),
      );
    }
  }
  return holes;
}

function eligibleItem(items) {
  const active = items.find((item) => item.status === "active");
  if (active) return { item: active, reason: "ACTIVE_ITEM_EXISTS" };

  const completed = new Set(
    items.filter((item) => item.status === "done").map((item) => item.id),
  );
  const ready = items
    .filter(
      (item) =>
        item.status === "ready" &&
        (item.dependencies ?? []).every((dependency) =>
          completed.has(dependency),
        ),
    )
    .sort(
      (left, right) =>
        (left.priority ?? 999) - (right.priority ?? 999) ||
        left.id.localeCompare(right.id),
    );

  return ready.length > 0
    ? { item: ready[0], reason: "HIGHEST_PRIORITY_READY" }
    : { item: null, reason: "NO_ELIGIBLE_ITEM" };
}

function printItem(item) {
  if (!item) {
    console.log("Next: NONE");
    return;
  }

  console.log(
    `Next: ${item.id} [${item.target_gate}] ${item.title ?? item.problem_evidence}`,
  );
  console.log(`Priority: ${item.priority ?? "unset"} | Status: ${item.status}`);
  console.log(`Why: ${item.problem_evidence ?? "See backlog entry."}`);
  console.log("Acceptance:");
  for (const check of item.acceptance_checks ?? []) console.log(`  - ${check}`);
  console.log("Verify:");
  for (const command of item.verification_commands ?? [])
    console.log(`  - ${command}`);
  for (const check of item.human_checks ?? [])
    console.log(`  - HUMAN: ${check}`);
}

function resolveEvidence(value) {
  if (!value) return [];
  const entries = String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.map((entry) => {
    const absolutePath = path.resolve(ROOT, entry);
    const relativePath = path.relative(ROOT, absolutePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      fail(`Evidence must stay inside the repository: ${entry}`);
    }
    if (!existsSync(absolutePath)) fail(`Evidence does not exist: ${entry}`);
    return relativePath.replaceAll(path.sep, "/");
  });
}

function findItem(backlog, id) {
  const item = getItems(backlog).find((candidate) => candidate.id === id);
  if (!item) fail(`Unknown backlog item: ${id}`);
  return item;
}

function requireTask(options) {
  const id = options.task ?? options.id;
  if (!id) fail("Provide --task <id>.");
  return id;
}

function statusCommand() {
  const goal = readJson(".goal/goal.json");
  const gates = getGates(readJson(".goal/gates.json"));
  const backlog = readJson(".goal/backlog.json");
  const items = getItems(backlog);
  const holes = collectDecisionHoles(goal);
  const counts = Object.fromEntries(
    ["ready", "active", "blocked", "review", "done"].map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ]),
  );

  console.log(
    `Goal: ${goal.title ?? goal.objective ?? "Premium commercial release"}`,
  );
  console.log(`Proof status: ${goal.status ?? "UNKNOWN"}`);
  console.log(`Decision holes: ${holes.length ? holes.join(", ") : "none"}`);
  console.log("Gates:");
  for (const gate of gates) {
    console.log(
      `  ${gate.id}: ${gate.status ?? "UNKNOWN"} - ${gate.name ?? gate.title ?? ""}`,
    );
  }
  console.log(
    `Backlog: ${Object.entries(counts)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ")}`,
  );
  const next = eligibleItem(items);
  console.log(`Selection reason: ${next.reason}`);
  printItem(next.item);
}

function nextCommand() {
  const backlog = readJson(".goal/backlog.json");
  const next = eligibleItem(getItems(backlog));
  console.log(`Selection reason: ${next.reason}`);
  printItem(next.item);
  if (!next.item) process.exitCode = 2;
}

function startCommand(options) {
  const backlog = readJson(".goal/backlog.json");
  const items = getItems(backlog);
  const selected = eligibleItem(items);
  const id = options.task ?? selected.item?.id;
  if (!id) fail("No eligible task is available.", 2);
  const item = findItem(backlog, id);
  if (
    items.some(
      (candidate) => candidate.status === "active" && candidate.id !== id,
    )
  ) {
    fail(
      "Another task is already active. Finish or return it before starting a new one.",
      2,
    );
  }
  if (item.status !== "ready" && item.status !== "active") {
    fail(`${id} is ${item.status}; only a ready task can be started.`);
  }
  const completed = new Set(
    items
      .filter((candidate) => candidate.status === "done")
      .map((candidate) => candidate.id),
  );
  const missing = (item.dependencies ?? []).filter(
    (dependency) => !completed.has(dependency),
  );
  if (missing.length)
    fail(`${id} has incomplete dependencies: ${missing.join(", ")}`, 2);

  item.status = "active";
  item.started_at = item.started_at ?? new Date().toISOString();
  writeJson(BACKLOG_PATH, backlog);
  console.log(`ACTIVE: ${id}`);
  printItem(item);
}

function submitCommand(options) {
  const id = requireTask(options);
  const evidence = resolveEvidence(options.evidence);
  if (!evidence.length)
    fail("Submission requires --evidence <repo-path[,repo-path]>.");
  const backlog = readJson(".goal/backlog.json");
  const item = findItem(backlog, id);
  if (item.status !== "active") fail(`${id} must be active before submission.`);

  item.evidence_ids = [...new Set([...(item.evidence_ids ?? []), ...evidence])];
  item.status = "review";
  item.submitted_at = new Date().toISOString();
  writeJson(BACKLOG_PATH, backlog);
  console.log(`REVIEW: ${id}`);
  console.log(`Evidence: ${evidence.join(", ")}`);
}

function reviewCommand(options) {
  const id = requireTask(options);
  const type = String(options.type ?? options.reviewtype ?? "").toLowerCase();
  const result = String(options.result ?? "").toUpperCase();
  if (!["self", "independent"].includes(type))
    fail("--type must be self or independent.");
  if (!["PASS", "FAIL", "UNKNOWN"].includes(result))
    fail("--result must be PASS, FAIL, or UNKNOWN.");
  const evidence = resolveEvidence(options.evidence);
  if (result === "PASS" && evidence.length === 0)
    fail("A PASS review requires --evidence.");

  const backlog = readJson(".goal/backlog.json");
  const item = findItem(backlog, id);
  if (!["active", "review"].includes(item.status))
    fail(`${id} is not ready for review.`);
  if (
    type === "independent" &&
    !(item.reviews ?? []).some((review) => review.type === "self")
  ) {
    fail("Independent review requires a recorded self-review first.");
  }

  const review = {
    version: 1,
    review_id: `${id}-${type}-${Date.now()}`,
    created_at_utc: new Date().toISOString(),
    backlog_item_id: id,
    reviewer_role:
      type === "self" ? "implementer_self_review" : "independent_agent",
    independent_of_implementer: type === "independent",
    verdict: result,
    acceptance_results: (item.acceptance_checks ?? []).map(
      (acceptanceCheck) => ({
        acceptance_check: acceptanceCheck,
        status: result,
        evidence_ids: evidence,
        notes: options.note ?? "",
      }),
    ),
    counterexamples: options.counterexample
      ? [String(options.counterexample)]
      : [],
    missing_evidence:
      result === "UNKNOWN"
        ? [String(options.missing ?? "Review evidence is incomplete.")]
        : [],
    blocking_findings:
      result === "FAIL"
        ? [String(options.finding ?? "Acceptance evidence failed.")]
        : [],
    non_blocking_findings: [],
    evidence_ids: evidence,
  };
  mkdirSync(REVIEW_DIR, { recursive: true });
  const stamp = review.created_at_utc.replaceAll(":", "-").replaceAll(".", "-");
  const reviewPath = path.join(REVIEW_DIR, `${stamp}-${id}-${type}.json`);
  writeJson(reviewPath, review);
  const relativeReviewPath = path
    .relative(ROOT, reviewPath)
    .replaceAll(path.sep, "/");

  item.reviews = [
    ...(item.reviews ?? []),
    {
      type,
      result,
      record: relativeReviewPath,
      created_at: review.created_at_utc,
    },
  ];
  item.evidence_ids = [
    ...new Set([...(item.evidence_ids ?? []), ...evidence, relativeReviewPath]),
  ];
  item.status = result === "FAIL" ? "active" : "review";
  writeJson(BACKLOG_PATH, backlog);

  console.log(`${result}: ${id} ${type} review`);
  console.log(`Record: ${relativeReviewPath}`);
  if (result === "UNKNOWN") console.log("UNKNOWN is not completion evidence.");
}

function completeCommand(options) {
  const id = requireTask(options);
  const humanEvidence = resolveEvidence(
    options["human-evidence"] ?? options.humanevidence,
  );
  const backlog = readJson(".goal/backlog.json");
  const item = findItem(backlog, id);
  if (item.status !== "review")
    fail(`${id} must be in review before completion.`);
  const reviews = item.reviews ?? [];
  if (
    !reviews.some(
      (review) => review.type === "self" && review.result === "PASS",
    )
  ) {
    fail("Missing self-review PASS.");
  }
  if (
    !reviews.some(
      (review) => review.type === "independent" && review.result === "PASS",
    )
  ) {
    fail("Missing independent-review PASS.");
  }
  if ((item.human_checks ?? []).length > 0 && humanEvidence.length === 0) {
    fail(
      "This task has human checks. Provide --human-evidence <repo-path[,repo-path]>.",
      2,
    );
  }

  item.human_evidence_ids = [
    ...new Set([...(item.human_evidence_ids ?? []), ...humanEvidence]),
  ];
  item.evidence_ids = [
    ...new Set([...(item.evidence_ids ?? []), ...humanEvidence]),
  ];
  item.status = "done";
  item.completed_at = new Date().toISOString();
  writeJson(BACKLOG_PATH, backlog);
  console.log(`DONE: ${id}`);
}

function blockCommand(options) {
  const id = requireTask(options);
  const reason = String(options.reason ?? "").trim();
  if (!reason) fail("Blocking requires --reason <exact external dependency>.");
  const backlog = readJson(".goal/backlog.json");
  const item = findItem(backlog, id);
  if (item.status === "done")
    fail(`${id} is done and cannot be blocked without invalidation.`);

  item.status = "blocked";
  item.blockers = [...new Set([...(item.blockers ?? []), reason])];
  item.blocked_at = new Date().toISOString();
  writeJson(BACKLOG_PATH, backlog);
  console.log(`BLOCKED: ${id}`);
  console.log(`Reason: ${reason}`);
}

function verifyCommand(options) {
  const gate = String(options.gate ?? "").toUpperCase();
  if (!gate) fail("Provide --gate <G0..G6>.");
  const profile =
    gate === "G2" ? "fast" : gate === "G3" ? "browser" : "release";
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "verify.mjs"), profile],
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );
  process.exitCode = result.status ?? 1;
}

function helpCommand() {
  console.log(`Goal harness

  npm run goal -- status
  npm run goal -- next
  npm run goal -- start [--task Q-001]
  npm run goal -- submit --task Q-001 --evidence <path[,path]>
  npm run goal -- review --task Q-001 --type self|independent --result PASS|FAIL|UNKNOWN --evidence <path[,path]> [--note text]
  npm run goal -- complete --task Q-001 [--human-evidence <path[,path]>]
  npm run goal -- block --task Q-001 --reason <exact external dependency>
  npm run goal -- verify --gate G2|G3|G4|G5|G6

Rules: one active task; no PASS without evidence; independent review follows self-review;
human checks need human evidence; missing product decisions never become implicit assumptions.`);
}

const { command, options } = parseArguments(process.argv.slice(2));

switch (command) {
  case "status":
    statusCommand();
    break;
  case "next":
    nextCommand();
    break;
  case "start":
    startCommand(options);
    break;
  case "submit":
    submitCommand(options);
    break;
  case "review":
    reviewCommand(options);
    break;
  case "complete":
    completeCommand(options);
    break;
  case "block":
    blockCommand(options);
    break;
  case "verify":
    verifyCommand(options);
    break;
  case "help":
  case "--help":
  case "-h":
    helpCommand();
    break;
  default:
    fail(`Unknown command: ${command}. Run "npm run goal -- help".`);
}
