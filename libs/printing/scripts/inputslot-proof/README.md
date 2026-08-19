# input-slot migration proof harness

**Temporary.** Committed so the proof is reviewable and reproducible, and
reverted before merge — the same way the `lpr` → `lp` harness was in #9177.

## What it checks

Whether moving the M404n input slot from a per-job caller flag
(`isM404nSupportRequired`) to the printer's config changes what gets submitted
to CUPS.

What the printer receives is a pure function of (document bytes, `lp`
invocation, queue config + filter versions). The queue config and the document
are untouched by this change, so the harness compares the `lp` invocation
itself, for every supported printer crossed with every option shape a real call
site uses.

It runs the **real, unmodified printer code path** on both sides — no mocks. The
CUPS clients are shimmed onto `PATH` (`make-shims.sh`), so `detectPrinter()`
discovers the device under test, configures it, and submits through
`printer.print()` exactly as in production, while the `lp` shim records the argv
it received and a hash of stdin.

The two sides differ only in the calling convention, which is the change itself:

- **before** (parent commit worktree): caller passes `isM404nSupportRequired` on
  the call sites that set it
- **after** (this branch): caller passes nothing; `printer.ts` injects from
  config

## Result: not byte-identical, in three understood ways

Run over 25 cells × 5 printers. The deltas are all in the `InputSlot` option:

1. **M404n gains it on 14 cells.** The two-sided HMPB ballot cells (7 paper
   sizes × 2 duplex modes). This is the intended fix — those call sites never
   set the flag, so on an M404n they could still stop for a tray confirmation.

2. **Every other printer loses it on 9–10 cells.** The flag was passed by the
   caller without knowing which printer was attached, so `InputSlot=M404n_Tray2`
   was previously sent to the M454, 4001, 4201 **and the Citizen thermal
   printer** on every flagged call site. It was inert there — the choice isn't
   in those PPDs, so CUPS drops it — which is why nobody noticed. Config-driven
   injection stops sending it.

3. **One cell reorders.** If a caller passes its own `InputSlot` in `raw`
   alongside a printer that pins another option, the `-o` order shifts. No
   production call site passes `raw` at all, so this is unreachable today; the
   keys differ, so CUPS's last-wins rule is not engaged either way.

Every remaining cell is byte-identical in both argv and stdin.

## Usage

```sh
./run.sh <baseline-worktree>   # a worktree checked out at this branch's parent
```

The baseline worktree needs its dependencies installed and built
(`pnpm install --filter @votingworks/printing...` then
`pnpm --filter @votingworks/printing... build`).

Results land in `.work/report.md`, with per-printer diffs in
`.work/out/<printer>.diff.json`.
