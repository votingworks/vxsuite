# Consolidate ballot encoding in Rust

**Author:** @eventualbuddha

**Status:** `implementing`

## Existing Discussion

- [#4980: Unify underlying BMD/HMPB interpretation infrastructure](https://github.com/votingworks/vxsuite/issues/4980)
- [#7259: feat: improve Rust BMD/HMP ballot data encoding support](https://github.com/votingworks/vxsuite/pull/7259)
- [Spec 0005: Migrate `ballot-interpreter` from Neon to napi-rs](./0005-migrate-ballot-interpreter-to-napi-rs.md)

## Problem

Ballot QR code payloads are encoded and decoded by two independent
implementations of the same bit-level format:

- `libs/ballot-encoder` (TypeScript) — the only producer. Every printed ballot's
  QR code comes from here, via `libs/hmpb` for bubble ballots and
  `libs/ui/src/bmd_paper_ballot.tsx` for summary ballots. It also decodes
  summary ballots during interpretation.
- `libs/types-rs` (Rust) — `bubble_ballot.rs` and `bmd/` encode and decode the
  same formats. This is the only implementation that decodes bubble ballot
  metadata; the TypeScript package has no bubble ballot decoder at all.

Two implementations of one wire format is a correctness hazard in the part of
the system with the least tolerance for it. A divergence between them means
ballots that print but don't scan, or scan as the wrong votes. Today the only
thing holding them together is `cross_language_bmd.test.ts`, which covers
summary ballots in both directions but leaves bubble ballot metadata — carried
by _every_ scanned ballot — with no equivalence check at all.

The duplication also taxes every format change. Adding the third yes/no option,
multi-page summary ballots, and ballot audit IDs each had to be done twice, in
two languages, with hand-maintained agreement on bit widths.

[#7259](https://github.com/votingworks/vxsuite/pull/7259) landed the Rust
implementation and named the remaining work:

> The next steps will be to add some sort of test verifying that the Rust and
> TypeScript versions are interchangeable and to add the feature flag that
> controls which version is used in the ballot interpretation pipeline.

This spec covers finishing that, with one change of plan: rather than a feature
flag selecting between two implementations, delete the TypeScript one.

## Proposal

Make `libs/types-rs` the single implementation, and turn `libs/ballot-encoder`
into a thin napi-rs addon over it. The package name and every consumer import
path stay exactly as they are.

```
libs/types-rs/          pure Rust encode/decode (unchanged, already complete)
libs/ballot-encoder/    napi-rs addon exposing it to TypeScript
  Cargo.toml            crate-type = ["cdylib"], deps: napi, napi-derive, types-rs
  src/lib.rs            #[napi] exports
  src/index.ts          thin re-export
libs/ui/, libs/hmpb/, libs/ballot-interpreter/    unchanged imports
```

This mirrors `libs/ballot-interpreter`, which spec 0005 established as the
pattern for Rust code called from TypeScript.

### Why a native addon rather than Wasm

Wasm was the initial instinct, because a native addon can only run in Node and
the encoder is reachable from `libs/ui`, which every frontend bundles. That
turns out not to be a real constraint:

- No frontend renders a ballot. Every `BmdPaperBallot` consumer is Node-side:
  `apps/mark/backend`, `apps/mark-scan/backend`, `libs/printing`,
  `libs/test-decks`, `libs/bmd-ballot-fixtures`. VxDesign displays
  server-rendered PDFs; its only `libs/hmpb` imports in `src/` are
  `import type`, which is erased.
- Building all eight frontends confirms it. None of `encodeSummaryBallotPage`,
  `encodeHmpbBallotPageMetadata`, `decodeSummaryBallotPage`, `BitWriter`, or
  `BitReader` appears in any bundle. The only ballot-encoder code that survives
  tree-shaking is two discarded `new CustomEncoding(...)` calls that Rollup
  can't prove pure.

Given that, a native addon is the better fit: it keeps encoding synchronous, so
`bmd_paper_ballot.tsx` can keep calling it during render; it needs no Vite
configuration in any of the eight frontends; it works unchanged under Vitest,
which runs in Node even for jsdom tests; and it follows the convention already
set by spec 0005 rather than introducing a second Rust/JS bridge.

### The one blocker this creates

`libs/ui/src/index.ts` re-exports `./bmd_paper_ballot`, so every frontend's
module graph reaches `@votingworks/ballot-encoder` even though the code is
eliminated from the output. Resolution happens before tree-shaking, so once the
package's entry point loads a `.node` binary, all eight frontend builds break —
tree-shaking will not save us.

The edge has to go before the addon lands. Rather than relocate the component,
`BmdPaperBallot` takes the QR payload as a prop and `libs/ui` drops the
dependency outright. Every caller already renders on the server and already
holds the inputs, so the encoding moves to them. That is arguably where it
belonged anyway — a component whose job is to render a ballot should not also be
encoding one — and it leaves nothing for a future change to re-introduce.

Wasm would not have avoided this. `wasm-pack --target nodejs` emits plain
JavaScript, so it resolves where a `.node` binary does not, but it instantiates
the module at file scope: `readFileSync`, `new WebAssembly.Module`,
`new WebAssembly.Instance`. Building a package with exactly that shape into the
frontends confirms those statements survive tree-shaking and are emitted as a
top-level immediately-invoked block, which would throw on page load — `fs` is a
throwing stub in those configs and `__dirname` is never defined. It also breaks
the dev server outright, which serves the CJS entry unbundled.
`--target bundler` sidesteps both but makes initialization async, which would
force `encodeSummaryBallotPage` to become async and change every caller.

### Plan

Each step is a separate PR, in order:

1. **v4.0 bubble ballot encoding parity.** `libs/hmpb` still renders v4.0
   ballots for VxDesign, which uses a different prelude (`VP\x02`) and a 13-bit
   ballot style index instead of 16. Rust implements neither.
2. **Bubble ballot cross-language test.** The equivalence test that #7259 asked
   for, for the format that currently has none. This must pass before anything
   is deleted.
3. **Pass the QR payload into `BmdPaperBallot`.** Severs the frontend edge above
   by removing `libs/ui`'s dependency on the encoder entirely.
4. **Turn `libs/ballot-encoder` into a napi-rs addon.** New crate, `#[napi]`
   exports, build wiring. The TypeScript implementation stays in place and the
   addon is tested against it.
5. **Swap consumers and delete the TypeScript implementation.**

Steps 1 and 2 are worth landing on their own merits even if the rest stalls: one
closes a real gap in what Rust can encode, the other closes a real gap in what
we verify.

### Byte-for-byte compatibility is the acceptance criterion

No ballot printed by this change may differ by a single bit from one printed
before it. The cross-language tests from steps 1 and 2 are how that is
established, and no ballot fixture image should need regeneration. If a fixture
changes, that is a bug in this work, not an expected cost of it.

## Alternatives Considered

**Compile `types-rs` to Wasm.** Portable across runtimes and would let a browser
decode ballots — appealing for a future public ballot-verification tool. But no
production frontend needs it, browser Wasm initialization is asynchronous (which
would force `encodeSummaryBallotPage` to become async and change every caller),
and it would mean maintaining a second Rust/JS bridge alongside napi-rs. A Wasm
build for a browser-side decoding tool can be added later without disturbing
this; the two are not exclusive.

**Keep both implementations behind a feature flag**, as #7259 originally
proposed. This is the safer-sounding option, and it is the one that preserves
the problem: two implementations of one wire format, now with a runtime switch
deciding which ballots get which. The flag is useful during rollout of a
_behavioral_ change; here the intent is that behavior is identical, and a
byte-equality test demonstrates that better than a flag does.

**Replace only the bit primitives**, keeping the higher-level encode/decode
logic in TypeScript — the approach taken on the abandoned
`brian/feat/scan/rust-summary-ballot-encoding` branch. It leaves the format
logic duplicated, which is the part that actually diverges, while adding a
native addon anyway. It also predates the napi-rs migration and would need
rewriting.

**Fold the encoder into `libs/ballot-interpreter`**, which already has a napi-rs
addon with `encode_bmd_ballot_data` and `decode_bmd_ballot_data` exports. Avoids
a second native artifact, but inverts the layering: `libs/ui` and `libs/hmpb`
would depend on the ballot _interpreter_, and its image processing dependencies,
in order to render a QR code.

## Open Questions

**Does this need to ride along with other interpretation changes?** On #4980,
@arsalansufi noted the consolidation "dropped in importance as we move away from
summary ballots" and suggested landing it alongside other interpretation work
"as we'll be redoing an accuracy test anyway." That reasoning applies to summary
ballots; bubble ballot metadata is on every scanned ballot regardless. If the
byte-equality criterion above holds, the scanning behavior is unchanged and the
certification impact should be nil — but that is worth confirming rather than
assuming.

**Should `libs/ballot-interpreter` keep depending on
`@votingworks/ballot-encoder` from TypeScript?** After this change it would
reach `types-rs` twice: directly in Rust, and through the addon in TypeScript.
Consolidating on its own napi exports would avoid shipping the same Rust code in
two `.node` binaries, at the cost of a larger diff in step 5.

**Should `bmd_paper_ballot` still move out of `libs/ui` eventually?** Step 3
removes the dependency but leaves a print-only component in a package every
frontend bundles. That is now a tidiness question rather than a blocker. A
`libs/summary-ballot` package holding it alongside `libs/printing`'s
`summary_ballot_layout.tsx` is the obvious shape if we ever want it; it was
attempted here and abandoned, because the component's dual-language test mocks
libs/ui internals and cannot do that from another package.
