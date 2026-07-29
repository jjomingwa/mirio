import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeGateContractHash,
  computeTaskContractHash,
  verifyManifestIntegrity,
} from "./lib/integrity.mjs";
import { validateSchemaDocument } from "./lib/schema-validator.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

const profiles = {
  fast: [
    {
      name: "harness",
      command: process.execPath,
      args: [path.join(ROOT, "scripts", "validate-goal.mjs")],
      recordedCommand: "npm run goal:validate",
    },
    {
      name: "format",
      command: NPM,
      args: ["run", "format:check"],
      recordedCommand: "npm run format:check",
    },
    {
      name: "lint",
      command: NPM,
      args: ["run", "lint"],
      recordedCommand: "npm run lint",
    },
    {
      name: "unit",
      command: NPM,
      args: ["test"],
      recordedCommand: "npm test",
    },
    {
      name: "build",
      command: NPM,
      args: ["run", "build"],
      recordedCommand: "npm run build",
    },
  ],
  browser: [
    {
      name: "e2e",
      command: NPM,
      args: ["run", "test:e2e"],
      recordedCommand: "npm run test:e2e",
      timeout: 300_000,
    },
  ],
  release: [
    {
      name: "harness",
      command: process.execPath,
      args: [path.join(ROOT, "scripts", "validate-goal.mjs")],
      recordedCommand: "npm run goal:validate",
    },
    {
      name: "format",
      command: NPM,
      args: ["run", "format:check"],
      recordedCommand: "npm run format:check",
    },
    {
      name: "lint",
      command: NPM,
      args: ["run", "lint"],
      recordedCommand: "npm run lint",
    },
    {
      name: "unit",
      command: NPM,
      args: ["test"],
      recordedCommand: "npm test",
    },
    {
      name: "build",
      command: NPM,
      args: ["run", "build"],
      recordedCommand: "npm run build",
    },
    {
      name: "assets",
      command: NPM,
      args: ["run", "audit:assets"],
      recordedCommand: "npm run audit:assets",
    },
    {
      name: "e2e",
      command: NPM,
      args: ["run", "test:e2e"],
      recordedCommand: "npm run test:e2e",
      timeout: 300_000,
    },
    {
      name: "release-audit",
      command: process.execPath,
      args: [path.join(ROOT, "scripts", "release-audit.mjs")],
      recordedCommand: "npm run audit:release",
    },
  ],
};

export function parseVerificationArguments(argv) {
  const profile = String(argv[0] ?? "fast").toLowerCase();
  let taskId = null;
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] !== "--task") continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("-")) {
      throw new Error("Provide a task ID after --task.");
    }
    taskId = value;
    index += 1;
  }
  return { profile, taskId };
}

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function requiredGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`,
    );
  }
  return result.stdout;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

const SOURCE_EXCLUDED_PREFIXES = [
  ".cache/",
  ".goal/backlog.json",
  ".goal/evidence/",
  "coverage/",
  "dist/",
  "node_modules/",
  "playwright-report/",
  "test-results/",
];
const SOURCE_EXCLUDED_SUFFIXES = [".tsbuildinfo"];

function isExplicitlyExcludedSource(relativePath) {
  return (
    SOURCE_EXCLUDED_PREFIXES.some((prefix) =>
      relativePath.startsWith(prefix),
    ) ||
    SOURCE_EXCLUDED_SUFFIXES.some((suffix) => relativePath.endsWith(suffix))
  );
}

function hashFile(absolutePath) {
  const digest = createHash("sha256");
  const descriptor = openSync(absolutePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(descriptor);
  }
  return digest.digest("hex");
}

function createWorkspaceSourceSnapshot() {
  const listed = requiredGit(
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { maxBuffer: 50 * 1024 * 1024 },
  );
  const relativePaths = [
    ...new Set(
      listed
        .split("\0")
        .filter(Boolean)
        .map((entry) => entry.replaceAll("\\", "/"))
        .filter((entry) => !isExplicitlyExcludedSource(entry)),
    ),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  const files = relativePaths.map((relativePath) => {
    const absolutePath = path.join(ROOT, ...relativePath.split("/"));
    const fileState = lstatSync(absolutePath);
    if (fileState.isSymbolicLink()) {
      const target = readlinkSync(absolutePath);
      const targetBytes = Buffer.from(target, "utf8");
      return {
        path: relativePath,
        kind: "symlink",
        size_bytes: targetBytes.length,
        sha256: hash(targetBytes),
      };
    }
    if (!fileState.isFile()) {
      throw new Error(
        `Source inventory entry is not a regular file or symlink: ${relativePath}`,
      );
    }
    return {
      path: relativePath,
      kind: "file",
      size_bytes: fileState.size,
      sha256: hashFile(absolutePath),
    };
  });

  const canonicalFingerprintInput = files
    .map(
      (entry) =>
        `${entry.path}\0${entry.kind}\0${entry.size_bytes}\0${entry.sha256}\n`,
    )
    .join("");

  return {
    fingerprint_sha256: hash(canonicalFingerprintInput),
    included_file_count: files.length,
    included_total_bytes: files.reduce(
      (total, entry) => total + entry.size_bytes,
      0,
    ),
    files,
  };
}

export function loadVerificationContext(root, requestedTaskId = null) {
  const backlogPath = path.join(root, ".goal", "backlog.json");
  const backlog = JSON.parse(readFileSync(backlogPath, "utf8"));
  const items = backlog.items ?? [];
  let task;
  if (requestedTaskId) {
    task = items.find((item) => item.id === requestedTaskId);
    if (!task) {
      throw new Error(
        `Unknown verification task ${requestedTaskId}; choose an ID from .goal/backlog.json.`,
      );
    }
  }

  const candidates = (backlog.items ?? []).filter((item) =>
    ["active", "review"].includes(item.status),
  );
  if (!task && candidates.length !== 1) {
    throw new Error(
      candidates.length === 0
        ? "No active or review task identifies this verification run; provide --task <id>."
        : `Ambiguous verification context; found active/review tasks ${candidates.map((item) => item.id).join(", ")}. Provide --task <id>.`,
    );
  }
  task ??= candidates[0];

  const gatesPath = path.join(root, ".goal", "gates.json");
  const gatesDocument = JSON.parse(readFileSync(gatesPath, "utf8"));
  const gate = (gatesDocument.gates ?? []).find(
    (candidate) => candidate.id === task.target_gate,
  );
  if (!gate) {
    throw new Error(
      `Task ${task.id} targets missing gate ${task.target_gate} in .goal/gates.json.`,
    );
  }
  return { task, gate };
}

function resolveLocalSchemaReference(reference, rootSchema) {
  if (!reference.startsWith("#/")) {
    throw new Error(`Unsupported evidence schema reference: ${reference}`);
  }
  return reference
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((current, segment) => current?.[segment], rootSchema);
}

function schemaTypeMatches(value, expectedType) {
  switch (expectedType) {
    case "array":
      return Array.isArray(value);
    case "integer":
      return Number.isInteger(value);
    case "null":
      return value === null;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return (
        value !== null && typeof value === "object" && !Array.isArray(value)
      );
    default:
      return typeof value === expectedType;
  }
}

function validateJsonSchema(
  value,
  schema,
  rootSchema,
  location = "$",
  errors = [],
) {
  if (schema.$ref) {
    const referencedSchema = resolveLocalSchemaReference(
      schema.$ref,
      rootSchema,
    );
    if (!referencedSchema) {
      errors.push(`${location}: unresolved schema reference ${schema.$ref}`);
      return errors;
    }
    validateJsonSchema(value, referencedSchema, rootSchema, location, errors);
  }

  if (
    Object.hasOwn(schema, "const") &&
    JSON.stringify(value) !== JSON.stringify(schema.const)
  ) {
    errors.push(`${location}: value does not match const`);
  }
  if (
    schema.enum &&
    !schema.enum.some(
      (candidate) => JSON.stringify(candidate) === JSON.stringify(value),
    )
  ) {
    errors.push(`${location}: value is not in enum`);
  }

  if (schema.type) {
    const allowedTypes = Array.isArray(schema.type)
      ? schema.type
      : [schema.type];
    if (!allowedTypes.some((type) => schemaTypeMatches(value, type))) {
      errors.push(
        `${location}: expected ${allowedTypes.join("|")}, received ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`,
      );
      return errors;
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${location}: string is shorter than ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${location}: string does not match ${schema.pattern}`);
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      errors.push(`${location}: invalid date-time`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${location}: number is below ${schema.minimum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${location}: array has fewer than ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${location}: array has more than ${schema.maxItems} items`);
    }
    if (
      schema.uniqueItems &&
      new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length
    ) {
      errors.push(`${location}: array items are not unique`);
    }
    if (schema.items) {
      value.forEach((entry, index) =>
        validateJsonSchema(
          entry,
          schema.items,
          rootSchema,
          `${location}[${index}]`,
          errors,
        ),
      );
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const requiredKey of schema.required ?? []) {
      if (!Object.hasOwn(value, requiredKey)) {
        errors.push(`${location}: missing required property ${requiredKey}`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) {
          errors.push(`${location}: unexpected property ${key}`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(
      schema.properties ?? {},
    )) {
      if (Object.hasOwn(value, key)) {
        validateJsonSchema(
          value[key],
          propertySchema,
          rootSchema,
          `${location}.${key}`,
          errors,
        );
      }
    }
  }

  for (const childSchema of schema.allOf ?? []) {
    validateJsonSchema(value, childSchema, rootSchema, location, errors);
  }
  if (schema.if) {
    const conditionErrors = [];
    validateJsonSchema(value, schema.if, rootSchema, location, conditionErrors);
    if (conditionErrors.length === 0 && schema.then) {
      validateJsonSchema(value, schema.then, rootSchema, location, errors);
    }
  }

  return errors;
}

function validateEvidenceManifest(manifest) {
  const schemaPath = path.join(
    ROOT,
    ".goal",
    "schemas",
    "evidence.schema.json",
  );
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const auditedErrors = validateSchemaDocument({
    schema,
    value: manifest,
    document: path.relative(ROOT, schemaPath),
  }).map(
    (error) =>
      `${error.instancePath || "$"} [${error.keyword}] ${error.message}`,
  );
  const errors = [
    ...auditedErrors,
    ...validateJsonSchema(manifest, schema, schema),
  ];
  if (errors.length > 0) {
    throw new Error(
      `Evidence manifest does not match ${path.relative(ROOT, schemaPath)}:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }
}

export function buildEvidenceManifest({
  profile,
  runId,
  startedAt,
  commitSha,
  dirtyWorktree,
  sourceStateBefore,
  sourceStateAfter,
  sourceInventory,
  sourceInventoryReference,
  sourceInventorySha256,
  results,
  task,
  gate,
}) {
  const sourceStateStable =
    sourceStateBefore.fingerprint_sha256 ===
    sourceStateAfter.fingerprint_sha256;
  const allChecksPassed =
    results.every((result) => result.status === "PASS") && sourceStateStable;

  return {
    version: 1,
    run_id: runId,
    created_at_utc: startedAt.toISOString(),
    commit_sha: commitSha,
    dirty_worktree: dirtyWorktree,
    task_contract_sha256: computeTaskContractHash(task),
    gate_contract_sha256: computeGateContractHash(gate),
    source_state: {
      algorithm: "sha256",
      fingerprint_sha256: sourceStateBefore.fingerprint_sha256,
      post_run_fingerprint_sha256: sourceStateAfter.fingerprint_sha256,
      stable_during_run: sourceStateStable,
      inventory_reference: sourceInventoryReference,
      inventory_sha256: sourceInventorySha256,
      included_file_count: sourceStateBefore.included_file_count,
      included_total_bytes: sourceStateBefore.included_total_bytes,
      selection_command: sourceInventory.selection_command,
      explicit_excluded_prefixes: SOURCE_EXCLUDED_PREFIXES,
      explicit_excluded_suffixes: SOURCE_EXCLUDED_SUFFIXES,
    },
    environment: {
      operating_system: `${process.platform} ${process.arch}`,
      node_version: process.version,
      browser_versions: [],
    },
    gate_id: gate.id,
    backlog_item_id: task.id,
    status: allChecksPassed ? "UNKNOWN" : "FAIL",
    commands: results.map((result) => ({
      command: result.command,
      exit_code: result.exit_code,
      duration_ms: result.duration_ms,
      output_reference: result.log,
    })),
    artifacts: [
      ...results.map((result) => ({
        kind: "log",
        reference: result.log,
        sha256: result.output_sha256,
      })),
      {
        kind: "report",
        reference: sourceInventoryReference,
        sha256: sourceInventorySha256,
      },
    ],
    requirement_results: [
      ...results.map((result) => ({
        requirement_id: `verification:${profile}:${result.name}`,
        status: result.status,
        evidence_ids: [result.log],
        notes: result.error ?? "",
      })),
      {
        requirement_id: "verification:source-state-stable",
        status: sourceStateStable ? "PASS" : "FAIL",
        evidence_ids: [sourceInventoryReference],
        notes: sourceStateStable
          ? "Workspace source fingerprint was unchanged during verification."
          : `Workspace source changed during verification: ${sourceStateBefore.fingerprint_sha256} -> ${sourceStateAfter.fingerprint_sha256}`,
      },
    ],
    self_review_id: null,
    independent_review_id: null,
    external_cohort_id: null,
  };
}

export function runVerification(argv = process.argv.slice(2)) {
  const { profile, taskId } = parseVerificationArguments(argv);
  if (!profiles[profile]) {
    throw new Error(
      `Unknown verification profile: ${profile}. Use fast, browser, or release.`,
    );
  }

  const { task, gate } = loadVerificationContext(ROOT, taskId);
  const startedAt = new Date();
  const runId = `${startedAt.toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${profile}`;
  const runDirectory = path.join(ROOT, ".goal", "evidence", "runs", runId);
  const sourceStateBefore = createWorkspaceSourceSnapshot();
  mkdirSync(runDirectory, { recursive: true });

  const sourceInventory = {
    version: 1,
    root: ".",
    algorithm: "sha256",
    selection_command: "git ls-files --cached --others --exclude-standard -z",
    selection_policy:
      "Tracked and untracked non-ignored files, minus explicit generated-output exclusions.",
    canonical_fingerprint_input:
      "Entries sorted by ordinal normalized path; path NUL kind NUL decimal size NUL lowercase content SHA-256 LF.",
    explicit_excluded_prefixes: SOURCE_EXCLUDED_PREFIXES,
    explicit_excluded_suffixes: SOURCE_EXCLUDED_SUFFIXES,
    fingerprint_sha256: sourceStateBefore.fingerprint_sha256,
    included_file_count: sourceStateBefore.included_file_count,
    included_total_bytes: sourceStateBefore.included_total_bytes,
    files: sourceStateBefore.files,
  };
  const sourceInventoryText = `${JSON.stringify(sourceInventory, null, 2)}\n`;
  const sourceInventoryPath = path.join(runDirectory, "source-inventory.json");
  writeFileSync(sourceInventoryPath, sourceInventoryText, "utf8");
  const sourceInventoryReference = path
    .relative(ROOT, sourceInventoryPath)
    .replaceAll(path.sep, "/");
  const sourceInventorySha256 = hash(sourceInventoryText);

  const results = [];
  for (const check of profiles[profile]) {
    const checkStarted = Date.now();
    console.log(`RUN ${check.name}: ${check.recordedCommand}`);
    const usesWindowsCommandShim =
      process.platform === "win32" && check.command.endsWith(".cmd");
    const executable = usesWindowsCommandShim
      ? (process.env.ComSpec ?? "cmd.exe")
      : check.command;
    const executableArgs = usesWindowsCommandShim
      ? ["/d", "/s", "/c", [check.command, ...check.args].join(" ")]
      : check.args;
    const result = spawnSync(executable, executableArgs, {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
      timeout: check.timeout ?? 240_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const logName = `${String(results.length + 1).padStart(2, "0")}-${check.name}.log`;
    writeFileSync(path.join(runDirectory, logName), output, "utf8");
    const exitCode = result.status ?? (result.error ? 1 : 0);
    const status = exitCode === 0 ? "PASS" : "FAIL";
    console.log(`${status} ${check.name} (${Date.now() - checkStarted}ms)`);
    if (result.error) console.log(`  ${result.error.message}`);

    results.push({
      name: check.name,
      command: check.recordedCommand,
      status,
      exit_code: exitCode,
      duration_ms: Date.now() - checkStarted,
      output_sha256: hash(output),
      log: path
        .relative(ROOT, path.join(runDirectory, logName))
        .replaceAll(path.sep, "/"),
      error: result.error?.message ?? null,
    });
  }

  const sourceStateAfter = createWorkspaceSourceSnapshot();
  const allChecksPassed =
    results.every((result) => result.status === "PASS") &&
    sourceStateBefore.fingerprint_sha256 ===
      sourceStateAfter.fingerprint_sha256;
  const commitSha = git(["rev-parse", "--verify", "HEAD"]) ?? "NO_COMMIT";
  const dirtyWorktree = Boolean(
    requiredGit(["status", "--porcelain=v1", "--untracked-files=all"]).trim(),
  );
  const manifest = buildEvidenceManifest({
    profile,
    runId,
    startedAt,
    commitSha,
    dirtyWorktree,
    sourceStateBefore,
    sourceStateAfter,
    sourceInventory,
    sourceInventoryReference,
    sourceInventorySha256,
    results,
    task,
    gate,
  });

  const manifestPath = path.join(runDirectory, "manifest.json");
  validateEvidenceManifest(manifest);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const writtenManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  validateEvidenceManifest(writtenManifest);
  const integrityIssues = verifyManifestIntegrity({
    root: ROOT,
    manifest: writtenManifest,
    task,
    gate,
  });
  for (const integrityIssue of integrityIssues) {
    console.error(
      `INTEGRITY ${integrityIssue.code} ${integrityIssue.path}: ${integrityIssue.message}`,
    );
  }

  console.log("EVIDENCE_SCHEMA PASS");
  console.log(
    `MANIFEST ${path.relative(ROOT, manifestPath).replaceAll(path.sep, "/")}`,
  );
  console.log(`TASK ${task.id} TARGET_GATE ${gate.id} PROFILE ${profile}`);
  console.log(`CHECKS ${allChecksPassed ? "PASS" : "FAIL"}`);
  console.log(`CLAIM ${manifest.status} (independent review not attached)`);
  if (!allChecksPassed || integrityIssues.length > 0) process.exitCode = 1;

  return { manifest, manifestPath, integrityIssues };
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    runVerification();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 2;
  }
}
