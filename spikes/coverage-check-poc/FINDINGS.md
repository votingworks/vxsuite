# Phase 0 PoC Findings — coverage-check

Date: 2026-08-05. Everything below is reproducible from this directory; nothing
is committed. Language: Rust (decided at session start, ahead of the PoC — see
spec "Performance & implementation strategy").

## What was built

- **Golden corpus** (`corpus/`): 16 fixtures covering every surveyed pattern, a
  vitest driver that executes exactly the paths each fixture header documents,
  and expected verdicts as JSON data. Entity positions come from a real coverage
  run through the production pipeline (vitest 4 + vite 8/oxc +
  `@vitest/coverage-istanbul`), not hand-written locations — the corpus locks
  behavior against the actual remapped data shapes. `pnpm coverage` in `corpus/`
  regenerates; the report is committed alongside so the golden run is hermetic.
- **Rust checker** (`checker/`, oxc 0.139): directive grammar, attachment
  semantics per spec section 2, coverage-report classification, staleness,
  never-param auto-exclusion (name registry + per-file import/local binding
  resolution), orphan/misuse detection. Three modes: `corpus` (golden compare),
  `dump` (audit/annotation aid), `check <pkg-dir>` (real packages).
- **Pilots**: libs/basics end-to-end (hints converted to directives, coverage
  rerun, checker green); libs/ui (hints stripped, true report, checker over the
  hairy patterns).

## Corpus results

All 16 fixtures PASS. Two deliberate mutations (innermost-instead-of-outermost
binding; inverted terminating-then attribution) were caught by 8 and 2 fixtures
respectively, then reverted.

Locked semantics, each against real istanbul entity data:

- Own-line directives binding statements, declarations (function/class/method/
  class-field, `export` included in the bound range), and `case X:` clauses.
- Expression-position directives: ternary arms, `??`/`&&` arms (inline and
  own-line), call arguments (fluent-chain step stays tight — neighbors still
  FAIL), default-parameter initializers, object property values, template spans,
  JSX expression containers, styled-components-style template interpolations
  (both inline ternary-arm and own-line whole-arrow).
- `-file` form (imported and never-imported files), `-else` form,
  terminating-then attribution for `return`/`throw`/`continue`.
- Never-param auto-exclusion: aliased import excused (call statement + enclosing
  switch arm); local same-named function with non-`never` param NOT excused;
  generic functions NOT excused; hits on excused sites reported as
  informational.
- Orphans (end of block, end of file), `-else` misuse on an if with explicit
  else, unknown labels (`coverage-skip`) correctly treated as non-directives.
- Stale detection with no false positives (a directive whose range contains
  covered entities is not stale while it still binds an uncovered one).

## Report data-shape discoveries (now locked in the corpus)

Verified against the production pipeline; several would have been correctness
bugs if discovered later:

1. **If-branch arm locations are the if statement's own loc** — the then-arm
   entity sits at the `if` keyword position, not the consequent block. A
   directive binding the whole if covers it naturally.
2. **Implicit-else arms are `{"start": {}, "end": {}}`** (empty objects), as the
   spec predicted. The attribution rule handles them.
3. **Remapped arrow-function `decl` positions are unreliable** (an arrow's
   decl.start can point into the preceding method name, e.g. `.map`). Function
   entities therefore match by body `loc.start`, which is always inside any
   range that should cover the function. This replaces the spec's implicit
   assumption that entity decl starts are exact.
4. **Variable-declaration statement entities point at the initializer**, not the
   statement start (`const x = <HERE>`). Range containment absorbs this.
5. **`default-arg` branches have a single location** (the initializer
   expression); inline directives before the initializer bind it exactly.
6. **End columns are null** everywhere in remapped reports; matching uses start
   positions only, as specced.
7. **Entity-less files are dropped from the report entirely** (barrel re-export
   files produce no statements/functions/branches), even with
   `coverage.all: true`. Consequence below.

## Checker design findings

- **Tightest-containing-directive wins for staleness attribution.** With
  first-match, a redundant outer directive could never go stale. With
  tightest-wins, converting the repo's paired hints (e.g.
  `async_iterator_plus.ts:550/552`) immediately reports the redundant member of
  the pair as stale, and deleting it is provably safe.
- **The checker must scan directive-bearing source files that are absent from
  the report**, or file-level directives on entity-less files are silently
  invisible. Implemented: such directives are DIRECTIVE ERRORs with guidance
  ("use coverage.exclude config instead") — which is exactly the spec section 1
  criterion, now mechanically enforced.
- **The partial-run hazard is real and was demonstrated organically**: the first
  basics run used a report left over from the survey session's single-file
  probes, and the checker duly reported 1,249 phantom failures. The spec's
  `&&`-gating plus report-plausibility guard is load-bearing; the PoC checker
  does not yet implement the plausibility heuristic (Phase 1).

## Pilot: libs/basics

Sequence: convert all 8 istanbul hints in place to the new grammar (reasons
preserved, bare when reasonless, barrels → `-file` directives), full coverage
run, checker.

- Before conversion (hints live, fresh full report): checker output is exactly
  **one FAIL** — `async_iterator_plus.ts:553:13`, the `??`-arm whose own-line
  hint is attachment-dead in istanbul and which `branches: 99` exists to absorb.
  One actionable line instead of a threshold delta.
- After conversion + rerun: **0 uncovered-without-directive; 1 stale directive**
  (the redundant member of the 550/552 pair — correct); **2 DIRECTIVE ERRORs**
  steering the barrel `-file` directives to `coverage.exclude` config (correct);
  register: 7 excluded. Checker runtime: **3–4ms**.
- Iteration property worth noting: once hints are gone, adding/moving OUR
  directives requires no coverage rerun — directives are invisible to
  instrumentation, so directive placement iterates at checker speed (ms), not
  test-suite speed.

## Pilot: libs/ui

(hints stripped: 116 hint comments neutralized in 77 files, line numbers
preserved)

- The true config debt surfaced immediately:
  `thresholds: { lines: -30, branches: -104 }` plus a 19-entry
  `coverage.exclude` list including the known-rotted `printer_alert.tsx`
  ("Covered in VxAdmin") claim.
- A previously-invisible **multi-line block hint** was found
  (`keyboard_shortcut_handlers.tsx:20` — hint text on the second line of the
  comment, which babel's `^\s*istanbul\s+ignore` match does not honor): likely
  one more attachment-dead hint absorbed by thresholds today.
- Stripping hints exposed a build coupling: `coverage.all` loads never-imported
  files (previously skipped via their `ignore file` hints), and those files'
  workspace imports must be built (`pnpm --filter @votingworks/ui... build`) — a
  migration-ordering note for packages with file hints on never-imported files.

Results with the true (post-strip) report:

- Coverage dropped from the threshold-tolerated picture to **91.1% statements /
  89.2% branches**: 374 uncovered lines vs the 30 the threshold tolerates, 235
  uncovered branches vs 104. The hints were hiding roughly **344 lines and 131
  branches of debt** from the report — the spec's undercount prediction,
  quantified on one package.
- Checker over the true report: **724 uncovered-without-directive entities,
  113ms.** Every spot-checked FAIL is a real, precisely-located piece of debt
  (virtual-keyboard PAT navigation, defensive guards, styled arms).
- Spot-conversion of three hairy sites — `seal.tsx:19` own-line directive inside
  a styled interpolation, `segmented_button.tsx:89` inline directive on a `&&`
  arm inside an interpolation, and the keyboard-handler guard (its original
  multi-line block hint replaced by own-line `//` directives with the reason
  preserved) — flipped exactly their 4 entities to excluded (724 → 720 FAILs)
  **without rerunning coverage**: directive placement iterates at checker speed
  on an existing report.
- Grammar note confirmed by the same trap that killed the original hint: a
  directive whose text does not start at the beginning of the comment (line 2 of
  a block comment) is NOT a directive — same as babel's istanbul matcher. Our
  lint rule makes this visible (comment-token format check) where istanbul fails
  silent; the corpus's `coverage-skip` fixture already locks the checker side of
  this behavior.
- **Never-param at cross-package scale** (`--never-scan libs/basics`, i.e. the
  registry sees `throwIllegalValue`'s declaration): 724 → **661**
  uncovered-without-directive, **59 entities auto-excused** with zero
  annotations. Review of this output caught a PoC gap the corpus initially
  missed: the repo convention is `default: { throwIllegalValue(x); }`
  (block-wrapped), and the arm-exclusion check didn't unwrap the block, excusing
  the call statement but failing the arm. Fixed (blocks unwrap, trailing `break`
  still tolerated) and locked as a new golden case (`handleBlock` in
  `never_param.ts`).

## Performance

| package                                      | report       | checker wall time |
| -------------------------------------------- | ------------ | ----------------- |
| libs/basics (full report)                    | 725 stmts    | 3–4ms             |
| libs/types (largest collected, hints intact) | 675KB report | 37ms              |
| libs/image-utils                             | —            | 1ms               |
| libs/pdi-scanner                             | —            | 2ms               |

Budget was <1s warm / <2s cold; measured two orders of magnitude inside it.

## Bonus findings about today's system

- libs/types (hints intact) shows 28 threshold-tolerated uncovered entities; the
  sample includes several `default: { /* istanbul ignore next */ ... }` switch
  arms whose **arm entity is in the map uncovered despite the hint** (the hint
  binds inside the block, missing the arm) — more attachment-dead hints, most of
  them `throwIllegalValue`-shaped, i.e. they vanish entirely under never-param
  auto-exclusion.

## Open questions / defaults chosen (for review)

1. **Tightest-wins staleness** (above) — adopted; alternative was first-match,
   which hides redundant directives. Review if surprising.
2. **Function entities match by body loc.start** — required by finding #3. Means
   a directive must cover the function _body_ start; a directive binding the
   declaration always does.
3. **Never-param registry is name-keyed** (from scanned declarations) with
   per-file binding resolution (imports incl. aliases, local decls). Full
   module-graph resolution (re-export chains, `--never-scan` dirs for
   cross-package imports) is Phase 1; the safe direction holds — unresolved
   means enforced.
4. **`check` mode iterates report keys ∪ directive-bearing source files**; the
   plausibility partial-run guard and `coverage.exclude` dead-glob audit are not
   yet implemented (Phase 1 hardening).
5. **Corpus expected-entity identity is istanbul map order** (`s3`, `b0.1`).
   Stable for fixed fixtures; if fixtures churn a lot in Phase 1, consider
   content-anchored IDs.
6. Pilot working-copy changes to libs/basics and libs/ui are left in place for
   inspection; `git checkout -- libs/basics libs/ui` restores.

## Recommendation

Proceed to Phase 1 with the design as specced. Attachment — the design's
declared main correctness risk — held up against every surveyed pattern and real
remapped data with two small, well-understood amendments (fn matching by body
start; tightest-wins staleness). The pilots strengthen the motivation: every
package examined is carrying attachment-dead hints that thresholds absorb
invisibly, and the checker's failure output is precise enough to act on without
any base-branch comparison.

## Addendum (2026-08-05, post-checkpoint review with Jonah)

Settled during findings review; corpus, checker, pilots, and spec all updated
and re-verified green:

- **Vocabulary**: these comments are _directives_ (matching ESLint's "disable
  directives" and TS comment directives), not flags. All user-facing output and
  docs renamed; the project codename stays `coverage-flags`.
- **Syntax**: directives carry an `@` prefix — `// @coverage-exclude: <reason>`
  — matching `@ts-expect-error`-style directive marking and making prose
  collisions impossible. Both `//` and `/* */` work; code following a directive
  on the same line requires `/* */` (line comments swallow the rest of the
  line). New golden case: a prose comment starting with `coverage-exclude` (no
  `@`) does not parse as a directive.
- **Output format**: oxlint/miette-style graphical diagnostics (severity +
  doc-linked `coverage(<name>)`, snippet box with underline diagnosis, `help:`
  resolution). Diagnostic names: `uncovered-{statement,branch, function}`,
  `orphaned-directive`, `misplaced-else-directive`, `useless-file-directive`,
  `stale-directive`, `exhaustiveness-defeated`. Implementable directly with the
  `miette` crate.
- **Never-param block-arm fix** (found while reviewing example output):
  `default: { throwIllegalValue(x); }` block-wrapped arms are now excused like
  their unwrapped form; new `handleBlock` golden case. ui with a cross-package
  registry (`--never-scan libs/basics`): 661 uncovered-without-directive, 59
  never-param auto-excused.
