# VxSuite Dev Workflow Profiling Results

Profiled on: 2026-02-24
Branch: main (commit cb1ff32d7)
Machine: Linux 6.1.0-40-arm64
Worktree: /home/jonahkagan/code/vxsuite/.claude/worktrees/profile-dev-workflow

## Files

- **This report**: `tmp/profile-results/full-results.md`
- **Profiling script**: `script/profile-dev-workflow.sh` (accepts step names as args)
- **Raw data (TSV)**:
  - `tmp/profile-results/tests-full.tsv` — test:run for all 43 packages
  - `tmp/profile-results/tests-coverage.tsv` — test:coverage for all 43 packages
  - `tmp/profile-results/lint.tsv` — pnpm lint for all 44 packages
  - `tmp/profile-results/dev-server.tsv` — dev server startup for all 8 frontends
  - `tmp/profile-results/results.tsv` — pre-commit/lint-staged (from profiling script)
- **Note**: type-check and tests-single raw data was not saved to TSV files (only
  captured in terminal output and summarized here). The profiling script clears
  `results.tsv` on each run; to save all steps, run all steps together or use
  separate `RESULTS_DIR` per step.

## 1. Single-File Test Runs (vitest run <file>)

| Package | Time |
|---------|------|
| apps/pollbook/frontend | 12.7s |
| apps/design/backend | 10.4s |
| apps/mark-scan/backend | 7.7s |
| apps/mark-scan/frontend | 5.0s |
| apps/mark/frontend | 4.5s |
| apps/design/frontend | 4.5s |
| apps/admin/frontend | 4.1s |
| apps/central-scan/frontend | 3.9s |
| apps/scan/frontend | 3.2s |
| apps/central-scan/backend | 2.3s |
| apps/scan/backend | 2.2s |
| apps/admin/backend | 2.2s |
| apps/mark/backend | 2.0s |
| libs/db | 1.9s |
| apps/print/backend | 1.8s |
| apps/pollbook/backend | 1.8s |
| libs/image-utils | 1.7s |
| libs/fs | 1.6s |
| libs/types | 1.6s |
| libs/hmpb | 1.6s |
| libs/ui | 1.5s |
| libs/mark-flow-ui | 1.4s |
| libs/auth | 1.4s |
| libs/grout | 1.4s |
| libs/usb-drive | 1.2s |
| libs/utils | 1.2s |
| libs/basics | 1.1s |
| libs/backend | 1.1s |
| libs/logging | 1.1s |
| libs/ballot-encoder | 1.1s |

**Outliers**: pollbook-frontend (12.7s), design-backend (10.4s), mark-scan-backend (7.7s)
**Typical frontend app**: 3-5s
**Typical backend app**: 1.8-2.3s
**Typical lib**: 1.1-1.6s

## 2. Full Test Suite (vitest run, all tests in package)

| Package | Time |
|---------|------|
| libs/hmpb | 103.4s |
| apps/design/backend | 69.8s |
| apps/design/frontend | 59.8s |
| apps/admin/backend | 46.9s |
| apps/scan/frontend | 36.7s |
| apps/pollbook/backend | 35.6s |
| apps/scan/backend | 34.5s |
| libs/ui | 34.4s |
| apps/mark-scan/frontend | 29.3s |
| apps/admin/frontend | 24.0s |
| apps/mark/frontend | 23.5s |
| apps/mark-scan/backend | 21.3s |
| apps/pollbook/frontend | 16.0s |
| libs/printing | 15.5s |
| apps/central-scan/backend | 14.7s |
| libs/backend | 14.7s |
| libs/fixture-generators | 13.3s |
| libs/eslint-plugin-vx | 12.8s |
| apps/central-scan/frontend | 11.9s |
| libs/auth | 11.3s |
| libs/bmd-ballot-fixtures | 9.8s |
| libs/mark-flow-ui | 9.3s |
| apps/mark/backend | 9.1s |
| apps/print/backend | 8.1s |
| libs/utils | 3.3s |
| libs/image-utils | 2.7s |
| libs/types | 2.7s |
| libs/monorepo-utils | 2.2s |
| libs/db | 1.9s |
| libs/fujitsu-thermal-printer | 1.8s |
| libs/message-coder | 1.8s |
| libs/fs | 1.8s |
| libs/test-utils | 1.8s |
| libs/basics | 1.7s |
| libs/usb-drive | 1.4s |
| libs/ballot-encoder | 1.4s |
| libs/cdf-schema-builder | 1.4s |
| libs/grout | 1.4s |
| libs/logging | 1.4s |
| libs/custom-paper-handler | 1.3s |
| libs/grout/test-utils | 1.2s |
| libs/fixtures | 1.2s |
| apps/print/frontend | 0.9s |

**Top 5 slowest**: hmpb (103s), design-backend (70s), design-frontend (60s), admin-backend (47s), scan-frontend (37s)
**Total across all 43 packages**: ~816s (~13.6 min)

## 3. Type-Check (tsgo --build)

### Cold (no .tsbuildinfo cache)
| Package | Time |
|---------|------|
| apps/admin/backend | 3.7s |
| libs/ui | 2.2s |
| apps/admin/frontend | 2.0s |
| apps/design/frontend | 2.0s |
| apps/central-scan/backend | 1.7s |
| apps/pollbook/frontend | 1.7s |
| apps/mark-scan/frontend | 1.6s |
| Most others | 0.7-1.5s |
| **Total (47 packages)** | **53.6s** |

### Warm (cached .tsbuildinfo)
| Package | Time |
|---------|------|
| apps/design/frontend | 1.7s |
| apps/admin/frontend | 1.5s |
| apps/scan/frontend | 1.4s |
| Most others | 0.6-1.3s |
| **Total (47 packages)** | **38.2s** |

## 4. Lint (`pnpm lint` per package)

The `lint` script runs type-check + eslint + stylelint sequentially.

| Package | Total | type-check | eslint | stylelint |
|---------|-------|-----------|--------|-----------|
| libs/ui | **36.8s** | 0.7s | **29.1s** | 3.9s |
| apps/design/frontend | **24.1s** | — | — | — |
| apps/admin/frontend | **22.1s** | 1.8s | **18.7s** | 2.1s |
| apps/mark-scan/frontend | 22.1s | — | — | — |
| apps/scan/frontend | 17.9s | — | — | — |
| apps/mark/frontend | 15.9s | — | — | — |
| apps/pollbook/frontend | 15.7s | — | — | — |
| libs/mark-flow-ui | 15.7s | — | — | — |
| apps/design/backend | 13.1s | — | — | — |
| apps/central-scan/frontend | 12.7s | — | — | — |
| apps/admin/backend | 11.7s | — | — | — |
| apps/scan/backend | 11.2s | — | — | — |
| libs/hmpb | 10.9s | — | — | — |
| apps/pollbook/backend | 11.0s | — | — | — |
| apps/mark-scan/backend | 10.6s | — | — | — |
| libs/backend | 9.9s | — | — | — |
| apps/print/frontend | 9.1s | — | — | — |
| libs/ballot-interpreter | 8.8s | — | — | — |
| libs/utils | 8.8s | — | — | — |
| apps/mark/backend | 8.5s | — | — | — |
| libs/auth | 8.2s | — | — | — |
| libs/printing | 8.0s | — | — | — |
| libs/types | 7.7s | — | — | — |
| apps/central-scan/backend | 9.4s | — | — | — |
| apps/print/backend | 7.1s | — | — | — |
| libs/bmd-ballot-fixtures | 6.5s | — | — | — |
| libs/fixture-generators | 6.3s | — | — | — |
| libs/basics | **5.3s** | 0.7s | **4.9s** | — |
| libs/message-coder | 5.3s | — | — | — |
| libs/test-utils | 5.2s | — | — | — |
| libs/usb-drive | 5.2s | — | — | — |
| libs/custom-paper-handler | 5.0s | — | — | — |
| libs/pdi-scanner | 5.0s | — | — | — |
| libs/logging | 4.9s | — | — | — |
| libs/ballot-encoder | 4.6s | — | — | — |
| libs/fujitsu-thermal-printer | 4.8s | — | — | — |
| libs/image-utils | 4.4s | — | — | — |
| libs/fixtures | 4.1s | — | — | — |
| libs/fs | 4.1s | — | — | — |
| libs/grout/test-utils | 4.0s | — | — | — |
| libs/cdf-schema-builder | 3.9s | — | — | — |
| libs/db | 3.8s | — | — | — |
| libs/grout | 3.8s | — | — | — |
| libs/monorepo-utils | 3.7s | — | — | — |
| libs/eslint-plugin-vx | 0.6s | — | — | — |

**Total across all 44 packages**: ~453s (~7.5 min)
**ESLint dominates**: 85-90% of lint time is eslint (type-check and stylelint are fast)

### ESLint `--cache` impact

| Package | eslint (no cache) | eslint --cache (warm) | Speedup |
|---------|-------------------|-----------------------|---------|
| libs/ui | 29.1s | **1.7s** | **17x** |
| apps/admin/frontend | 18.7s | **1.7s** | **11x** |

**Key finding**: `eslint --cache` reduces lint time from 5-37s to ~1.7s per package.
Currently no packages use `--cache`. This is the single biggest actionable improvement.

### Pre-commit hook

The pre-commit hook runs `pnpm --workspace-concurrency=1 --filter='[HEAD]' run
--if-present pre-commit`, which invokes lint-staged sequentially in each package
that has changed files since the last commit.

| Component | Time |
|-----------|------|
| lint-staged per empty package (startup overhead) | ~0.7s |
| lint-staged with 1 staged .ts file (prettier + eslint) | ~3.0s |
| pnpm filter resolution | ~0.5s |

**Scaling**: Total ≈ 3s (actual work) + 0.7s × (N-1) empty packages + 0.5s pnpm,
where N = number of packages in the `[HEAD]` filter. With 5 changed packages: ~6s.
With 10 changed packages: ~10s.

**Issues**:
1. `--workspace-concurrency=1` forces sequential execution
2. lint-staged is invoked in packages that have no staged files (wasted 0.7s each)

## 5. Dev Server Startup

| App | Cold | Warm |
|-----|------|------|
| apps/admin/frontend | 2.6s | 0.6s |
| apps/central-scan/frontend | 4.8s | 3.2s |
| apps/design/frontend | 3.7s | 3.7s |
| apps/mark/frontend | 2.6s | 2.0s |
| apps/mark-scan/frontend | 2.0s | 2.0s |
| apps/pollbook/frontend | 2.0s | 2.0s |
| apps/print/frontend | 2.0s | 3.5s |
| apps/scan/frontend | 3.6s | 4.2s |

Note: These measure time to first "VITE ready" or "localhost" message in logs.
Most are 2-5s — not a significant bottleneck.

## 6. Coverage: Istanbul vs V8

Tested on libs/basics:

| Mode | Time | vs no-coverage |
|------|------|----------------|
| No coverage (vitest run) | 1.3s | baseline |
| Istanbul coverage (vitest run --coverage) | 2.1s | 1.6x slower |
| V8 coverage (vitest run --coverage --coverage.provider=v8) | 0.4s | 3.3x faster |

## 7. CI (CircleCI) Analysis

Pipeline b809d78f (2026-02-23, main branch):
- **57 parallel jobs**, all xlarge (4 vCPU, 8GB)
- **Pipeline wall clock: 8 min 21 sec** (all jobs parallel)
- **Critical path: integration tests at ~6 min** (admin, central-scan, mark-scan)
- Config auto-generated from libs/monorepo-utils/src/circleci.ts
- Each job runs sequentially: checkout → pnpm install → Cargo install → build → lint → test

### CI vs Local Times
| CI Job | CI Time | Local test:run | CI Overhead |
|--------|---------|----------------|-------------|
| test-apps-admin-integration-testing | 6:13 | (E2E) | — |
| test-apps-central-scan-integration | 6:07 | (E2E) | — |
| test-apps-mark-scan-integration | 5:32 | (E2E) | — |
| test-libs-hmpb | 5:25 | 103.4s | 3.1x |
| test-apps-design-backend | 5:18 | 69.8s | 4.6x |
| test-apps-mark-scan-frontend | 5:17 | 29.3s | 10.8x |
| test-apps-scan-backend | 5:03 | 34.5s | 8.8x |
| test-apps-scan-frontend | 5:00 | 36.7s | 8.2x |
| test-apps-admin-backend | 4:36 | 46.9s | 5.9x |
| test-libs-ui | 4:22 | 34.4s | 7.6x |
| test-apps-design-frontend | 4:20 | 59.8s | 4.3x |
| test-apps-admin-frontend | 4:13 | 24.0s | 10.5x |
| test-libs-basics | 2:10 | 1.7s | **76x** |
| test-libs-types | 1:58 | 2.7s | **44x** |
| test-libs-fs | 1:55 | 1.8s | **64x** |
| test-libs-monorepo-utils | 1:48 | 2.2s | **49x** |

**Key insight**: Small libs spend >95% of CI time on overhead (install, build, lint),
not testing. For libs with <5s of tests, the CI job takes ~2 min regardless.

### CI Optimization Opportunities
| Priority | Issue | Impact |
|----------|-------|--------|
| HIGH | Skip Cargo install for non-Rust jobs | Save ~30s × ~50 jobs (compute cost) |
| MEDIUM | Consolidate small lib jobs | Many 2-min jobs could share overhead |
| MEDIUM | Path-based job filtering (like pollbook) | Skip unchanged packages entirely |
| LOW | Build artifact caching between jobs | Marginal (install is cached already) |

Note: Pipeline wall clock (8 min) is already good due to full parallelism.
The main cost is compute (57 xlarge jobs × 2-6 min each = ~3 hrs of compute per push).

## 8. Full Test Suite with Coverage (Istanbul)

Coverage overhead comparison (all 43 packages):

| Package | test:run | test:coverage | Overhead |
|---------|----------|---------------|----------|
| libs/ui | 34.4s | 45.3s | +31% |
| libs/types | 2.7s | 4.0s | +48% |
| apps/admin/frontend | 24.0s | 26.0s | +8% |
| apps/central-scan/frontend | 11.9s | 12.9s | +8% |
| libs/basics | 1.7s | 2.1s | +24% |
| Most other packages | — | — | 0-10% |

**Key finding**: Istanbul coverage overhead is modest (0-10%) for most packages.
A few smaller packages show 20-50% overhead but in absolute terms it's <2s extra.
The larger packages show almost no proportional overhead.

**Total across all 43 packages**:
- test:run: ~816s
- test:coverage: ~820s
- Coverage overhead: ~0.5% overall (noise-level)

## 9. Per-Rule ESLint Timing (TIMING=1)

Profiled individual ESLint rule costs using `TIMING=1`.

### libs/ui (36.8s total lint)
| Rule | Time (ms) | % |
|------|----------|---|
| `import/no-cycle` | 8,112 | 38.1% |
| `vx/no-floating-results` | 2,422 | 11.4% |
| `n/prefer-node-protocol` | 2,081 | 9.8% |
| `import/namespace` | 1,117 | 5.2% |
| `vx/gts-spread-like-types` | 671 | 3.2% |
| `@typescript-eslint/no-unnecessary-type-assertion` | 470 | 2.2% |
| `@typescript-eslint/no-floating-promises` | 339 | 1.6% |
| `import/no-extraneous-dependencies` | 319 | 1.5% |
| `import/no-relative-packages` | 310 | 1.5% |
| `@typescript-eslint/no-unused-vars` | 266 | 1.3% |

### apps/admin/frontend (22.1s total lint)
| Rule | Time (ms) | % |
|------|----------|---|
| `import/no-cycle` | 5,942 | 47.3% |
| `import/namespace` | 1,435 | 11.4% |
| `vx/no-floating-results` | 891 | 7.1% |
| `n/prefer-node-protocol` | 772 | 6.1% |
| `vx/no-assert-truthiness` | 449 | 3.6% |
| `@typescript-eslint/require-await` | 225 | 1.8% |
| `@typescript-eslint/no-floating-promises` | 177 | 1.4% |
| `vx/gts-spread-like-types` | 144 | 1.1% |
| `@typescript-eslint/no-unused-vars` | 117 | 0.9% |
| `import/no-relative-packages` | 112 | 0.9% |

### libs/basics (5.3s total lint)
| Rule | Time (ms) | % |
|------|----------|---|
| `vx/no-floating-results` | 809 | 45.0% |
| `import/export` | 131 | 7.3% |
| `n/prefer-node-protocol` | 114 | 6.4% |
| `import/namespace` | 106 | 5.9% |
| `import/no-cycle` | 72 | 4.0% |
| `@typescript-eslint/no-unused-vars` | 55 | 3.1% |
| `@typescript-eslint/no-floating-promises` | 50 | 2.8% |

### Key findings

- **`import/no-cycle` is the #1 bottleneck**: 38-47% of lint time in large
  packages. The typescript-eslint perf guide recommends running this "only at CI
  time."
- **`import/namespace` is #2**: 5-11% of lint time. TypeScript already handles
  this check — redundant.
- **`vx/no-floating-results`** appears as the costliest type-aware rule (7-45%
  depending on package), but this is largely because the first type-aware rule
  triggers TypeScript program creation. Subsequent type-aware rules reuse it.
- **`n/prefer-node-protocol`** is surprisingly slow (6-10%) for a syntactic rule.
- **Type-aware rules use the standard TS compiler** (not tsgo). The `lint` script
  runs `pnpm type-check` (tsgo, fast) then `eslint .` which creates its own
  TypeScript program via `@typescript-eslint/parser` (standard tsc, slow). This
  is redundant type compilation.

### Active import rules (from `--print-config`)

Rules enabled via `plugin:import/errors`, `plugin:import/warnings`, and
airbnb-base that TypeScript already handles:

| Rule | Level | Redundant? | Notes |
|------|-------|-----------|-------|
| `import/no-cycle` | error | No (useful) | But too slow for local dev |
| `import/namespace` | error | **Yes** | TS handles this |
| `import/default` | error | **Yes** | TS handles + VxSuite bans default exports |
| `import/export` | error | Partial | TS catches most of this |
| `import/no-named-as-default` | warn | **Yes** | TS handles this |
| `import/no-named-as-default-member` | warn | **Yes** | TS handles this |
| `import/named` | off | Already off | Good |
| `import/no-unresolved` | off | Already off | Good |

## Daily Impact Summary

| Step | Typical per-run | Freq/day | Assessment |
|------|----------------|----------|------------|
| **Lint (eslint)** | **5-37s per pkg** | **CI + local** | **#1 — fixable (see plan below)** |
| Full test suite (top 5 pkgs) | 37-103s | 5-7x | #2 — inherently slow, hard to fix |
| **Pre-commit hook** | **3-10s** | **7x** | **#3 — scales with changed pkgs, improvable** |
| Full test suite (mid pkgs) | 10-30s | 5-7x | Significant but acceptable |
| Single-file test (frontend apps) | 3-5s | 8x | Acceptable |
| Single-file test (outliers) | 8-13s | 2-3x | Worth investigating |
| Type-check (warm, per pkg) | 0.6-1.7s | 10x | Already fast (tsgo) |
| Dev server startup | 2-5s | 4x | Already fast |
| Coverage overhead (Istanbul) | ~0-10% | CI only | Minimal — not worth switching |
| CI pipeline | ~8 min wall clock | 4+x/day | Good parallelism, high compute cost |

## ESLint Improvement Plan

### Change 1: Disable slow/redundant import rules [HIGH IMPACT]

**File:** `libs/eslint-plugin-vx/src/configs/recommended.ts`

Add to rules:
```ts
// Disable import/no-cycle locally — 38-47% of lint time in large packages.
// Circular deps are caught by TS and CI (enable via ESLINT_IMPORT_NO_CYCLE=1).
'import/no-cycle': process.env.ESLINT_IMPORT_NO_CYCLE ? 'error' : 'off',

// These are redundant with TypeScript's module resolution:
'import/namespace': 'off',
'import/default': 'off',
'import/no-named-as-default-member': 'off',
```

**Impact:** Eliminates ~50-60% of lint time in large packages without caching.

**CI:** Set `ESLINT_IMPORT_NO_CYCLE=1` in CI lint scripts so circular deps are
still caught before merge.

### Change 2: Add `eslint --cache` and GC tuning [HIGH IMPACT]

**Files:** All ~44 `package.json` files across apps/ and libs/

Change lint scripts from:
```json
"lint": "pnpm type-check && eslint .",
"lint:fix": "pnpm type-check && eslint . --fix"
```
To:
```json
"lint": "pnpm type-check && NODE_OPTIONS=--max-semi-space-size=256 eslint --cache .",
"lint:fix": "pnpm type-check && NODE_OPTIONS=--max-semi-space-size=256 eslint --cache . --fix"
```

Also update `.lintstagedrc.shared.js`:
- `'eslint --quiet --fix'` → `'eslint --cache --quiet --fix'`

- `--cache`: skips re-linting unchanged files (3-17x on warm runs)
- `--max-semi-space-size=256`: reduces V8 GC pressure (10-20%), per
  typescript-eslint perf guide
- `.eslintcache` is already in `.gitignore`

**False-negative risk:** 5 of 10 type-aware rules have HIGH cross-file
false-negative risk with `--cache` (type change in file A can cause lint error
in file B, but cache skips B). CI runs without cache → catches before merge.

### Expected impact

| Package | Before | After change 1 | After both (warm cache) |
|---------|--------|----------------|------------------------|
| libs/ui | 36.8s | ~15s | ~2-3s |
| admin-frontend | 22.1s | ~10s | ~2-3s |
| libs/basics | 5.3s | ~4.5s | ~1.5s |

### Verification

1. `TIMING=1 pnpm --filter @votingworks/ui exec eslint .` before/after
2. `pnpm --filter @votingworks/basics lint` twice — second should be ~1.5s
3. `pnpm --filter @votingworks/ui lint` twice — second should be ~2-3s
4. `ESLINT_IMPORT_NO_CYCLE=1 pnpm --filter @votingworks/basics lint` still
   catches circular deps
5. Verify no new lint errors introduced

## Other Potential Improvements

### Pre-commit hook: parallelize via lint-staged upgrade [MEDIUM IMPACT]

**Current state:** `.husky/pre-commit` uses `--workspace-concurrency=1` (sequential).
With 5 changed packages: ~6s. With 10: ~10s. Each empty package costs ~0.7s overhead.

**Why it's sequential:** lint-staged v11 (current) uses `git stash` to isolate
staged files. Concurrent stash/unstash operations from multiple lint-staged
instances would corrupt the working tree. The concurrency limit is necessary on v11.

**Fix:** Upgrade lint-staged v11 → v15 (latest). v12+ switched from git stash to
**git worktrees** for isolation, making parallel execution safe. Then remove
`--workspace-concurrency=1` from `.husky/pre-commit`.

**Upgrade considerations:**
- v11 → v15 spans 4 major versions
- Breaking changes: drops Node 12/14/16 support (fine, we're on 20), ESM-only
  config (`.lintstagedrc.js` files use `module.exports` — need to update or
  rename to `.lintstagedrc.cjs`)
- 3 packages have custom lint-staged hooks that run build commands (`libs/ui`,
  `libs/mark-flow-ui`, `libs/logging`) — need to test that parallel builds
  don't conflict

**Expected savings:** ~3-5s on commits touching many packages (scales with
number of changed packages).

### CI: Skip Cargo install for non-Rust jobs [MEDIUM IMPACT]
- ~37 of 40 Node.js CI jobs install Rust unnecessarily
- Only scan-backend, mark-scan-backend, central-scan-backend need Rust
- Fix: add `needs_rust` parameter in `libs/monorepo-utils/src/circleci.ts`
- Saves ~30s × 37 jobs of compute per CI run

### Slow test suites [LOW-MEDIUM IMPACT]
- libs/hmpb (103s), design-backend (70s), design-frontend (60s)
- May have opportunities for test parallelization or fixture optimization

### ESLint v10 migration [EVENTUALLY REQUIRED]
- ESLint v8 has been EOL since October 2024 (no security patches)
- ESLint v10 released Feb 2026, removes `.eslintrc` entirely
- Blocked by: airbnb-base has no flat config support (community fork exists)
- Enables: multithreaded linting (`--concurrency`, 30-60% faster)
- Requires: typescript-eslint v6→v8, Node.js 20.16→20.19+

### oxlint [EXPLORATORY — VIABLE AS COMPLEMENT]

**Current state (Feb 2026, v1.50.0):**
- Rust-based linter, 695+ built-in rules across 15 plugin namespaces
- 50-100x faster than ESLint for built-in rules
- JS custom plugin support (experimental) — ESLint v9+ compatible API
- JS plugins now support: token APIs, scope analysis, code path analysis,
  inline disable directives
- JS plugins do NOT support: TypeScript type-aware rules
- Type-aware linting via tsgolint (alpha) — 43/59 typescript-eslint rules,
  10-20x faster than ESLint+typescript-eslint, but only for built-in rules
- Migration tooling: `oxlint-migrate`, `eslint-plugin-oxlint` (deduplicates)

**eslint-plugin-vx compatibility analysis (31 custom rules):**

| Status | Count | Rules |
|--------|-------|-------|
| **Works as-is** | 26 (84%) | All pure AST, token, and scope rules |
| **Works if reimplemented without types** | 2 (6%) | `gts-no-foreach` (flag all `.forEach()`), `no-react-hook-mutation-dependency` (trace `useMutation()` call) |
| **Blocked (need TypeScript type-checker)** | 3 (10%) | `no-floating-results`, `no-assert-truthiness`, `gts-spread-like-types` |

The 3 blocked rules genuinely need resolved type information (return types,
expression types, type flags). No syntactic workaround is feasible. Exposing
type info to JS plugins would require bridging tsgolint (Go) → oxlint (Rust) →
JS runtime — no timeline or stated plan from the oxc team. Likely 2027+ if ever.

**Recommended approach for VxSuite:**
1. **Pre-commit hook**: Run oxlint for built-in rules (sub-second) + the 28
   portable `eslint-plugin-vx` rules. Drop ESLint from pre-commit entirely.
2. **CI**: Run ESLint with full rule set (including the 3 type-dependent rules
   and all built-in type-aware rules). Use `eslint-plugin-oxlint` to skip rules
   oxlint already covers.
3. **`pnpm lint` (local)**: Could run oxlint first (fast feedback) then ESLint
   (full coverage), or just ESLint with `--cache` (see Change 2 above).

**Expected pre-commit impact**: 3-10s → <1s for linting portion.

**Prerequisites**:
- Port 26 eslint-plugin-vx rules to ESLint v9+ flat config format (required by
  oxlint JS plugin API)
- Reimplement 2 rules without type dependencies
- Set up `.oxlintrc.json` with built-in rules + JS plugin config
- Add `eslint-plugin-oxlint` to ESLint config for deduplication
