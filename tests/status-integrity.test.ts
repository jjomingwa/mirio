import { describe, expect, it } from "vitest";

const statusIntegrityModulePath = "../scripts/lib/status-integrity.mjs";
const { deriveGateStatus, deriveGoalStatus } = await import(
  statusIntegrityModulePath
);

function gateFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "G1",
    status: "PASS",
    evidence_ids: ["manifest.json"],
    requirements: [
      {
        id: "G1-R1",
        status: "PASS",
        evidence_ids: ["manifest.json"],
      },
    ],
    ...overrides,
  };
}

describe("derived goal status", () => {
  it("downgrades stored PASS when evidence is absent or unverified", () => {
    expect(deriveGateStatus(gateFixture(), new Set())).toBe("UNKNOWN");
    expect(
      deriveGateStatus(
        gateFixture({ evidence_ids: [] }),
        new Set(["manifest.json"]),
      ),
    ).toBe("UNKNOWN");
  });

  it("downgrades a gate when a child requirement is not PASS", () => {
    const gate = gateFixture({
      requirements: [
        {
          id: "G1-R1",
          status: "UNKNOWN",
          evidence_ids: ["manifest.json"],
        },
      ],
    });

    expect(deriveGateStatus(gate, new Set(["manifest.json"]))).toBe("UNKNOWN");
  });

  it("derives PASS only from verified gate and child evidence", () => {
    const verified = new Set(["manifest.json"]);

    expect(deriveGateStatus(gateFixture(), verified)).toBe("PASS");
    expect(
      deriveGoalStatus({
        gates: [gateFixture()],
        decisionHoles: [],
        verifiedEvidenceIds: verified,
      }),
    ).toBe("PASS");
  });

  it("keeps the commercial goal UNPROVEN while decisions are unresolved", () => {
    expect(
      deriveGoalStatus({
        gates: [gateFixture()],
        decisionHoles: ["target.store"],
        verifiedEvidenceIds: new Set(["manifest.json"]),
      }),
    ).toBe("UNPROVEN");
  });
});
