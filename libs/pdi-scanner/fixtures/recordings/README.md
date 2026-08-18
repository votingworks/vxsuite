# pdictl session recordings

Recordings of real scanner sessions, replayed as regression tests by the
`replay_recorded_fixtures` test in `src/rust/main.rs`.

Two kinds of files live here:

- `*.jsonl` — full-fidelity recordings straight from a real scanner. These
  contain complete image data (tens of MB per scanned sheet) and are **not**
  committed (see `.gitignore`); they live only on the machine that recorded
  them.
- `*.synth.jsonl.gz` — committed synthetic fixtures derived from full-fidelity
  recordings: identical in every way except that image chunk contents are
  replaced with deterministic low-entropy filler (chunk sizes and boundaries
  preserved), which makes them compress to almost nothing. Commands, packet
  bytes, event order, and timestamps are byte-for-byte the original session's;
  only pixel values (and therefore the decoded `scanComplete` payloads) are
  synthetic.

## Recording a session

Recording is compiled in only with the `recording` cargo feature, which is off
by default: production builds physically lack the ability to record. QA or
diagnostic images may enable it; test builds always have it (via a
self-referential dev-dependency), so the replay tests below run with a plain
`cargo test`.

On a machine with a PDI scanner attached, build pdictl with the feature and run
it (or the app driving it) with the `PDICTL_RECORD` environment variable set:

```sh
cargo build --release --features recording
PDICTL_RECORD=normal-scan.jsonl ./target/release/pdictl
```

Every entry crossing pdictl's boundaries — stdin commands, raw scanner packets,
outgoing packets, stdout frames — is appended to the file in observed order,
stamped with milliseconds since the recording started (useful for latency
analysis, e.g. image-chunk arrival to `scanComplete` frame; ignored by replay).
See `src/rust/recording.rs` for the format.

## Replaying

Drop `.jsonl` files in this directory and run `cargo test`. The replay feeds
each recording's inputs back through the command loop in lockstep and asserts
that pdictl produces the same outputs. Committed `.synth.jsonl.gz` fixtures are
replayed the same way (decompressed transparently). Set `PDICTL_RECORDINGS_DIR`
to replay recordings from a different directory.

## Regenerating synthetic fixtures

After recording a new session, produce its committable synthetic twin with:

```sh
cargo test regenerate_synthetic_fixtures -- --ignored
```

This rewrites every `.jsonl` recording in this directory as a `.synth.jsonl.gz`
beside it, regenerating expected outputs by running the substituted inputs
through the command loop. It asserts along the way that outgoing packets and
JSON stdout frames are unaffected by the pixel substitution, so a synthetic
fixture exercises everything its source did except real image content.

## Caveats

- Recordings containing a _failed_ `connect` (scanner not found) can't be
  replayed: the replay harness always provides a connectable mock scanner.
- Error messages are compared leniently (error code must match; message text may
  differ), since the original error can't be exactly reconstructed.
- Recordings include full image data and can be tens of MB per scanned sheet, so
  they are not committed to the repository (see `.gitignore`).
