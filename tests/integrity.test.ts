import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
const integrityModulePath = "../scripts/lib/integrity.mjs";
const {
  canonicalJson,
  computeGateContractHash,
  computeSourceInventoryFingerprint,
  computeTaskContractHash,
  hashFileBytes,
  loadManifestFromFile,
  resolveRepoRegularFile,
  sha256,
  verifyManifestIntegrity,
  verifySourceInventory,
} = await import(integrityModulePath);

const temporaryRoots: string[] = [];

function createRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "crowntrail-integrity-"));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, reference: string, contents: string) {
  const absolutePath = path.join(root, ...reference.split("/"));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents, "utf8");
  return absolutePath;
}

const task = {
  id: "Q-008-HARNESS-EVIDENCE-INTEGRITY",
  target_gate: "G1",
  scope: ["Integrity primitives"],
  dependencies: [],
  acceptance_checks: ["Evidence cannot be forged."],
  verification_commands: ["npm test", "npm run build"],
  human_checks: [],
  status: "active",
  evidence_ids: [],
};

const gate = {
  id: "G1",
  name: "Reproducible baseline",
  status: "UNKNOWN",
  evidence_ids: [],
  requirements: [
    {
      id: "G1-R1",
      description: "Evidence is current.",
      automatable: true,
      evidence_required: ["manifest"],
      status: "UNKNOWN",
      evidence_ids: [],
    },
  ],
};

function createInventory(root: string, references: string[]) {
  const files = references.map((reference) => {
    const absolutePath = path.join(root, ...reference.split("/"));
    const bytes = readFileSync(absolutePath);
    return {
      path: reference,
      kind: "file",
      size_bytes: bytes.length,
      sha256: sha256(bytes),
    };
  });
  return {
    version: 1,
    root: ".",
    algorithm: "sha256",
    included_file_count: files.length,
    included_total_bytes: files.reduce(
      (total, entry) => total + entry.size_bytes,
      0,
    ),
    fingerprint_sha256: computeSourceInventoryFingerprint(files),
    files,
  };
}

function createManifestFixture(root: string) {
  write(root, "src/source.ts", "export const answer = 42;\n");
  write(root, "evidence/test.log", "tests passed\n");
  write(root, "evidence/build.log", "build passed\n");

  const inventory = createInventory(root, ["src/source.ts"]);
  const inventoryReference = "evidence/source-inventory.json";
  const inventoryText = `${JSON.stringify(inventory, null, 2)}\n`;
  write(root, inventoryReference, inventoryText);

  return {
    version: 1,
    backlog_item_id: task.id,
    gate_id: gate.id,
    task_contract_sha256: computeTaskContractHash(task),
    gate_contract_sha256: computeGateContractHash(gate),
    source_state: {
      stable_during_run: true,
      fingerprint_sha256: inventory.fingerprint_sha256,
      post_run_fingerprint_sha256: inventory.fingerprint_sha256,
      inventory_reference: inventoryReference,
      inventory_sha256: sha256(inventoryText),
    },
    commands: [
      {
        command: "npm test",
        exit_code: 0,
        output_reference: "evidence/test.log",
      },
      {
        command: "npm run build",
        exit_code: 0,
        output_reference: "evidence/build.log",
      },
    ],
    artifacts: [
      {
        kind: "log",
        reference: "evidence/test.log",
        sha256: hashFileBytes(path.join(root, "evidence/test.log")),
      },
      {
        kind: "log",
        reference: "evidence/build.log",
        sha256: hashFileBytes(path.join(root, "evidence/build.log")),
      },
      {
        kind: "report",
        reference: inventoryReference,
        sha256: sha256(inventoryText),
      },
    ],
  };
}

function codes(issues: Array<{ code: string }>) {
  return issues.map((entry) => entry.code);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("canonical contracts", () => {
  it("canonicalizes object structure independently of insertion order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe(
      canonicalJson({ a: { x: 3, y: 2 }, z: 1 }),
    );
  });

  it("uses the source inventory producer's ordinal path order", () => {
    const files = [
      { path: "a.ts", kind: "file", size_bytes: 1, sha256: "a".repeat(64) },
      { path: "B.ts", kind: "file", size_bytes: 1, sha256: "b".repeat(64) },
    ];
    const canonicalInput = [...files]
      .sort((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
      )
      .map(
        (entry) =>
          `${entry.path}\0${entry.kind}\0${entry.size_bytes}\0${entry.sha256}\n`,
      )
      .join("");

    expect(computeSourceInventoryFingerprint(files)).toBe(
      sha256(canonicalInput),
    );
  });

  it("ignores lifecycle metadata but invalidates acceptance changes", () => {
    const baseline = computeTaskContractHash(task);
    expect(
      computeTaskContractHash({
        ...task,
        status: "done",
        evidence_ids: ["manifest.json"],
        completed_at: "2026-07-28T00:00:00.000Z",
      }),
    ).toBe(baseline);
    expect(
      computeTaskContractHash({
        ...task,
        acceptance_checks: ["A materially different acceptance check."],
      }),
    ).not.toBe(baseline);
  });

  it("ignores gate evidence state but preserves requirement contracts", () => {
    const baseline = computeGateContractHash(gate);
    expect(
      computeGateContractHash({
        ...gate,
        status: "PASS",
        evidence_ids: ["manifest.json"],
        requirements: gate.requirements.map((requirement) => ({
          ...requirement,
          status: "PASS",
          evidence_ids: ["manifest.json"],
        })),
      }),
    ).toBe(baseline);
  });
});

describe("confined evidence files", () => {
  it("rejects an arbitrary repository path as a manifest", () => {
    const root = createRoot();
    write(root, "README.md", "{}");

    expect(codes(loadManifestFromFile(root, "README.md").issues)).toContain(
      "MANIFEST_PATH_INVALID",
    );
  });

  it("rejects traversal and symlink escapes", () => {
    const root = createRoot();
    const outside = write(createRoot(), "outside.txt", "outside");
    mkdirSync(path.join(root, "evidence"), { recursive: true });

    expect(
      codes(resolveRepoRegularFile(root, "../outside.txt").issues),
    ).toContain("FILE_PATH_ESCAPE");

    let symlinkCreated = true;
    try {
      symlinkSync(outside, path.join(root, "evidence", "escape.txt"));
    } catch {
      symlinkCreated = false;
    }
    if (symlinkCreated) {
      expect(
        codes(
          resolveRepoRegularFile(root, "evidence/escape.txt", "$.artifact")
            .issues,
        ),
      ).toContain("FILE_REALPATH_ESCAPE");
    }
  });
});

describe("manifest relational integrity", () => {
  it("accepts a current, completely bound manifest", () => {
    const root = createRoot();
    const manifest = createManifestFixture(root);

    expect(verifyManifestIntegrity({ root, manifest, task, gate })).toEqual([]);
  });

  it("rejects task and gate mismatches", () => {
    const root = createRoot();
    const manifest = {
      ...createManifestFixture(root),
      backlog_item_id: "Q-999-OTHER",
      gate_id: "G2",
    };

    expect(
      codes(verifyManifestIntegrity({ root, manifest, task, gate })),
    ).toEqual(
      expect.arrayContaining([
        "MANIFEST_TASK_MISMATCH",
        "MANIFEST_GATE_MISMATCH",
      ]),
    );
  });

  it("rejects missing, duplicate, and failed commands", () => {
    const root = createRoot();
    const baseline = createManifestFixture(root);
    const manifest = {
      ...baseline,
      commands: [
        baseline.commands[0],
        baseline.commands[0],
        { ...baseline.commands[1], exit_code: 1 },
      ],
    };

    expect(
      codes(verifyManifestIntegrity({ root, manifest, task, gate })),
    ).toEqual(expect.arrayContaining(["COMMAND_DUPLICATE", "COMMAND_FAILED"]));

    const missing = {
      ...baseline,
      commands: [baseline.commands[0]],
    };
    expect(
      codes(verifyManifestIntegrity({ root, manifest: missing, task, gate })),
    ).toContain("COMMAND_MISSING");
  });

  it("rejects edited artifact bytes", () => {
    const root = createRoot();
    const manifest = createManifestFixture(root);
    write(root, "evidence/test.log", "edited\n");

    expect(
      codes(verifyManifestIntegrity({ root, manifest, task, gate })),
    ).toContain("ARTIFACT_HASH_MISMATCH");
  });

  it("rejects edited inventory bytes", () => {
    const root = createRoot();
    const manifest = createManifestFixture(root);
    const inventoryPath = path.join(root, "evidence/source-inventory.json");
    writeFileSync(
      inventoryPath,
      readFileSync(inventoryPath, "utf8").replace(
        '"version": 1',
        '"version": 2',
      ),
      "utf8",
    );

    expect(
      codes(verifyManifestIntegrity({ root, manifest, task, gate })),
    ).toEqual(
      expect.arrayContaining([
        "ARTIFACT_HASH_MISMATCH",
        "SOURCE_INVENTORY_HASH_MISMATCH",
      ]),
    );
  });

  it("rejects source changed after inventory capture", () => {
    const root = createRoot();
    const manifest = createManifestFixture(root);
    write(root, "src/source.ts", "export const answer = 7;\n");

    expect(
      codes(verifyManifestIntegrity({ root, manifest, task, gate })),
    ).toEqual(
      expect.arrayContaining([
        "SOURCE_HASH_MISMATCH",
        "SOURCE_FINGERPRINT_MISMATCH",
      ]),
    );
  });
});

describe("source inventory integrity", () => {
  it("checks symlink entries rather than silently skipping them", () => {
    const root = createRoot();
    write(root, "src/target.ts", "target\n");
    const symlinkPath = path.join(root, "src/link.ts");
    let symlinkCreated = true;
    try {
      symlinkSync("target.ts", symlinkPath);
    } catch {
      symlinkCreated = false;
    }
    if (!symlinkCreated) return;

    const target = readFileSync(symlinkPath);
    const linkText = "target.ts";
    const files = [
      {
        path: "src/link.ts",
        kind: "symlink",
        size_bytes: Buffer.byteLength(linkText),
        sha256: sha256(linkText),
      },
    ];
    const inventory = {
      files,
      included_file_count: 1,
      included_total_bytes: Buffer.byteLength(linkText),
      fingerprint_sha256: computeSourceInventoryFingerprint(files),
    };

    expect(target.toString()).toBe("target\n");
    expect(verifySourceInventory(root, inventory)).toEqual([]);
  });
});
