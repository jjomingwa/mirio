import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error The verification harness is intentionally implemented in JavaScript.
import {
  buildEvidenceManifest,
  loadVerificationContext,
  parseVerificationArguments,
} from "../scripts/verify.mjs";
// @ts-expect-error The audited harness module is intentionally implemented in JavaScript.
import {
  computeGateContractHash,
  computeTaskContractHash,
} from "../scripts/lib/integrity.mjs";

const temporaryRoots: string[] = [];

function createHarnessFixture(items: object[]) {
  const root = mkdtempSync(path.join(tmpdir(), "crowntrail-verify-"));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, ".goal"), { recursive: true });
  writeFileSync(
    path.join(root, ".goal", "backlog.json"),
    JSON.stringify({ items }),
    "utf8",
  );
  writeFileSync(
    path.join(root, ".goal", "gates.json"),
    JSON.stringify({
      gates: [
        {
          id: "G1",
          name: "Baseline",
          status: "UNKNOWN",
          evidence_ids: [],
          requirements: [],
        },
        {
          id: "G3",
          name: "Runtime proof",
          status: "UNKNOWN",
          evidence_ids: [],
          requirements: [],
        },
      ],
    }),
    "utf8",
  );
  return root;
}

function taskFixture(
  id: string,
  targetGate: string,
  status: string,
  commands = ["npm test"],
) {
  return {
    id,
    target_gate: targetGate,
    status,
    scope: ["test"],
    dependencies: [],
    acceptance_checks: ["bound"],
    verification_commands: commands,
    human_checks: [],
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("verification context", () => {
  it("parses an explicit task after the verification profile", () => {
    expect(
      parseVerificationArguments([
        "fast",
        "--task",
        "Q-004-ENEMY-POP-LIFETIME",
      ]),
    ).toEqual({
      profile: "fast",
      taskId: "Q-004-ENEMY-POP-LIFETIME",
    });
  });

  it("selects the unique active or review task", () => {
    const active = taskFixture("Q-008-INTEGRITY", "G1", "active");
    const root = createHarnessFixture([
      taskFixture("Q-004-ENEMY-POP-LIFETIME", "G3", "blocked"),
      active,
    ]);

    expect(loadVerificationContext(root)).toMatchObject({
      task: { id: active.id },
      gate: { id: "G1" },
    });
  });

  it("allows an explicit task and derives its gate rather than the profile gate", () => {
    const q004 = taskFixture("Q-004-ENEMY-POP-LIFETIME", "G3", "blocked", [
      "npm test",
      "npm run test:e2e",
      "npm run build",
    ]);
    const root = createHarnessFixture([
      q004,
      taskFixture("Q-008-INTEGRITY", "G1", "active"),
    ]);

    expect(loadVerificationContext(root, q004.id)).toMatchObject({
      task: { id: q004.id, target_gate: "G3" },
      gate: { id: "G3" },
    });
  });

  it("fails closed when no unique task identifies the run", () => {
    const noCandidateRoot = createHarnessFixture([
      taskFixture("Q-004-ENEMY-POP-LIFETIME", "G3", "blocked"),
    ]);
    expect(() => loadVerificationContext(noCandidateRoot)).toThrow(
      /provide --task/i,
    );

    const ambiguousRoot = createHarnessFixture([
      taskFixture("Q-008-INTEGRITY", "G1", "active"),
      taskFixture("Q-009-LIFECYCLE", "G1", "review"),
    ]);
    expect(() => loadVerificationContext(ambiguousRoot)).toThrow(
      /provide --task/i,
    );
  });
});

describe("bound verification manifest", () => {
  it("records task, target gate, contract hashes, source inventory, and exact outputs", () => {
    const task = taskFixture("Q-004-ENEMY-POP-LIFETIME", "G3", "blocked", [
      "npm test",
    ]);
    const gate = {
      id: "G3",
      name: "Runtime proof",
      status: "UNKNOWN",
      evidence_ids: [],
      requirements: [],
    };
    const fingerprint = "a".repeat(64);
    const outputHash = "b".repeat(64);
    const inventoryHash = "c".repeat(64);
    const sourceState = {
      fingerprint_sha256: fingerprint,
      included_file_count: 3,
      included_total_bytes: 128,
    };
    const manifest = buildEvidenceManifest({
      profile: "fast",
      runId: "fixture-fast",
      startedAt: new Date("2026-07-28T00:00:00.000Z"),
      commitSha: "d".repeat(40),
      dirtyWorktree: false,
      sourceStateBefore: sourceState,
      sourceStateAfter: sourceState,
      sourceInventory: {
        selection_command:
          "git ls-files --cached --others --exclude-standard -z",
      },
      sourceInventoryReference: "evidence/source-inventory.json",
      sourceInventorySha256: inventoryHash,
      results: [
        {
          name: "unit",
          command: "npm test",
          status: "PASS",
          exit_code: 0,
          duration_ms: 10,
          output_sha256: outputHash,
          log: "evidence/unit.log",
          error: null,
        },
      ],
      task,
      gate,
    });

    expect(manifest).toMatchObject({
      profile: "fast",
      task_id: task.id,
      target_gate: "G3",
      backlog_item_id: task.id,
      gate_id: "G3",
      task_contract_sha256: computeTaskContractHash(task),
      gate_contract_sha256: computeGateContractHash(gate),
      source_state: {
        fingerprint_sha256: fingerprint,
        included_file_count: 3,
        included_total_bytes: 128,
        inventory_sha256: inventoryHash,
      },
      commands: [
        {
          command: "npm test",
          exit_code: 0,
          output_reference: "evidence/unit.log",
        },
      ],
      artifacts: [
        {
          reference: "evidence/unit.log",
          sha256: outputHash,
        },
        {
          reference: "evidence/source-inventory.json",
          sha256: inventoryHash,
        },
      ],
    });
  });
});
