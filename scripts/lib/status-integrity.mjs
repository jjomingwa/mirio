function hasVerifiedEvidence(evidenceIds, verifiedEvidenceIds) {
  return (
    Array.isArray(evidenceIds) &&
    evidenceIds.length > 0 &&
    evidenceIds.every((evidenceId) => verifiedEvidenceIds.has(evidenceId))
  );
}

export function deriveRequirementStatus(requirement, verifiedEvidenceIds) {
  if (!hasVerifiedEvidence(requirement?.evidence_ids, verifiedEvidenceIds)) {
    return "UNKNOWN";
  }
  return ["PASS", "FAIL"].includes(requirement?.status)
    ? requirement.status
    : "UNKNOWN";
}

export function deriveGateStatus(gate, verifiedEvidenceIds) {
  const requirementStatuses = (gate?.requirements ?? []).map((requirement) =>
    deriveRequirementStatus(requirement, verifiedEvidenceIds),
  );
  if (requirementStatuses.includes("FAIL")) return "FAIL";
  if (
    requirementStatuses.length > 0 &&
    requirementStatuses.every((status) => status === "PASS") &&
    hasVerifiedEvidence(gate?.evidence_ids, verifiedEvidenceIds)
  ) {
    return "PASS";
  }
  return "UNKNOWN";
}

export function deriveGoalStatus({
  gates,
  decisionHoles,
  verifiedEvidenceIds,
}) {
  return decisionHoles.length === 0 &&
    gates.length > 0 &&
    gates.every(
      (gate) => deriveGateStatus(gate, verifiedEvidenceIds) === "PASS",
    )
    ? "PASS"
    : "UNPROVEN";
}
