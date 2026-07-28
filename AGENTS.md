# Crowntrail Kingdom Goal Harness

This file adds project-specific rules to the global Codex harness. Before changing the game,
read this file plus `.goal/goal.json`, `gates.json`, `rubric.json`, `backlog.json`, and
`PLAYBOOK.md`. Read `.goal/assets.json`, research, schemas, or evidence only when the active
item needs them. Do not load generated inventories or every historical evidence run by
default.

## Sources of truth

- `.goal/goal.json` defines the commercial objective and measurement contract.
- `.goal/gates.json` defines what must be proven.
- `.goal/rubric.json` defines the quality bar.
- `.goal/backlog.json` is the only autonomous work queue. Lower numeric priority runs first.
- `.goal/PLAYBOOK.md` defines the deterministic execution loop.
- `NOTE.md` is the developer's private note space. Do not open or use it. Relevant work must
  be represented in `.goal/backlog.json`.

If these files disagree, stop and ask the user. Never silently reinterpret the purchase
conversion metric, price policy, audience, platform, or evidence rules.

## Truth rules

- The commercial goal starts and remains `UNPROVEN` until G6 has valid external evidence.
- A requirement or gate may be `PASS`, `FAIL`, or `UNKNOWN`.
- No evidence means `UNKNOWN`, never `PASS`.
- A build, automated test, screenshot, self-review, or simulated buyer does not prove fun,
  premium value, legal clearance, Steam purchase conversion, or retained purchases.
- Do not claim that a USD 20+ price or 50%+ conversion is achieved from code quality alone.
- Do not invent evidence, test output, player feedback, purchase data, reviewer identity, or
  completion state.
- Steam and Windows are the researched measurement candidate, not a user-approved target.
  Store, operating system, and audience remain `NEEDS_USER_DECISION`.
- Those missing decisions block audience/store-dependent G5 and G6 work. They do not block
  platform-independent G1-G4 work already represented in the backlog.

## Deterministic work loop

Always execute this sequence:

1. Run `npm run goal:validate` and `npm run goal:status`.
2. Run `npm run goal:next`. Only a `ready` item with completed dependencies is eligible.
3. Run `npm run goal -- start --task <id>`. Never have two active items.
4. Implement only that item's declared scope.
5. Run its `verification_commands` together at feature/file scope.
6. Perform a requirement-by-requirement self-review.
7. Request an independent adversarial review from a separate agent or human.
8. Use `submit`, `review`, `complete`, or `block` commands documented in `.goal/PLAYBOOK.md`
   to record commands, outputs, artifacts, findings, and evidence identifiers.
9. Update gate and backlog state only to the level actually proven.
10. Repeat from `status`.

If no independent reviewer is available, leave the item in `review` and the affected
requirements `UNKNOWN`. An implementer cannot approve their own work.

## Backlog selection

- Only `ready` items are candidates for a new implementation. `active`, `review`, `done`, and
  `blocked` items are ineligible.
- An item with unfinished dependencies is ineligible.
- `done` items are ineligible unless new evidence invalidates them.
- Choose lower numeric `priority` first.
- Critical legal/IP, data-loss, crash, or unplayable defects may preempt ordinary priority
  when their concrete evidence is recorded.
- Do not choose the easiest edit merely because it is easy to test.
- A work item is `done` only when every acceptance check has evidence, every verification
  command required for its scope passed, required human checks are recorded, and independent
  review has no blocking finding.

## Verification discipline

- Prefer parallel read-only discovery when calls are independent.
- Batch code changes and verify at feature/file scope instead of testing every small function.
- Usually inspect `git diff` once after the complete file-level change.
- Existing local commands are:
  - `npm run goal:validate`
  - `npm run goal:status`
  - `npm run goal:next`
  - `npm run verify:fast`
  - `npm run verify:browser`
  - `npm run verify:release`
  - `npm run format:check`
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run test:e2e`
- Installing packages or Playwright browsers requires user approval because it uses network
  access and changes the environment.
- A retained result from an older commit or dirty worktree does not prove the current state.
- Release evidence must identify the commit SHA, dirty state, environment, exact command,
  exit code, and artifact hashes.

## Self-review and adversarial review

Self-review must map every acceptance check to an evidence identifier and explicitly list
unverified behavior. Independent review receives the goal, acceptance checks, diff, and
evidence and attempts to falsify the claim. It must report `PASS`, `FAIL`, or `UNKNOWN`,
counterexamples, missing evidence, and blocking findings.

Subjective quality, visual and audio cohesion, control feel, accessibility in real use,
willingness to pay, and audience fit require human/player evidence. Commercial IP and asset
license sufficiency require qualified human review before release.

## Ask-first triggers

Ask the user immediately when any of these are true:

1. Target file, folder, repo, branch, account, service, package manager, or execution
   environment is unclear.
2. Work depends on a user preference or external decision, including audience definition,
   Steam account/setup, store presentation, survey cohort, or attribution method.
3. A command fails due to permission, sandbox, access denied, EPERM, EACCES,
   UnauthorizedAccessException, missing admin rights, missing network access, denied write
   access, or authentication failure.
4. The next step would write outside the workspace, delete files, change permissions, install
   packages or browsers, kill processes, edit PATH, edit global config, use network access,
   publish, or access an external account.
5. The same command or strategy fails twice.
6. A broad recursive search would be needed because the target is unknown.

Before acting, confirm the target, desired output, editable files, allowed commands, and
definition of done. If two or more are unknown and cannot be discovered with one cheap
read-only check, ask before using more tools.

## Failure budget

- For a blocker, run at most one cheap diagnostic command.
- If the cause remains unclear, ask the user.
- Do not try more than two alternative strategies for the same blocker.
- Do not run broad scans, speculative fixes, ACL or ownership changes, process cleanup, lock
  deletion, or global configuration changes without explicit approval.

When permission is denied, report the exact failed command and exact error text, identify the
missing permission/path/account/environment boundary, and ask whether to grant permission,
change the target, run as administrator, or continue read-only. Never bypass the boundary.

## Completion

The overall goal is complete only when every required gate is PASS and G6 proves the
pre-registered conversion rule on the user-approved store. The current Steam UTM contract is
a candidate protocol until the user chooses Steam. G5 intent or willingness-to-pay data is a
leading indicator and cannot substitute for G6. Day-14 refund and retained-purchase results
are a separate audit and must be reported separately from the 72-hour conversion result.
