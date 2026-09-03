# Ballot Encoder

Provides encoding and decoding services for completed ballots.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up.

## Two Encodings

This library encodes two different things, and the names used in the code are
worth knowing before reading any further:

- **Summary ballots** — the ballots a BMD prints. The QR code carries the
  voter's selections, so the ballot can be reconstructed from it. Encoded one
  page at a time with `encodeSummaryBallotPage` / `decodeSummaryBallotPage`.
- **Bubble ballot metadata** — hand-marked paper ballots, elsewhere called
  HMPBs. The QR code identifies the page and nothing more; the selections are
  read from the marks on the page. Encoded with `encodeHmpbBallotPageMetadata`.

Both start with a three-byte prelude that says which one you have, and both then
encode a ballot hash the same way. Everything after that differs.

## Example

```ts
import {
  decodeSummaryBallotPage,
  encodeSummaryBallotPage,
  SummaryBallotPage,
} from '@votingworks/ballot-encoder';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { BallotType, getContests, vote } from '@votingworks/types';

const electionDefinition = readElectionGeneralDefinition();
const { election, ballotHash } = electionDefinition;
const ballotStyle = election.ballotStyles[0]!;
const precinct = election.precincts[0]!;

// A summary ballot is encoded a page at a time. This page holds two of the
// ballot style's twenty contests.
const pageContests = getContests({ election, ballotStyle }).filter((contest) =>
  ['president', 'question-a'].includes(contest.id)
);

const page: SummaryBallotPage = {
  ballotHash,
  ballotStyleId: ballotStyle.id,
  precinctId: precinct.id,
  isTestMode: false,
  ballotType: BallotType.Precinct,
  pageNumber: 1,
  totalPages: 2,
  ballotAuditId: 'ballot-audit-id',
  contests: pageContests,
  votes: vote(pageContests, {
    president: 'barchi-hallaren',
    'question-a': ['question-a-option-yes'],
  }),
};

const encoded = encodeSummaryBallotPage(election, page);
console.log(encoded);
/*
Uint8Array(39) [
   86, 83,   1, 225,  53,  5,  17,  15, 208, 202,
   97, 94, 207,   0,   0,  0,   0,  68,   0, 246,
   38, 22, 198, 198, 247, 66, 214,  23,  86,  70,
  151, 66, 214, 150,  72,  0,  32, 224, 128
]
*/

const decoded = decodeSummaryBallotPage(electionDefinition, encoded);
console.log(decoded.metadata.contestIds);
/*
[ 'president', 'question-a' ]
*/
console.log(decoded.votes);
/*
{
  president: [
    {
      id: 'barchi-hallaren',
      name: 'Joseph Barchi and Joseph Hallaren',
      partyIds: [Array]
    }
  ],
  'question-a': [ 'question-a-option-yes' ]
}
*/
```

Note that a yes/no vote is an array of option ids, not a bare string, and that
`vote()` will throw if given a bare string.

## Ballot Encoder Data Format

Ballot data encoding uses a binary format for maximum compactness. As little
information as possible is encoded. Here are some of the guidelines:

- Omit information known to both encoder and decoder, such as length of fixed
  strings.
- Store indexes into lists instead of ids.
- Use the minimum number of bits to store a number, i.e. one bit for yes/no, two
  bits for one of four choices, etc.
- Encode strings using a limited character encoding if possible, i.e. hex and
  write-in encoding.

### Glossary

- **bit**: a value that can be either `1` (set) or `0` (unset).
- **byte**: a sequence of 8 bits, sometimes representing a number in the `0` to
  `255` range.
- **uint8**: a number represented using a single byte with values in the range
  `0` to `255`.
- **big-endian**: the bit order this format uses, which writes the
  most-significant bit (MSB) first and the least-significant bit (LSB) last. For
  example, the value `3` in 8 bits is encoded as `00000011`, not `11000000`.
  Note that `BitWriter` and `BitReader` describe this as "little-endian" in
  their own doc comments, which is a misnomer.
- **fixed-width number**: a number `N` encoded using a fixed number of bits,
  typically a multiple of 8.
- **dynamic-width number**: a number `N` encoded in as few bits as possible
  based on a known maximum value. If the range of `N` is `0` to `M` and encoding
  `M` would take `B` bits, then `N` is encoded using `B` bits. Every numeric
  field below is one of these; the maximum is a constant, so the width is
  constant too.
- **write-in encoding**: a character encoding for write-in names that requires 5
  bits per character. Here is the full character set:
  `ABCDEFGHIJKLMNOPQRSTUVWXYZ '"-.,`.
- **hex encoding**: a character encoding for hexadecimal characters that
  requires 4 bits per character. Here is the full character set:
  `0123456789abcdef`.
- **fixed-length string**: a UTF-8 string with a length known to both encoder
  and decoder, and thus lacking a prefixed length.
- **dynamic-length string**: a string prefixed with a _dynamic-width number_
  giving its length. Unless stated otherwise this means UTF-8 with a maximum
  length of 255 bytes, i.e. an 8-bit length prefix.

### Summary Ballot Page Encoding

One page of a ballot printed by a BMD, including the votes on that page. See
`SummaryBallotPage` in [index.ts](./src/index.ts) for the in-memory
representation. Given `ED` (an `ElectionDefinition`) and `P` (a
`SummaryBallotPage`) corresponding to `ED`, `P` is encoded as follows:

- **Prelude:** The literal bytes `V`, `S` and the version number `1`. In binary,
  `01010110 01010011 00000001`. This must be at the start of the encoded data,
  or the data does not represent a summary ballot page. `isVxBallot` checks for
  exactly this.
  - Size: 24 bits.
- **Ballot Hash:** A fixed-length hex-encoded string 20 characters long
  (`ED.ballotHash.slice(0, 20)`).
  - Size: `20 * 4` bits.
- **Precinct Index:** The index of the precinct in the election's precinct list
  (`P.precinctId`).
  - Size: 13 bits.
- **Ballot Style Index:** The index of the ballot style in the election's ballot
  style list (`P.ballotStyleId`).
  - Size: 16 bits.
- **Page Number:** The 1-based page number (`P.pageNumber`).
  - Size: 5 bits.
- **Total Pages:** How many pages the ballot has (`P.totalPages`).
  - Size: 5 bits.
- **Test Ballot?:** Set if the ballot is a test ballot, unset otherwise
  (`P.isTestMode`).
  - Size: 1 bit.
- **Ballot Type:** The index of one of the `BallotType` values, i.e. `Precinct`,
  `Absentee` or `Provisional` (`P.ballotType`).
  - Size: 4 bits.
- **Ballot Audit ID:** A dynamic-length string (`P.ballotAuditId`). Required on
  summary ballots, so unlike the bubble ballot case below there is no preceding
  presence bit.
  - Size: `(1 + bytes(P.ballotAuditId)) * 8` bits.
- **Contest Bitmap:** Which of the ballot style's contests appear on this page,
  one bit per contest in `getContests({ ballotStyle, election })` order, set if
  the contest is on this page.
  - Size: `count(contests(P.ballotStyleId))` bits.
- **Roll Call:** Which of _this page's_ contests have votes, one bit per contest
  in the same order, set if there is a vote record for that contest. Note this
  covers only the contests selected by the bitmap above, not every contest in
  the ballot style.
  - Size: `count(P.contests)` bits.
- **Vote Data:** The votes themselves, for the contests whose _Roll Call_ bit
  was set, in the same order. See [Vote Data](#vote-data) below.
- **Padding:** 0 bits are added to the end until the number of bits is a
  multiple of 8. The decoder requires these to be 0 and requires end-of-input
  afterwards.

### Vote Data

How a single contest's votes are encoded depends on its `ContestType`.

- **`yesno` contests:** One bit per option in `contest.options`, set if that
  option id appears in the vote. For a conventional two-option question this is
  2 bits, not 1.
  - Size: `count(contest.options)` bits.
- **`candidate` contests:** Selections followed by write-ins, if applicable.
  - **Selections:** One bit per candidate indicating whether that candidate is
    selected, in `contest.candidates` order.
    - Size: `count(contest.candidates)` bits.
  - **Write-Ins:** Omitted entirely if `contest.allowWriteIns` is `false`.
    Otherwise let `maximumWriteIns` be `contest.seats` minus the number of
    selected non-write-in candidates, floored at 0. If `maximumWriteIns` is 0
    this section is also omitted — a contest whose seats are all taken by named
    candidates encodes no write-in data at all. Otherwise it is a dynamic-width
    number `W` counting the write-ins (maximum `maximumWriteIns`), followed by
    `W` names, each a dynamic-length string in _write-in encoding_ with a
    maximum length of 40 characters, i.e. a 6-bit length prefix and 5 bits per
    character.
    - Size: `sizeof(maximumWriteIns) + ∑(6 + 5 * length(name))` bits.
- **`straight-party` contests:** One bit per option in `contest.optionIds`, set
  if that party id appears in the vote.
  - Size: `count(contest.optionIds)` bits.

### Bubble Ballot Metadata Encoding

Bubble ballot metadata describes what is needed to identify a page of a
hand-marked paper ballot. See `HmpbBallotPageMetadata` in
[election.ts](../types/src/election.ts) for the in-memory representation. Given
metadata `H` and election definition `ED`, `H` is encoded as follows:

- **Prelude:** The literal bytes `V`, `B` and the version number `1`. In binary,
  `01010110 01000010 00000001`. This must be at the start of the encoded data,
  or the data does not represent bubble ballot metadata.
  - Size: 24 bits.
- **Ballot Hash:** A fixed-length hex-encoded string 20 characters long
  (`ED.ballotHash.slice(0, 20)`).
  - Size: `20 * 4` bits.
- **Ballot Config:** The encoding of a `BallotConfig` derived from `H` and `ED`
  goes here. See below.

#### Ballot Config

See `BallotConfig` in [index.ts](./src/index.ts) for the in-memory
representation. It is used only by bubble ballot metadata; summary ballot pages
carry their own layout, described above. Given `E` (an `Election`) and `C` (a
`BallotConfig`) corresponding to `E`, `C` is encoded as follows:

- **Precinct Index:** The index of the precinct in the election's precinct list
  (`C.precinctId`).
  - Size: 13 bits.
- **Ballot Style Index:** The index of the ballot style in the election's ballot
  style list (`C.ballotStyleId`).
  - Size: 16 bits.
- **Page Number:** The 1-based page number, up to `MAXIMUM_PAGE_NUMBERS`
  (`C.pageNumber`).
  - Size: 5 bits.
- **Test Ballot?:** Set if the ballot is a test ballot, unset otherwise
  (`C.isTestMode`).
  - Size: 1 bit.
- **Ballot Type:** The index of one of the `BallotType` values (`C.ballotType`).
  - Size: 4 bits.
- **Ballot Audit ID Set?:** Set if there is a ballot audit id, unset otherwise
  (`C.ballotAuditId`). Present only when the
  `SystemSettings.precinctScanEnableBallotAuditIds` feature is enabled.
  - Size: 1 bit.
- **Ballot Audit ID:** Only present if the previous bit is set. A dynamic-length
  string (`C.ballotAuditId`).
  - Size: `(1 + bytes(C.ballotAuditId)) * 8` bits.

#### v4.0 Bubble Ballots

`encodeHmpbBallotPageMetadata` takes a `SoftwareVersion`. Passing `'v4.0'`
selects the deprecated `BubbleBallotPreludeV4p0` (the bytes `V`, `P` and version
`2`) and caps the ballot style index at `MAXIMUM_BALLOT_STYLE_INDEX_V4_0`,
making that field 13 bits rather than 16. This exists so VxDesign can still
render v4.0 ballots; new code should not use it.

## Related Documentation

A slightly more detailed description of the encoding format, and how one would
decode it manually, can be found in the
[VxSuite v4 Technical Data Package](https://docs.voting.works/vxsuite-tdp-v4/public-documents/ballot-qr-code-data-format).
If you've made changes to the encoding format, please update the TDP as well.
