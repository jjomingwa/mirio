import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
const reviewIntegrityModulePath = "../scripts/lib/review-integrity.mjs";
const {
  acceptanceCheckHash,
  signedReviewPayload,
  signedReviewPayloadHash,
  stableCanonicalize,
  taskContractHash,
  verifyExternalReview,
} = await import(reviewIntegrityModulePath);
const schemaValidatorModulePath = "../scripts/lib/schema-validator.mjs";
const { validateSchemaDocument } = await import(schemaValidatorModulePath);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

type ReviewStatus = "PASS" | "FAIL" | "UNKNOWN";

interface AcceptanceResult {
  acceptance_check: string;
  acceptance_check_sha256: string;
  status: ReviewStatus;
  evidence_ids: string[];
  notes: string;
}

interface ReviewRecord {
  version: number;
  review_id: string;
  receipt_id: string;
  created_at_utc: string;
  backlog_item_id: string;
  target_gate: string;
  task_contract_sha256: string;
  source_fingerprint_sha256: string;
  evidence_bundle_sha256: string;
  reviewer: {
    reviewer_id: string;
    role: string;
    provider: string;
    session_id: string;
    independent_of_implementer: boolean;
  };
  verdict: ReviewStatus;
  acceptance_results: AcceptanceResult[];
  counterexamples: string[];
  missing_evidence: string[];
  blocking_findings: string[];
  non_blocking_findings: string[];
  provenance: {
    algorithm: string;
    key_id: string;
    signed_payload_sha256: string;
    signature: string;
  };
}

interface VerificationResult {
  ok: boolean;
  verdict: ReviewStatus;
  issues: Array<{ code: string; path: string; message: string }>;
  payloadHash: string;
}

const acceptanceChecks = ["Check alpha exactly.", "Check beta exactly."];
const task = {
  id: "Q-008-HARNESS-EVIDENCE-INTEGRITY",
  targetGate: "G1",
  acceptanceChecks,
  taskContractSha256: "",
};
task.taskContractSha256 = taskContractHash(task);

const sourceFingerprint = "a".repeat(64);
const evidenceBundleSha256 = "b".repeat(64);
const implementerSessionId = "implementer-session";

function makeHarness() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = "test-reviewer-key";
  const trustedKeys = new Map([[keyId, publicKey]]);

  function unsignedRecord(
    statuses: ReviewStatus[] = ["PASS", "PASS"],
  ): ReviewRecord {
    return {
      version: 2,
      review_id: "review-1",
      receipt_id: "receipt-1",
      created_at_utc: "2026-07-29T00:00:00.000Z",
      backlog_item_id: task.id,
      target_gate: task.targetGate,
      task_contract_sha256: task.taskContractSha256,
      source_fingerprint_sha256: sourceFingerprint,
      evidence_bundle_sha256: evidenceBundleSha256,
      reviewer: {
        reviewer_id: "reviewer-1",
        role: "independent_agent",
        provider: "test-provider",
        session_id: "reviewer-session",
        independent_of_implementer: true,
      },
      verdict: "UNKNOWN",
      acceptance_results: acceptanceChecks.map((acceptanceCheck, index) => ({
        acceptance_check: acceptanceCheck,
        acceptance_check_sha256: acceptanceCheckHash(acceptanceCheck),
        status: statuses[index],
        evidence_ids: [`evidence-${index + 1}`],
        notes: "",
      })),
      counterexamples: [],
      missing_evidence: [],
      blocking_findings: [],
      non_blocking_findings: [],
      provenance: {
        algorithm: "Ed25519",
        key_id: keyId,
        signed_payload_sha256: "",
        signature: "",
      },
    };
  }

  function signRecord(record: ReviewRecord = unsignedRecord()) {
    record.provenance.signed_payload_sha256 = signedReviewPayloadHash(record);
    record.provenance.signature = sign(
      null,
      Buffer.from(stableCanonicalize(signedReviewPayload(record)), "utf8"),
      privateKey,
    ).toString("base64");
    return record;
  }

  function verify(
    record: ReviewRecord,
    overrides: Record<string, unknown> = {},
  ): VerificationResult {
    return verifyExternalReview({
      record,
      task,
      implementerSessionId,
      expectedSourceFingerprint: sourceFingerprint,
      expectedEvidenceBundleSha256: evidenceBundleSha256,
      trustedKeys,
      ...overrides,
    });
  }

  return { keyId, trustedKeys, unsignedRecord, signRecord, verify };
}

function issueCodes(result: VerificationResult) {
  return result.issues.map((entry) => entry.code);
}

describe("external review integrity", () => {
  it("accepts a valid signed PASS and derives rather than trusts its verdict", () => {
    const harness = makeHarness();
    const record = harness.unsignedRecord();
    record.verdict = "FAIL";

    const result = harness.verify(harness.signRecord(record));

    expect(result).toMatchObject({ ok: true, verdict: "PASS" });
    expect(result.issues).toEqual([]);
  });

  it("produces a schema-valid external review record", () => {
    const harness = makeHarness();
    const record = harness.signRecord();
    const schema = JSON.parse(
      readFileSync(
        path.join(
          repositoryRoot,
          ".goal",
          "schemas",
          "external-review.schema.json",
        ),
        "utf8",
      ),
    );

    expect(
      validateSchemaDocument({
        schema,
        value: record,
        document: "external review fixture",
      }),
    ).toEqual([]);
  });

  it("rejects an untrusted key", () => {
    const harness = makeHarness();
    const record = harness.signRecord();

    const result = harness.verify(record, { trustedKeys: new Map() });

    expect(issueCodes(result)).toContain("UNTRUSTED_KEY");
  });

  it("rejects a bad signature", () => {
    const harness = makeHarness();
    const record = harness.signRecord();
    record.provenance.signature =
      Buffer.from("not a signature").toString("base64");

    expect(issueCodes(harness.verify(record))).toContain("SIGNATURE_INVALID");
  });

  it("rejects a payload edit after signing", () => {
    const harness = makeHarness();
    const record = harness.signRecord();
    record.acceptance_results[0].notes = "edited";

    const codes = issueCodes(harness.verify(record));
    expect(codes).toContain("SIGNED_PAYLOAD_HASH_MISMATCH");
    expect(codes).toContain("SIGNATURE_INVALID");
  });

  it("rejects the implementer session as reviewer", () => {
    const harness = makeHarness();
    const record = harness.unsignedRecord();
    record.reviewer.session_id = implementerSessionId;

    expect(issueCodes(harness.verify(harness.signRecord(record)))).toContain(
      "REVIEWER_SESSION_NOT_INDEPENDENT",
    );
  });

  it("rejects replayed review and receipt IDs without mutating replay sets", () => {
    const harness = makeHarness();
    const record = harness.signRecord();
    const seenReviewIds = new Set([record.review_id]);
    const seenReceiptIds = new Set([record.receipt_id]);

    const result = harness.verify(record, { seenReviewIds, seenReceiptIds });

    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["REVIEW_REPLAY", "RECEIPT_REPLAY"]),
    );
    expect(seenReviewIds).toEqual(new Set([record.review_id]));
    expect(seenReceiptIds).toEqual(new Set([record.receipt_id]));
  });

  it.each([
    ["backlog_item_id", "Q-999-WRONG", "TASK_MISMATCH"],
    ["target_gate", "G2", "GATE_MISMATCH"],
    ["task_contract_sha256", "c".repeat(64), "TASK_CONTRACT_MISMATCH"],
    [
      "source_fingerprint_sha256",
      "c".repeat(64),
      "SOURCE_FINGERPRINT_MISMATCH",
    ],
    ["evidence_bundle_sha256", "c".repeat(64), "EVIDENCE_BUNDLE_MISMATCH"],
  ])("rejects a mismatched %s", (field, value, expectedCode) => {
    const harness = makeHarness();
    const record = harness.unsignedRecord();
    (record as unknown as Record<string, string>)[field] = value;

    expect(issueCodes(harness.verify(harness.signRecord(record)))).toContain(
      expectedCode,
    );
  });

  it("rejects missing acceptance checks", () => {
    const harness = makeHarness();
    const record = harness.unsignedRecord();
    record.acceptance_results.pop();

    expect(issueCodes(harness.verify(harness.signRecord(record)))).toContain(
      "ACCEPTANCE_MISSING",
    );
  });

  it("rejects reordered acceptance checks", () => {
    const harness = makeHarness();
    const record = harness.unsignedRecord();
    record.acceptance_results.reverse();

    expect(issueCodes(harness.verify(harness.signRecord(record)))).toContain(
      "ACCEPTANCE_REORDERED",
    );
  });

  it("rejects duplicate acceptance checks", () => {
    const harness = makeHarness();
    const record = harness.unsignedRecord();
    record.acceptance_results[1] = { ...record.acceptance_results[0] };

    expect(issueCodes(harness.verify(harness.signRecord(record)))).toContain(
      "ACCEPTANCE_DUPLICATE",
    );
  });

  it("rejects extra acceptance checks", () => {
    const harness = makeHarness();
    const record = harness.unsignedRecord();
    record.acceptance_results.push({
      ...record.acceptance_results[0],
      acceptance_check: "Extra check.",
      acceptance_check_sha256: acceptanceCheckHash("Extra check."),
    });

    expect(issueCodes(harness.verify(harness.signRecord(record)))).toContain(
      "ACCEPTANCE_EXTRA",
    );
  });

  it("rejects PASS without evidence", () => {
    const harness = makeHarness();
    const record = harness.unsignedRecord();
    record.acceptance_results[0].evidence_ids = [];

    expect(issueCodes(harness.verify(harness.signRecord(record)))).toContain(
      "PASS_EVIDENCE_MISSING",
    );
  });

  it("rejects a derived PASS with a blocking finding", () => {
    const harness = makeHarness();
    const record = harness.unsignedRecord();
    record.blocking_findings = ["A blocker exists."];

    expect(issueCodes(harness.verify(harness.signRecord(record)))).toContain(
      "BLOCKING_FINDINGS_PRESENT",
    );
  });

  it.each([
    [["PASS", "FAIL"], "FAIL"],
    [["PASS", "UNKNOWN"], "UNKNOWN"],
  ])("derives %s review results as %s", (statuses, expectedVerdict) => {
    const harness = makeHarness();
    const record = harness.unsignedRecord(statuses as ReviewStatus[]);

    expect(harness.verify(harness.signRecord(record))).toMatchObject({
      ok: true,
      verdict: expectedVerdict,
    });
  });
});
