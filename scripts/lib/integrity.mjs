import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const TASK_CONTRACT_FIELDS = [
  "id",
  "target_gate",
  "scope",
  "dependencies",
  "acceptance_checks",
  "verification_commands",
  "human_checks",
];

function issue(code, pathValue, message, details = {}) {
  return { code, path: pathValue, message, ...details };
}

function canonicalize(value, seen, location) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        `Cannot canonicalize non-finite number at ${location}`,
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new TypeError(
      `Cannot canonicalize ${typeof value} value at ${location}`,
    );
  }
  if (seen.has(value)) {
    throw new TypeError(`Cannot canonicalize cyclic value at ${location}`);
  }

  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((entry, index) =>
      canonicalize(entry, seen, `${location}[${index}]`),
    );
  } else {
    result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize(value[key], seen, `${location}.${key}`);
    }
  }
  seen.delete(value);
  return result;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value, new Set(), "$"));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashFileBytes(absolutePath) {
  return sha256(readFileSync(absolutePath));
}

export function computeTaskContractHash(task) {
  return sha256(
    canonicalJson(
      Object.fromEntries(
        TASK_CONTRACT_FIELDS.map((field) => [field, task?.[field]]),
      ),
    ),
  );
}

function stripGateEvidenceState(value) {
  if (Array.isArray(value)) return value.map(stripGateEvidenceState);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "status" && key !== "evidence_ids")
      .map(([key, entry]) => [key, stripGateEvidenceState(entry)]),
  );
}

export function computeGateContractHash(gate) {
  return sha256(
    canonicalJson({
      id: gate?.id,
      name: gate?.name,
      requirements: stripGateEvidenceState(gate?.requirements),
    }),
  );
}

function isConfined(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function normalizedRelative(rootPath, absolutePath) {
  return path.relative(rootPath, absolutePath).replaceAll(path.sep, "/");
}

export function resolveRepoRegularFile(root, reference, issuePath = "$") {
  const issues = [];
  if (typeof reference !== "string" || reference.length === 0) {
    issues.push(
      issue(
        "FILE_REFERENCE_INVALID",
        issuePath,
        "File reference must be a non-empty string.",
      ),
    );
    return { absolutePath: null, relativePath: null, issues };
  }

  let rootReal;
  try {
    rootReal = realpathSync(root);
  } catch (error) {
    issues.push(
      issue("REPOSITORY_ROOT_INVALID", issuePath, error.message, { root }),
    );
    return { absolutePath: null, relativePath: null, issues };
  }

  const lexicalPath = path.resolve(rootReal, reference);
  if (!isConfined(rootReal, lexicalPath)) {
    issues.push(
      issue(
        "FILE_PATH_ESCAPE",
        issuePath,
        "File reference escapes the repository.",
        { reference },
      ),
    );
    return { absolutePath: null, relativePath: null, issues };
  }

  let resolvedPath;
  try {
    resolvedPath = realpathSync(lexicalPath);
  } catch (error) {
    issues.push(issue("FILE_MISSING", issuePath, error.message, { reference }));
    return { absolutePath: null, relativePath: null, issues };
  }
  if (!isConfined(rootReal, resolvedPath)) {
    issues.push(
      issue(
        "FILE_REALPATH_ESCAPE",
        issuePath,
        "File resolves outside the repository.",
        { reference, resolvedPath },
      ),
    );
    return { absolutePath: null, relativePath: null, issues };
  }
  if (!statSync(resolvedPath).isFile()) {
    issues.push(
      issue("FILE_NOT_REGULAR", issuePath, "Reference is not a regular file.", {
        reference,
      }),
    );
    return { absolutePath: null, relativePath: null, issues };
  }

  return {
    absolutePath: resolvedPath,
    relativePath: normalizedRelative(rootReal, lexicalPath),
    issues,
  };
}

export function loadManifestFromFile(root, reference) {
  const issues = [];
  const normalized = String(reference ?? "").replaceAll("\\", "/");
  if (!/^\.goal\/evidence\/runs\/[^/]+\/manifest\.json$/.test(normalized)) {
    issues.push(
      issue(
        "MANIFEST_PATH_INVALID",
        "$",
        "Evidence must be a run manifest path.",
        { reference },
      ),
    );
    return { manifest: null, issues };
  }

  const resolved = resolveRepoRegularFile(root, reference, "$");
  issues.push(...resolved.issues);
  if (!resolved.absolutePath) return { manifest: null, issues };

  try {
    return {
      manifest: JSON.parse(readFileSync(resolved.absolutePath, "utf8")),
      issues,
    };
  } catch (error) {
    issues.push(issue("MANIFEST_JSON_INVALID", "$", error.message));
    return { manifest: null, issues };
  }
}

export function verifyArtifacts(root, artifacts, issuePath = "$.artifacts") {
  const issues = [];
  if (!Array.isArray(artifacts)) {
    return [
      issue("ARTIFACTS_INVALID", issuePath, "Artifacts must be an array."),
    ];
  }

  const seenReferences = new Set();
  artifacts.forEach((artifact, index) => {
    const artifactPath = `${issuePath}[${index}]`;
    if (!artifact || typeof artifact !== "object") {
      issues.push(
        issue("ARTIFACT_INVALID", artifactPath, "Artifact must be an object."),
      );
      return;
    }
    if (seenReferences.has(artifact.reference)) {
      issues.push(
        issue(
          "ARTIFACT_REFERENCE_DUPLICATE",
          `${artifactPath}.reference`,
          "Artifact reference is duplicated.",
          { reference: artifact.reference },
        ),
      );
    }
    seenReferences.add(artifact.reference);

    if (
      typeof artifact.sha256 !== "string" ||
      !HASH_PATTERN.test(artifact.sha256)
    ) {
      issues.push(
        issue(
          "ARTIFACT_HASH_INVALID",
          `${artifactPath}.sha256`,
          "Artifact SHA-256 must be 64 lowercase hexadecimal characters.",
          { actual: artifact.sha256 },
        ),
      );
    }

    const resolved = resolveRepoRegularFile(
      root,
      artifact.reference,
      `${artifactPath}.reference`,
    );
    issues.push(...resolved.issues);
    if (!resolved.absolutePath) return;

    const actualHash = hashFileBytes(resolved.absolutePath);
    if (artifact.sha256 !== actualHash) {
      issues.push(
        issue(
          "ARTIFACT_HASH_MISMATCH",
          `${artifactPath}.sha256`,
          "Artifact bytes do not match the recorded SHA-256.",
          { expected: artifact.sha256, actual: actualHash },
        ),
      );
    }
  });
  return issues;
}

export function computeSourceInventoryFingerprint(files) {
  const canonicalInput = [...files]
    .sort((left, right) => left.path.localeCompare(right.path, "en"))
    .map(
      (entry) =>
        `${entry.path}\0${entry.kind}\0${entry.size_bytes}\0${entry.sha256}\n`,
    )
    .join("");
  return sha256(canonicalInput);
}

function resolveInventoryEntry(rootReal, entry, entryPath) {
  const issues = [];
  if (
    !entry ||
    typeof entry.path !== "string" ||
    !["file", "symlink"].includes(entry.kind)
  ) {
    issues.push(
      issue(
        "SOURCE_ENTRY_INVALID",
        entryPath,
        "Source entry needs a path and file or symlink kind.",
      ),
    );
    return { actual: null, issues };
  }

  const lexicalPath = path.resolve(rootReal, entry.path);
  if (!isConfined(rootReal, lexicalPath)) {
    issues.push(
      issue(
        "SOURCE_PATH_ESCAPE",
        `${entryPath}.path`,
        "Source entry escapes the repository.",
        { reference: entry.path },
      ),
    );
    return { actual: null, issues };
  }
  const normalized = normalizedRelative(rootReal, lexicalPath);
  if (entry.path !== normalized) {
    issues.push(
      issue(
        "SOURCE_PATH_NOT_NORMALIZED",
        `${entryPath}.path`,
        "Source entry path is not normalized.",
        { expected: normalized, actual: entry.path },
      ),
    );
  }

  let state;
  try {
    state = lstatSync(lexicalPath);
  } catch (error) {
    issues.push(
      issue("SOURCE_FILE_MISSING", `${entryPath}.path`, error.message, {
        reference: entry.path,
      }),
    );
    return { actual: null, issues };
  }

  const actualKind = state.isSymbolicLink()
    ? "symlink"
    : state.isFile()
      ? "file"
      : "other";
  if (actualKind !== entry.kind) {
    issues.push(
      issue(
        "SOURCE_KIND_MISMATCH",
        `${entryPath}.kind`,
        "Source entry kind does not match the filesystem.",
        { expected: entry.kind, actual: actualKind },
      ),
    );
    return { actual: null, issues };
  }

  let bytes;
  if (entry.kind === "symlink") {
    try {
      const targetPath = realpathSync(lexicalPath);
      if (!isConfined(rootReal, targetPath)) {
        issues.push(
          issue(
            "SOURCE_SYMLINK_ESCAPE",
            `${entryPath}.path`,
            "Source symlink resolves outside the repository.",
            { reference: entry.path, resolvedPath: targetPath },
          ),
        );
      }
      bytes = Buffer.from(readlinkSync(lexicalPath), "utf8");
    } catch (error) {
      issues.push(
        issue("SOURCE_SYMLINK_INVALID", `${entryPath}.path`, error.message),
      );
      return { actual: null, issues };
    }
  } else {
    bytes = readFileSync(lexicalPath);
  }

  return {
    actual: {
      path: normalized,
      kind: entry.kind,
      size_bytes: bytes.length,
      sha256: sha256(bytes),
    },
    issues,
  };
}

export function verifySourceInventory(
  root,
  inventory,
  issuePath = "$.source_inventory",
) {
  const issues = [];
  if (!inventory || typeof inventory !== "object") {
    return [
      issue(
        "SOURCE_INVENTORY_INVALID",
        issuePath,
        "Source inventory must be an object.",
      ),
    ];
  }
  if (!Array.isArray(inventory.files)) {
    return [
      issue(
        "SOURCE_FILES_INVALID",
        `${issuePath}.files`,
        "Source inventory files must be an array.",
      ),
    ];
  }

  let rootReal;
  try {
    rootReal = realpathSync(root);
  } catch (error) {
    return [
      issue("REPOSITORY_ROOT_INVALID", issuePath, error.message, { root }),
    ];
  }

  const seen = new Set();
  const actualEntries = [];
  inventory.files.forEach((entry, index) => {
    const entryPath = `${issuePath}.files[${index}]`;
    if (seen.has(entry?.path)) {
      issues.push(
        issue(
          "SOURCE_PATH_DUPLICATE",
          `${entryPath}.path`,
          "Source path is duplicated.",
          { reference: entry?.path },
        ),
      );
    }
    seen.add(entry?.path);

    const resolved = resolveInventoryEntry(rootReal, entry, entryPath);
    issues.push(...resolved.issues);
    if (!resolved.actual) return;
    actualEntries.push(resolved.actual);

    for (const field of ["size_bytes", "sha256"]) {
      if (entry[field] !== resolved.actual[field]) {
        issues.push(
          issue(
            `SOURCE_${field === "sha256" ? "HASH" : "SIZE"}_MISMATCH`,
            `${entryPath}.${field}`,
            `Source ${field} does not match current bytes.`,
            { expected: entry[field], actual: resolved.actual[field] },
          ),
        );
      }
    }
  });

  const totalBytes = actualEntries.reduce(
    (total, entry) => total + entry.size_bytes,
    0,
  );
  const fingerprint = computeSourceInventoryFingerprint(actualEntries);
  const comparisons = [
    ["included_file_count", actualEntries.length, "SOURCE_FILE_COUNT_MISMATCH"],
    ["included_total_bytes", totalBytes, "SOURCE_TOTAL_BYTES_MISMATCH"],
    ["fingerprint_sha256", fingerprint, "SOURCE_FINGERPRINT_MISMATCH"],
  ];
  for (const [field, actual, code] of comparisons) {
    if (inventory[field] !== actual) {
      issues.push(
        issue(
          code,
          `${issuePath}.${field}`,
          `Source inventory ${field} does not match current entries.`,
          { expected: inventory[field], actual },
        ),
      );
    }
  }
  return issues;
}

function commandCounts(commands) {
  const counts = new Map();
  for (const command of commands) {
    counts.set(command, (counts.get(command) ?? 0) + 1);
  }
  return counts;
}

export function verifyManifestIntegrity({ root, manifest, task, gate }) {
  const issues = [];
  if (!manifest || typeof manifest !== "object") {
    return [
      issue("MANIFEST_INVALID", "$", "Evidence manifest must be an object."),
    ];
  }

  if (manifest.backlog_item_id !== task?.id) {
    issues.push(
      issue(
        "MANIFEST_TASK_MISMATCH",
        "$.backlog_item_id",
        "Manifest is not bound to the requested task.",
        { expected: task?.id, actual: manifest.backlog_item_id },
      ),
    );
  }
  if (manifest.gate_id !== gate?.id || task?.target_gate !== gate?.id) {
    issues.push(
      issue(
        "MANIFEST_GATE_MISMATCH",
        "$.gate_id",
        "Manifest, task, and gate are not bound to the same gate.",
        {
          expected: task?.target_gate,
          actual: manifest.gate_id,
          suppliedGate: gate?.id,
        },
      ),
    );
  }

  const taskContractHash = computeTaskContractHash(task);
  if (manifest.task_contract_sha256 !== taskContractHash) {
    issues.push(
      issue(
        "TASK_CONTRACT_HASH_MISMATCH",
        "$.task_contract_sha256",
        "Manifest task contract is missing or stale.",
        { expected: taskContractHash, actual: manifest.task_contract_sha256 },
      ),
    );
  }
  const gateContractHash = computeGateContractHash(gate);
  if (manifest.gate_contract_sha256 !== gateContractHash) {
    issues.push(
      issue(
        "GATE_CONTRACT_HASH_MISMATCH",
        "$.gate_contract_sha256",
        "Manifest gate contract is missing or stale.",
        { expected: gateContractHash, actual: manifest.gate_contract_sha256 },
      ),
    );
  }

  if (manifest.source_state?.stable_during_run !== true) {
    issues.push(
      issue(
        "SOURCE_RUN_UNSTABLE",
        "$.source_state.stable_during_run",
        "Source state was not stable during verification.",
      ),
    );
  }
  if (
    manifest.source_state?.fingerprint_sha256 !==
    manifest.source_state?.post_run_fingerprint_sha256
  ) {
    issues.push(
      issue(
        "SOURCE_PRE_POST_MISMATCH",
        "$.source_state.post_run_fingerprint_sha256",
        "Pre-run and post-run source fingerprints differ.",
        {
          expected: manifest.source_state?.fingerprint_sha256,
          actual: manifest.source_state?.post_run_fingerprint_sha256,
        },
      ),
    );
  }

  const commands = Array.isArray(manifest.commands) ? manifest.commands : [];
  if (!Array.isArray(manifest.commands)) {
    issues.push(
      issue(
        "MANIFEST_COMMANDS_INVALID",
        "$.commands",
        "Manifest commands must be an array.",
      ),
    );
  }
  const requiredCommands = task?.verification_commands ?? [];
  const requiredCounts = commandCounts(requiredCommands);
  const actualCounts = commandCounts(commands.map((entry) => entry?.command));
  for (const [command, requiredCount] of requiredCounts) {
    const actualCount = actualCounts.get(command) ?? 0;
    if (actualCount < requiredCount) {
      issues.push(
        issue(
          "COMMAND_MISSING",
          "$.commands",
          "Required verification command is missing.",
          { command, expectedCount: requiredCount, actualCount },
        ),
      );
    }
  }
  for (const [command, actualCount] of actualCounts) {
    const requiredCount = requiredCounts.get(command) ?? 0;
    if (actualCount > requiredCount) {
      issues.push(
        issue(
          requiredCount === 0 ? "COMMAND_UNEXPECTED" : "COMMAND_DUPLICATE",
          "$.commands",
          "Manifest command multiset does not match the task contract.",
          { command, expectedCount: requiredCount, actualCount },
        ),
      );
    }
  }

  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  issues.push(...verifyArtifacts(root, manifest.artifacts));
  commands.forEach((command, index) => {
    if (command?.exit_code !== 0) {
      issues.push(
        issue(
          "COMMAND_FAILED",
          `$.commands[${index}].exit_code`,
          "Verification command did not exit successfully.",
          { command: command?.command, actual: command?.exit_code },
        ),
      );
    }
    const matchingArtifacts = artifacts.filter(
      (artifact) => artifact?.reference === command?.output_reference,
    );
    if (matchingArtifacts.length !== 1) {
      issues.push(
        issue(
          "COMMAND_OUTPUT_ARTIFACT_INVALID",
          `$.commands[${index}].output_reference`,
          "Command output must reference exactly one hashed artifact.",
          {
            reference: command?.output_reference,
            matchingArtifacts: matchingArtifacts.length,
          },
        ),
      );
    }
  });

  const inventoryReference = manifest.source_state?.inventory_reference;
  const inventoryFile = resolveRepoRegularFile(
    root,
    inventoryReference,
    "$.source_state.inventory_reference",
  );
  issues.push(...inventoryFile.issues);
  if (inventoryFile.absolutePath) {
    const inventoryBytes = readFileSync(inventoryFile.absolutePath);
    const inventoryHash = sha256(inventoryBytes);
    if (inventoryHash !== manifest.source_state?.inventory_sha256) {
      issues.push(
        issue(
          "SOURCE_INVENTORY_HASH_MISMATCH",
          "$.source_state.inventory_sha256",
          "Source inventory bytes do not match the manifest hash.",
          {
            expected: manifest.source_state?.inventory_sha256,
            actual: inventoryHash,
          },
        ),
      );
    }
    try {
      const inventory = JSON.parse(inventoryBytes.toString("utf8"));
      issues.push(...verifySourceInventory(root, inventory));
      if (
        inventory.fingerprint_sha256 !==
        manifest.source_state?.fingerprint_sha256
      ) {
        issues.push(
          issue(
            "MANIFEST_SOURCE_FINGERPRINT_MISMATCH",
            "$.source_state.fingerprint_sha256",
            "Manifest fingerprint does not match its source inventory.",
            {
              expected: inventory.fingerprint_sha256,
              actual: manifest.source_state?.fingerprint_sha256,
            },
          ),
        );
      }
    } catch (error) {
      issues.push(
        issue(
          "SOURCE_INVENTORY_JSON_INVALID",
          "$.source_state.inventory_reference",
          error.message,
        ),
      );
    }
  }

  return issues;
}
