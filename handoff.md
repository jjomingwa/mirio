# Crowntrail Kingdom handoff

## Mission

Continue developing this game toward a credible USD 20+ premium release. The
requested 50% qualified-purchase conversion is a measurement goal, not a
guarantee: keep `.goal/goal.json` at `UNPROVEN` until the preregistered G6
cohort and Wilson-bound rules are satisfied with external purchase evidence.

## Start here

1. Read `AGENTS.md`.
2. Run `npm run goal:status` and `npm run goal:validate`.
3. Read `.goal/PLAYBOOK.md`, `.goal/goal.json`, `.goal/gates.json`,
   `.goal/rubric.json`, and `.goal/backlog.json`.
4. Inspect `git status --short --branch` before editing.
5. Work on the single active backlog item; do not silently convert unknown,
   blocked, automated, or implementer-generated evidence into PASS.

Existing architecture and research are documented in:

- `docs/ARCHITECTURE.md`
- `docs/RESEARCH.md`
- `.goal/research/market-2026-07-28.md`
- `.goal/research/asset-license-review-2026-07-28.md`
- `THIRD_PARTY_ASSETS.md`

## Current state

- Q-002 is implemented: crown progress is normalized and capped at 162.
- Q-003 is implemented: fortress, castle, final-stage, secret-route, and ending
  routing are covered by data-level tests.
- Q-004 code is implemented: enemy defeat effects have a finite registry,
  one-shot defeat handling, shutdown cleanup, and aggregate-error-safe cleanup.
  Completion remains blocked on fresh G3 browser evidence and a human review of
  repeated-kill capture. The previous browser strategy failed twice; do not
  repeat it without the distinct SceneReady/scene-run-token remediation.
- Q-008 is active. Fail-closed schema, artifact/manifest integrity, and signed
  Ed25519 external-review primitives now exist under `scripts/lib/`, with
  focused regression tests. Integration into every goal lifecycle transition
  is not complete.
- Q-009 is queued to make lifecycle transitions and emitted commands
  deterministic for low-capability agents.
- Q-010 through Q-014 capture the five main premium-product gaps: signature
  mechanic, authored world grammar, world-specific boss identity, meaningful
  reward/replay, and a coherent audiovisual/narrative identity.

## Important integrity caveats

- Existing unsigned “independent” Q-002/Q-003 review records are historical
  artifacts, not externally trusted signatures under the new Q-008 standard.
- `scripts/goal.mjs` can still create an implementer-authored independent review
  and trusts stored review summaries during completion. Q-008 must close both
  paths before claiming non-forgeable completion.
- `scripts/verify.mjs` now writes task/gate contract and source-integrity
  metadata. Reconcile `.goal/schemas/evidence.schema.json` with the new manifest
  fields before relying on a real verification run.
- Independent signed PASS requires a trust anchor outside the implementer's
  mutable checkout. Do not generate and trust the implementer's own key.
- The asset-license review remains blocked. All third-party packages require
  qualified human review before commercial release.
- Store, operating system, primary audience, audience inclusion, and exclusion
  rules remain explicit user decision holes.

## Verification boundaries

Focused checks already reported passing:

- schema validator: 10 tests
- goal schema integration: 4 tests
- evidence/manifest integrity primitives: 12 tests
- verification integration: 5 tests
- signed review integrity: 19 tests
- finite effect registry: 7 tests

Before marking Q-008 complete, run the full declared contract and record exact
failures. Do not run the browser suite a third time until the Q-004 remediation
is implemented and explicitly authorized. Automated checks do not replace real
browser, device, human quality, license, Steam attribution, or purchase proof.

## Recommended next actions

1. Update the evidence schema for the new manifest contract.
2. Integrate signed external-review ingestion and verification into
   `scripts/goal.mjs`; disable local fabrication of independent identity.
3. Make `complete` and `status` revalidate current artifact hashes, task/gate
   contracts, source inventory, acceptance results, reviewer provenance, and
   human evidence.
4. Add migration/invalidation handling for legacy unsigned review records.
5. Complete Q-008 counterexample fixtures, then proceed to Q-009.
6. Address the five user decision holes before designing G6 acquisition or
   purchase-conversion measurement.

## Suggested skills

- `cavecrew`: delegate bounded investigation, implementation, and independent
  review while keeping file ownership disjoint.
- `diagnose`: use for the next browser failure or harness regression; stop after
  the configured failure budget.
- `tdd`: implement Q-008/Q-009 state transitions and counterexample rejection
  through red-green-refactor.
- `to-issues`: only if the user asks to publish the backlog to an issue tracker.
- `handoff`: refresh this document when another session is expected to resume.

## Definition of truthful completion

The project is not commercially proven. A later agent may only claim the
overall goal complete after G0-G6 are satisfied with current, attributable,
independently verifiable evidence and the external qualified-purchase cohort
meets the locked conversion contract.
