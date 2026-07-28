import { Buffer } from "node:buffer";
import { createHash, verify as verifySignature } from "node:crypto";

function issue(code, path, message) {
  return { code, path, message };
}

export function stableCanonicalize(value) {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical JSON requires finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableCanonicalize(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableCanonicalize(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function acceptanceCheckHash(acceptanceCheck) {
  return sha256Hex(Buffer.from(acceptanceCheck, "utf8"));
}

export function taskContractHash(task) {
  return sha256Hex(
    stableCanonicalize({
      acceptance_checks: task.acceptanceChecks,
      backlog_item_id: task.id,
      target_gate: task.targetGate,
    }),
  );
}

export function deriveReviewVerdict(acceptanceResults) {
  const statuses = acceptanceResults.map((result) => result.status);
  if (statuses.includes("FAIL")) return "FAIL";
  if (
    statuses.includes("UNKNOWN") ||
    statuses.some((status) => status !== "PASS")
  ) {
    return "UNKNOWN";
  }
  return statuses.length > 0 ? "PASS" : "UNKNOWN";
}

export function signedReviewPayload(record) {
  const provenance = record?.provenance ?? {};
  const signedProvenance = { ...provenance };
  delete signedProvenance.signature;
  delete signedProvenance.signed_payload_sha256;
  return {
    ...record,
    provenance: signedProvenance,
  };
}

export function signedReviewPayloadHash(record) {
  return sha256Hex(stableCanonicalize(signedReviewPayload(record)));
}

function getTrustedKey(trustedKeys, keyId) {
  if (trustedKeys instanceof Map) return trustedKeys.get(keyId);
  return trustedKeys?.[keyId];
}

function checkAcceptanceResults(record, task, issues) {
  const expected = task.acceptanceChecks;
  const actual = Array.isArray(record.acceptance_results)
    ? record.acceptance_results
    : [];
  const actualTexts = actual.map((result) => result?.acceptance_check);

  if (!Array.isArray(record.acceptance_results)) {
    issues.push(
      issue(
        "ACCEPTANCE_RESULTS_MISSING",
        "$.acceptance_results",
        "acceptance_results must be an array.",
      ),
    );
  }
  if (actual.length < expected.length) {
    issues.push(
      issue(
        "ACCEPTANCE_MISSING",
        "$.acceptance_results",
        `Expected ${expected.length} acceptance results, received ${actual.length}.`,
      ),
    );
  }
  if (actual.length > expected.length) {
    issues.push(
      issue(
        "ACCEPTANCE_EXTRA",
        "$.acceptance_results",
        `Expected ${expected.length} acceptance results, received ${actual.length}.`,
      ),
    );
  }
  if (new Set(actualTexts).size !== actualTexts.length) {
    issues.push(
      issue(
        "ACCEPTANCE_DUPLICATE",
        "$.acceptance_results",
        "Acceptance results contain duplicate acceptance_check values.",
      ),
    );
  }
  if (
    actual.length === expected.length &&
    new Set(actualTexts).size === actualTexts.length &&
    actualTexts.every((text) => expected.includes(text)) &&
    actualTexts.some((text, index) => text !== expected[index])
  ) {
    issues.push(
      issue(
        "ACCEPTANCE_REORDERED",
        "$.acceptance_results",
        "Acceptance results do not follow the task acceptance-check order.",
      ),
    );
  }

  for (let index = 0; index < expected.length; index += 1) {
    const result = actual[index];
    const path = `$.acceptance_results[${index}]`;
    if (!result) continue;
    if (result.acceptance_check !== expected[index]) {
      issues.push(
        issue(
          "ACCEPTANCE_TEXT_MISMATCH",
          `${path}.acceptance_check`,
          "Acceptance text does not exactly match the task contract.",
        ),
      );
    }
    if (
      result.acceptance_check_sha256 !== acceptanceCheckHash(expected[index])
    ) {
      issues.push(
        issue(
          "ACCEPTANCE_HASH_MISMATCH",
          `${path}.acceptance_check_sha256`,
          "Acceptance-check hash does not match the task contract.",
        ),
      );
    }
    if (!["PASS", "FAIL", "UNKNOWN"].includes(result.status)) {
      issues.push(
        issue(
          "ACCEPTANCE_STATUS_INVALID",
          `${path}.status`,
          "Acceptance status must be PASS, FAIL, or UNKNOWN.",
        ),
      );
    }
    if (
      result.status === "PASS" &&
      (!Array.isArray(result.evidence_ids) || result.evidence_ids.length === 0)
    ) {
      issues.push(
        issue(
          "PASS_EVIDENCE_MISSING",
          `${path}.evidence_ids`,
          "Every PASS acceptance result requires evidence.",
        ),
      );
    }
  }
  return actual;
}

export function verifyExternalReview({
  record,
  task,
  implementerSessionId,
  expectedSourceFingerprint,
  expectedEvidenceBundleSha256,
  trustedKeys,
  seenReviewIds = new Set(),
  seenReceiptIds = new Set(),
}) {
  const issues = [];
  const acceptanceResults = checkAcceptanceResults(record, task, issues);
  const verdict = deriveReviewVerdict(acceptanceResults);

  const expectedValues = [
    [
      "TASK_MISMATCH",
      "$.backlog_item_id",
      record?.backlog_item_id,
      task.id,
      "Review backlog item does not match.",
    ],
    [
      "GATE_MISMATCH",
      "$.target_gate",
      record?.target_gate,
      task.targetGate,
      "Review target gate does not match.",
    ],
    [
      "TASK_CONTRACT_MISMATCH",
      "$.task_contract_sha256",
      record?.task_contract_sha256,
      task.taskContractSha256,
      "Review task-contract hash does not match.",
    ],
    [
      "SOURCE_FINGERPRINT_MISMATCH",
      "$.source_fingerprint_sha256",
      record?.source_fingerprint_sha256,
      expectedSourceFingerprint,
      "Review source fingerprint does not match.",
    ],
    [
      "EVIDENCE_BUNDLE_MISMATCH",
      "$.evidence_bundle_sha256",
      record?.evidence_bundle_sha256,
      expectedEvidenceBundleSha256,
      "Review evidence-bundle hash does not match.",
    ],
  ];
  for (const [code, path, actual, expected, message] of expectedValues) {
    if (actual !== expected) issues.push(issue(code, path, message));
  }

  const reviewerSessionId = record?.reviewer?.session_id;
  if (!reviewerSessionId) {
    issues.push(
      issue(
        "REVIEWER_SESSION_MISSING",
        "$.reviewer.session_id",
        "External reviewer session provenance is required.",
      ),
    );
  } else if (reviewerSessionId === implementerSessionId) {
    issues.push(
      issue(
        "REVIEWER_SESSION_NOT_INDEPENDENT",
        "$.reviewer.session_id",
        "Reviewer and implementer sessions must be distinct.",
      ),
    );
  }
  if (record?.reviewer?.independent_of_implementer !== true) {
    issues.push(
      issue(
        "INDEPENDENCE_NOT_ATTESTED",
        "$.reviewer.independent_of_implementer",
        "External review must attest independence.",
      ),
    );
  }

  if (seenReviewIds.has(record?.review_id)) {
    issues.push(
      issue(
        "REVIEW_REPLAY",
        "$.review_id",
        "Review ID has already been ingested.",
      ),
    );
  }
  if (seenReceiptIds.has(record?.receipt_id)) {
    issues.push(
      issue(
        "RECEIPT_REPLAY",
        "$.receipt_id",
        "Receipt ID has already been ingested.",
      ),
    );
  }

  if (
    verdict === "PASS" &&
    Array.isArray(record?.missing_evidence) &&
    record.missing_evidence.length > 0
  ) {
    issues.push(
      issue(
        "MISSING_EVIDENCE_PRESENT",
        "$.missing_evidence",
        "A derived PASS cannot contain missing evidence.",
      ),
    );
  }
  if (
    verdict === "PASS" &&
    Array.isArray(record?.blocking_findings) &&
    record.blocking_findings.length > 0
  ) {
    issues.push(
      issue(
        "BLOCKING_FINDINGS_PRESENT",
        "$.blocking_findings",
        "A derived PASS cannot contain blocking findings.",
      ),
    );
  }

  const keyId = record?.provenance?.key_id;
  const trustedKey = getTrustedKey(trustedKeys, keyId);
  if (!trustedKey) {
    issues.push(
      issue(
        "UNTRUSTED_KEY",
        "$.provenance.key_id",
        "Review signing key is not trusted.",
      ),
    );
  }

  let payloadHash;
  try {
    payloadHash = signedReviewPayloadHash(record);
    if (record?.provenance?.signed_payload_sha256 !== payloadHash) {
      issues.push(
        issue(
          "SIGNED_PAYLOAD_HASH_MISMATCH",
          "$.provenance.signed_payload_sha256",
          "Signed payload hash does not match the canonical review payload.",
        ),
      );
    }
  } catch (error) {
    issues.push(
      issue(
        "CANONICAL_PAYLOAD_INVALID",
        "$",
        `Review cannot be canonicalized: ${error.message}`,
      ),
    );
  }

  if (trustedKey && payloadHash) {
    let signatureValid;
    try {
      signatureValid = verifySignature(
        null,
        Buffer.from(stableCanonicalize(signedReviewPayload(record)), "utf8"),
        trustedKey,
        Buffer.from(record?.provenance?.signature ?? "", "base64"),
      );
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) {
      issues.push(
        issue(
          "SIGNATURE_INVALID",
          "$.provenance.signature",
          "Review signature is invalid.",
        ),
      );
    }
  }

  return { ok: issues.length === 0, verdict, issues, payloadHash };
}
