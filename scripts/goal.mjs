#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeTaskContractHash,
  hashFileBytes,
  loadManifestFromFile,
  resolveRepoRegularFile,
  verifyManifestIntegrity,
} from "./lib/integrity.mjs";
import {
  deriveReviewVerdict,
  verifyExternalReview,
} from "./lib/review-integrity.mjs";
import { validateSchemaDocument } from "./lib/schema-validator.mjs";
import { deriveGateStatus, deriveGoalStatus } from "./lib/status-integrity.mjs";
import { invalidateCompletedItem } from "./lib/lifecycle-integrity.mjs";
import { loadExternalTrustStore } from "./lib/reviewer-trust.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOAL_DIR = path.join(ROOT, ".goal");
const BACKLOG_PATH = path.join(GOAL_DIR, "backlog.json");

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

function externalTrustStore() {
  try {
    return loadExternalTrustStore({
      root: ROOT,
      configuredPath: process.env.GOAL_REVIEW_TRUST_STORE,
    });
  } catch (error) {
    fail(error.message);
  }
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

function formatIntegrityIssues(issues) {
  return issues
    .map((entry) => {
      const location = entry.path ?? entry.instancePath ?? "$";
      const code = entry.code ?? entry.keyword ?? "INVALID";
      return `${location} [${code}] ${entry.message}`;
    })
    .join("\n");
}

function validateDocument(relativeSchemaPath, value, document) {
  const schema = readJson(relativeSchemaPath);
  const issues = validateSchemaDocument({ schema, value, document });
  if (issues.length > 0) {
    fail(
      `${document} does not match ${relativeSchemaPath}:\n${formatIntegrityIssues(issues)}`,
    );
  }
}

function inspectTaskManifest(reference, item) {
  const issues = [];
  const loaded = loadManifestFromFile(ROOT, reference);
  issues.push(...loaded.issues);
  if (!loaded.manifest) return { ok: false, issues };

  const schema = readJson(".goal/schemas/evidence.schema.json");
  issues.push(
    ...validateSchemaDocument({
      schema,
      value: loaded.manifest,
      document: reference,
    }),
  );
  const gate = getGates(readJson(".goal/gates.json")).find(
    (candidate) => candidate.id === item.target_gate,
  );
  if (!gate) {
    issues.push({
      code: "TARGET_GATE_MISSING",
      path: "$.gate_id",
      message: `${item.id} targets missing gate ${item.target_gate}.`,
    });
  } else {
    issues.push(
      ...verifyManifestIntegrity({
        root: ROOT,
        manifest: loaded.manifest,
        task: item,
        gate,
      }),
    );
  }
  if (loaded.manifest.status === "FAIL") {
    issues.push({
      code: "MANIFEST_FAILED",
      path: "$.status",
      message: "A failed verification manifest cannot be submitted.",
    });
  }
  const resolved = resolveRepoRegularFile(ROOT, reference, "$.manifest");
  issues.push(...resolved.issues);
  return {
    ok: issues.length === 0 && Boolean(resolved.absolutePath),
    issues,
    manifest: loaded.manifest,
    reference: resolved.relativePath ?? reference,
    sha256: resolved.absolutePath ? hashFileBytes(resolved.absolutePath) : null,
  };
}

function verifyTaskManifest(reference, item) {
  const result = inspectTaskManifest(reference, item);
  if (!result.ok) {
    fail(
      `Evidence manifest integrity failed:\n${formatIntegrityIssues(result.issues)}`,
    );
  }
  return result;
}

function readEvidenceJson(reference, schemaPath, documentLabel) {
  const resolved = resolveRepoRegularFile(ROOT, reference, "$.record");
  if (resolved.issues.length > 0 || !resolved.absolutePath) {
    fail(
      `${documentLabel} path failed:\n${formatIntegrityIssues(resolved.issues)}`,
    );
  }
  let value;
  try {
    value = JSON.parse(readFileSync(resolved.absolutePath, "utf8"));
  } catch (error) {
    fail(`${documentLabel} is invalid JSON: ${error.message}`);
  }
  validateDocument(schemaPath, value, documentLabel);
  return { value, reference: resolved.relativePath };
}

function validateAcceptanceResults(record, item) {
  const results = record.acceptance_results ?? [];
  const expected = item.acceptance_checks ?? [];
  if (
    results.length !== expected.length ||
    results.some((result, index) => result.acceptance_check !== expected[index])
  ) {
    fail(
      "Review must contain exactly one ordered result for every acceptance check.",
    );
  }
  for (const [index, result] of results.entries()) {
    if (result.status !== "PASS") continue;
    for (const evidenceId of result.evidence_ids ?? []) {
      const resolved = resolveRepoRegularFile(
        ROOT,
        evidenceId,
        `$.acceptance_results[${index}].evidence_ids`,
      );
      if (resolved.issues.length > 0) {
        fail(
          `Review acceptance evidence is invalid:\n${formatIntegrityIssues(resolved.issues)}`,
        );
      }
    }
  }
  const verdict = deriveReviewVerdict(results);
  if (record.verdict !== verdict) {
    fail(
      `Review verdict ${record.verdict} does not match per-acceptance verdict ${verdict}.`,
    );
  }
  if (
    verdict === "PASS" &&
    ((record.missing_evidence ?? []).length > 0 ||
      (record.blocking_findings ?? []).length > 0)
  ) {
    fail("A PASS review cannot contain missing evidence or blocking findings.");
  }
  return verdict;
}

function validateAcceptanceEvidencePaths(record) {
  for (const [index, result] of (record.acceptance_results ?? []).entries()) {
    if (result.status !== "PASS") continue;
    for (const evidenceId of result.evidence_ids ?? []) {
      const resolved = resolveRepoRegularFile(
        ROOT,
        evidenceId,
        `$.acceptance_results[${index}].evidence_ids`,
      );
      if (resolved.issues.length > 0) {
        fail(
          `Review acceptance evidence is invalid:\n${formatIntegrityIssues(resolved.issues)}`,
        );
      }
    }
  }
}

function verifySelfReviewRecord(reference, item) {
  const record = readEvidenceJson(
    reference,
    ".goal/schemas/review.schema.json",
    "Self-review record",
  );
  if (
    record.value.backlog_item_id !== item.id ||
    record.value.reviewer_role !== "implementer_self_review" ||
    record.value.independent_of_implementer !== false
  ) {
    fail("Self-review identity or task binding is invalid.");
  }
  return { ...record, verdict: validateAcceptanceResults(record.value, item) };
}

function externalTaskContract(item) {
  return {
    id: item.id,
    targetGate: item.target_gate,
    acceptanceChecks: item.acceptance_checks ?? [],
    taskContractSha256: computeTaskContractHash(item),
  };
}

function previousExternalIds(item) {
  const reviewIds = new Set();
  const receiptIds = new Set();
  for (const review of item.reviews ?? []) {
    if (review.type !== "independent") continue;
    const resolved = resolveRepoRegularFile(ROOT, review.record, "$.record");
    if (resolved.issues.length > 0 || !resolved.absolutePath) continue;
    try {
      const record = JSON.parse(readFileSync(resolved.absolutePath, "utf8"));
      reviewIds.add(record.review_id);
      receiptIds.add(record.receipt_id);
    } catch {
      // Invalid historical records are rejected when completion re-verifies them.
    }
  }
  return { reviewIds, receiptIds };
}

function verifyIndependentReviewRecord({
  recordReference,
  item,
  includePreviousIds,
  trustStore = externalTrustStore(),
}) {
  const manifest = verifyTaskManifest(item.verification_manifest, item);
  const record = readEvidenceJson(
    recordReference,
    ".goal/schemas/external-review.schema.json",
    "Independent-review record",
  );
  validateAcceptanceEvidencePaths(record.value);
  const previous = includePreviousIds
    ? previousExternalIds(item)
    : { reviewIds: new Set(), receiptIds: new Set() };
  const verification = verifyExternalReview({
    record: record.value,
    task: externalTaskContract(item),
    implementerSessionId: item.implementer_session_id,
    expectedSourceFingerprint:
      manifest.manifest.source_state.fingerprint_sha256,
    expectedEvidenceBundleSha256: manifest.sha256,
    trustedKeys: trustStore.trustedKeys,
    seenReviewIds: previous.reviewIds,
    seenReceiptIds: previous.receiptIds,
  });
  if (!verification.ok) {
    fail(
      `Independent-review integrity failed:\n${formatIntegrityIssues(verification.issues)}`,
    );
  }
  return {
    ...record,
    trustStorePath: trustStore.path,
    verdict: verification.verdict,
    reviewer: record.value.reviewer,
    receiptId: record.value.receipt_id,
  };
}

function statusCommand() {
  const goal = readJson(".goal/goal.json");
  const gates = getGates(readJson(".goal/gates.json"));
  const backlog = readJson(".goal/backlog.json");
  const items = getItems(backlog);
  const holes = collectDecisionHoles(goal);
  const verifiedEvidenceIds = new Set();
  for (const item of items) {
    const references = new Set([
      ...(item.evidence_ids ?? []),
      ...(item.verification_manifest ? [item.verification_manifest] : []),
    ]);
    for (const reference of references) {
      if (!/^\.goal\/evidence\/runs\/[^/]+\/manifest\.json$/.test(reference))
        continue;
      const inspected = inspectTaskManifest(reference, item);
      if (inspected.ok) verifiedEvidenceIds.add(inspected.reference);
    }
  }
  const proofStatus = deriveGoalStatus({
    gates,
    decisionHoles: holes,
    verifiedEvidenceIds,
  });
  const counts = Object.fromEntries(
    ["ready", "active", "blocked", "review", "done"].map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ]),
  );

  console.log(
    `Goal: ${goal.title ?? goal.objective ?? "Premium commercial release"}`,
  );
  console.log(`Proof status: ${proofStatus}`);
  console.log(`Decision holes: ${holes.length ? holes.join(", ") : "none"}`);
  console.log("Gates:");
  for (const gate of gates) {
    console.log(
      `  ${gate.id}: ${deriveGateStatus(gate, verifiedEvidenceIds)} - ${gate.name ?? gate.title ?? ""}`,
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
  if (evidence.length !== 1)
    fail("Submission requires exactly one --evidence run manifest.");
  const implementerSessionId = String(
    options["implementer-session"] ?? options.implementersession ?? "",
  ).trim();
  if (!implementerSessionId) {
    fail("Submission requires --implementer-session <session-id>.");
  }
  const backlog = readJson(".goal/backlog.json");
  const item = findItem(backlog, id);
  if (item.status !== "active") fail(`${id} must be active before submission.`);
  const verified = verifyTaskManifest(evidence[0], item);

  item.evidence_ids = [verified.reference];
  item.verification_manifest = verified.reference;
  item.source_fingerprint_sha256 =
    verified.manifest.source_state.fingerprint_sha256;
  item.evidence_bundle_sha256 = verified.sha256;
  item.implementer_session_id = implementerSessionId;
  item.reviews = [];
  item.status = "review";
  item.submitted_at = new Date().toISOString();
  writeJson(BACKLOG_PATH, backlog);
  console.log(`REVIEW: ${id}`);
  console.log(`Evidence: ${verified.reference}`);
}

function reviewCommand(options) {
  const id = requireTask(options);
  const type = String(options.type ?? options.reviewtype ?? "").toLowerCase();
  if (!["self", "independent"].includes(type))
    fail("--type must be self or independent.");
  if (options.result || options.evidence || options.note) {
    fail(
      "Inline verdicts are disabled. Supply a per-acceptance --record instead.",
    );
  }
  if (options["public-key"] || options.publickey) {
    fail(
      "Independent reviewer keys must be pre-bound in the submitted source inventory.",
    );
  }
  const recordReference = String(options.record ?? "").trim();
  if (!recordReference) fail("Review requires --record <repo-path>.");
  const trustStore = type === "independent" ? externalTrustStore() : null;

  const backlog = readJson(".goal/backlog.json");
  const item = findItem(backlog, id);
  if (item.status !== "review") fail(`${id} must be submitted before review.`);
  if (!item.verification_manifest) {
    fail(`${id} has no verified submission manifest.`);
  }

  let verifiedReview;
  let reviewEntry;
  if (type === "self") {
    verifiedReview = verifySelfReviewRecord(recordReference, item);
    reviewEntry = {
      type,
      result: verifiedReview.verdict,
      record: verifiedReview.reference,
      created_at: verifiedReview.value.created_at_utc,
    };
  } else {
    const selfPass = (item.reviews ?? []).some(
      (review) => review.type === "self" && review.result === "PASS",
    );
    if (!selfPass) {
      fail("Independent review requires a recorded self-review PASS first.");
    }
    verifiedReview = verifyIndependentReviewRecord({
      recordReference,
      item,
      includePreviousIds: true,
      trustStore,
    });
    reviewEntry = {
      type,
      result: verifiedReview.verdict,
      record: verifiedReview.reference,
      trust_key_id: verifiedReview.value.provenance.key_id,
      reviewer_id: verifiedReview.reviewer.reviewer_id,
      reviewer_session_id: verifiedReview.reviewer.session_id,
      receipt_id: verifiedReview.receiptId,
      created_at: verifiedReview.value.created_at_utc,
    };
  }

  if (
    type === "independent" &&
    verifiedReview.reviewer.session_id === item.implementer_session_id
  ) {
    fail("Independent reviewer session must differ from the implementer.");
  }

  item.reviews = [...(item.reviews ?? []), reviewEntry];
  item.evidence_ids = [
    ...new Set([...(item.evidence_ids ?? []), verifiedReview.reference]),
  ];
  item.status = verifiedReview.verdict === "FAIL" ? "active" : "review";
  writeJson(BACKLOG_PATH, backlog);

  console.log(`${verifiedReview.verdict}: ${id} ${type} review`);
  console.log(`Record: ${verifiedReview.reference}`);
  if (verifiedReview.verdict === "UNKNOWN")
    console.log("UNKNOWN is not completion evidence.");
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
  verifyTaskManifest(item.verification_manifest, item);
  const reviews = item.reviews ?? [];
  const selfReview = [...reviews]
    .reverse()
    .find((review) => review.type === "self");
  if (!selfReview) {
    fail("Missing self-review PASS.");
  }
  const verifiedSelf = verifySelfReviewRecord(selfReview.record, item);
  if (verifiedSelf.verdict !== "PASS") fail("Missing self-review PASS.");

  const independentReview = [...reviews]
    .reverse()
    .find((review) => review.type === "independent");
  if (!independentReview) {
    fail("Missing independent-review PASS.");
  }
  const verifiedIndependent = verifyIndependentReviewRecord({
    recordReference: independentReview.record,
    item,
    includePreviousIds: false,
  });
  if (verifiedIndependent.verdict !== "PASS") {
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

function invalidateCommand(options) {
  const id = requireTask(options);
  const reason = String(options.reason ?? "").trim();
  if (!reason) fail("Invalidation requires --reason <evidence defect>.");

  const backlog = readJson(".goal/backlog.json");
  const item = findItem(backlog, id);
  try {
    invalidateCompletedItem(item, { reason, at: new Date().toISOString() });
  } catch (error) {
    fail(`${id}: ${error.message}`);
  }
  writeJson(BACKLOG_PATH, backlog);
  console.log(`INVALIDATED: ${id}`);
  console.log(`Reason: ${reason}`);
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
  npm run goal -- submit --task Q-001 --evidence <run-manifest> --implementer-session <id>
  npm run goal -- review --task Q-001 --type self --record <self-review.json>
  npm run goal -- review --task Q-001 --type independent --record <external-review.json>
  npm run goal -- complete --task Q-001 [--human-evidence <path[,path]>]
  npm run goal -- invalidate --task Q-001 --reason "<evidence defect>"
  npm run goal -- block --task Q-001 --reason <exact external dependency>
  npm run goal -- verify --gate G2|G3|G4|G5|G6

Rules: one active task; no inline or bulk PASS; independent review follows self-review
and requires an externally signed record; human checks need human evidence; missing product
decisions never become implicit assumptions.`);
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
  case "invalidate":
    invalidateCommand(options);
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
