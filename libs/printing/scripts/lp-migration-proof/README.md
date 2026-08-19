# lp-migration proof harness

**Temporary.** This harness is committed so the `lpr` → `lp` migration proof is
reviewable and reproducible, and is reverted before merge.

## What it proves

That migrating job submission in `libs/printing/src/printer/print.ts` from `lpr`
to `lp` does not change the bytes CUPS delivers to the printer. What the printer
receives is a pure function of (document bytes, IPP job attributes, queue
config + filter versions); the queue config is unchanged by the migration, so
the harness checks the rest at three levels for every cell of an option matrix
mirroring how `print.ts` submits jobs:

1. **Document identity** — the spooled document (`d<job>-001`) is byte-identical
   whether submitted by `lpr` or `lp`.
2. **IPP job attribute identity** — `Get-Job-Attributes` (via `ipptool`) reports
   identical attribute sets, excluding inherently per-job attributes (`job-id`,
   `job-uuid`, timestamps, ...). `job-name` is deliberately _included_ in the
   comparison.
3. **Filter output identity** — a queue configured with the production PPDs but
   a `file:` device URI captures exactly the bytes the `usb` backend would ship
   to the printer. Each cell is submitted twice via `lpr` to establish the
   inherent run-to-run volatility (e.g. `%%CreationDate`), then once via `lp`.
   The `lp` output must match the `lpr` output byte-for-byte after normalizing
   _only_ lines that the lpr-vs-lpr baseline already showed volatile, and every
   volatile line must match a small allowlist of expected patterns.

## How it runs

Entirely as an unprivileged user. It starts a private `cupsd` (the same binary
and filters as the system CUPS) on `localhost:8631` with its own config, spool,
and logs under `.work/`, the same way the CUPS test suite does. The system CUPS
instance and its queues are never touched. No sudo required.

Queues created in the sandbox, mirroring `configurePrinter()`:

- `vxgeneric` — `generic-postscript-driver.ppd` (drives most supported printers,
  including the HP 4201)
- `vxm404n` — `hp-laserjet-pro-m404n.ppd` (production derives this PPD from the
  generic one at runtime via `deriveM404nPpd`; the checked-in file is used here
  — identical across both submission paths, which is what matters)

## Matrix

queues × documents (8-page letter ballot, 6-page legal ballot) × sides
(one-sided, two-sided-long-edge) × media (letter, legal, custom-8.5x17,
custom-8.5x22) × copies (default, 3) × extra raw options (none;
`pdftops-renderer=pdftops` on vxgeneric — the 4201 path; `InputSlot=M404n_Tray2`
on vxm404n). Each cell submits three jobs: `lpr`, `lpr` again (baseline), `lp`.

Plus one negative case per client (nonexistent destination) to compare
error-path behavior.

## Usage

```sh
./run.sh            # full matrix (hundreds of jobs, tens of minutes)
./run.sh --quick    # 16-cell smoke subset (~2 min)
```

Results land in `.work/report.md` (verdict table + environment versions) and
`.work/cells.csv`. Artifacts for failing cells are kept in `.work/out/`.
