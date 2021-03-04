# Ballot Encoder Data Format

Ballot data encoding uses a binary format for maximum compactness. As little
information as possible is encoded. Here are some of the guidelines:

- Omit information known to both encoder and decoder, such as length of fixed
  strings.
- Store indexes into lists instead of ids.
- Use the minimum number of bits to store a number, i.e. one bit for yes/no, two
  bits for one of four choices, etc.
- Encode strings using a limited character encoding if possible, i.e. hex and
  write-in encoding.

## Glossary

- **bit**: a value that can be either `1` (set) or `0` (unset).
- **byte**: a sequence of 8 bits, sometimes representing a number in the `0` to
  `255` range.
- **uint8**: a number represented using a single byte with values in the range
  `0` to `255`.
- **little-endian**: the binary encoding scheme this format uses, which encodes
  the most-significant bit (MSB) first and the least-significant bit (LSB) last.
  For example, the value `3` is encoded as `00000011` (or, if we were using
  _big-endian_, as `11000000`).
- **fixed-width number**: a number `N` encoded using a fixed number of bits,
  typically a multiple of 8.
- **dynamic-width number**: a number `N` encoded in as few bits as possible
  based on a known maximum value. If the range of `N` is `0` to `M` and encoding
  `M` would take `B` bits, then `N` is encoded using `B` bits.
- **write-in encoding**: a character encoding for write-in names that requires 5
  bits per character. Here is the full character set:
  `ABCDEFGHIJKLMNOPQRSTUVWXYZ '"-.,`.
- **hex encoding**: a character encoding for hexidecimal characters that
  requires 4 bits per character. Here is the full character set:
  `0123456789abcdef`.
- **fixed-length string**: a UTF-8 string with a length known to both encoder
  and decoder, and thus lacking a prefixed length.
- **dynamic-length string**: a UTF-8 string with maximum length `M`, prefixed
  with a _dynamic-width number_ (max `M`) which is the length of the string in
  bytes.

## Shared Ballot Config

See `BallotConfig` in [index.ts](./index.ts) for the data structure used to
represent this data in memory and applies to both BMD ballots and HMPB ballots.
Given `E` (an `Election`) and `C` (a `BallotConfig`) corresponding to `E`, `C`
is encoded as follows:

- **Precinct Count:** A check value encoded as uint8 (`E.precincts.length`).
  - Size: 8 bits.
- **Ballot Style Count:** A check value encoded as uint8
  (`E.ballotStyles.length`).
  - Size: 8 bits.
- **Contest Count:** A check value encoded as uint8 (`E.contests.length`).
  - Size: 8 bits.
- **Precinct Index:** A dynamic-width number for the index of the precinct
  (`C.precinctId`).
  - Size: 1-8 bits.
- **Ballot Style Index:** A dynamic-width number for the index of the ballot
  style (`C.ballotStyleId`).
  - Size: 1-8 bits.
- **Primary Locale:** _(HMPB-only.)_ A dynamic-width number for the index of the
  primary locale within the known locale list (`C.locales.primary`).
  - Size: 8 bits.
- **Secondary Locale Set?:** _(HMPB-only.)_ A boolean set to true when there is
  a secondary locale (`C.locales.secondary`).
  - Size: 1 bit.
- **Secondary Locale:** _(HMPB-only.)_ A dynamic-width number for the index of
  the secondary locale within the known locale list (`C.locales.secondary`).
  - Size: 8 bits.
- **Page Number:** _(HMPB-only.)_ A dynamic-width number for the 1-based page
  number up to a maximum number of pages (`C.pageNumber`).
  - Size: 5 bits.
- **Test Ballot?:** This is a single bit that is set if the ballot is a test
  ballot, unset otherwise (`C.isTestMode`).
  - Size: 1 bit.
- **Ballot Type:** One of the `BallotType` values, e.g. `Standard` or `Absentee`
  (`C.ballotType`).
  - Size: 4 bits.
- **Ballot ID Set?:** This bit is true if there is a ballot id, unset otherwise
  (`C.ballotId`).
  - Size: 1 bit.
- **Ballot ID:** Only present if the previous bit is set. This is a
  dynamic-length string whose maximum length is 255 bytes (`C.ballotId`).
  - Size: `(1 + bytes(C.ballotId)) * 8` bits.

## Completed Ballot Encoding

A "completed ballot" is one that has been filled out by a voter. See
`CompletedBallot` in [election.ts](../../types/src/election.ts) for the data
structures used to represent a completed ballot in memory. Given `ED` (an
`ElectionDefinition`), `B` (a `CompletedBallot`) corresponding to `ED`, `B` is
encoded as follows:

- **Prelude:** This is the literal string `VX` encoded as UTF-8 bytes, followed
  by the integer 2 encoded as uint8. In binary, this is
  `01010110 01011000 00000002`. This must be at the start of the encoded data,
  or the data does not represent a valid v2-encoded ballot.
  - Size: 24 bits.
- **Election Hash:** This is a fixed-length hexidecimal string 20 characters
  long (`ED.electionHash.slice(0, 20)`).
  - Size: `20 * 4` bits.
- **Ballot Config:** The encoding of a `BallotConfig` derived from `B` and `ED`
  goes here.
- **Roll Call**: Encodes which contests have votes using one bit per contest,
  where a bit at offset `i` from the start of this section is set if and only if
  there is a vote record for `ED.election.contests[i]`, i.e.
  `B.votes[E.contests[i].id]` has a value. In the case of `ms-either-neither`
  contests, two bits are used, one for each of the two subcontests
  (`eitherNeitherContestId` and `pickOneContestId`).
  - Size: `count(ED.election.contests)` bits.
- **Vote Data**: Encodes `B.votes[k]` for all keys `k` in `B.votes` ordered by
  `ED.election.contests` they appear in `ED.election.contests`, encoding data
  for a vote only if its corresponding bit was set in _Roll Call_. Encoding
  votes for a contest depends on its `ContestType`.
  - **`yesno` contests**: Uses a single bit to represent `"yes"` (bit set) or
    `"no"` (bit unset).
    - Size: 1 bit.
  - **`ms-either-neither` contests**: Use two bits, one to represent
    `"yes"`/`"either"` and `"no"`/`"neither"`, and a second one to represent
    `"yes"`/`"in favor of first"` and `"no"`/`"in favor of second"`.
  - **`candidate` contests**: Encodes candidate selection followed by write-ins,
    if applicable:
    - **Selections:** Uses one bit per candidate to indicate whether each
      candidate is selected. The order of bits is the same as the order of
      candidates in `ED.election.contests[i].candidates`.
      - Size: `count(ED.election.contests[i].candidates)` bits.
    - **Write-Ins**: If `ED.election.contests[i].allowWriteIns` is `false`, this
      section is omitted. Otherwise, it contains a _dynamic-width number_ `W` of
      write-ins followed by `W` strings containing the names of the write-in
      candidates. `W`'s maximum is calculated by subtracting the number of set
      bits in _Selections_ from `ED.election.contests[i].seats`.
      - Size:
        `sizeof(W) + W * 8 + ∑(CV : V[ED.election.contests[i].id], CV.isWriteIn ? sizeof(CV.name) : 0)`
        bits.
- **Padding**: To ensure the encoded data is composed of whole bytes, 0 bits
  will be added to the end until the number of bits is a multiple of 8.

## HMPB Metadata Encoding

HMPB metadata describes the information needed to properly scan a hand-marked
paper ballot. See `HMPBBallotPageMetadata` in [index.ts](./index.ts). Given
metadata `H` and election definition `ED`, `H` is encoded as follows:

- **Prelude:** This is the literal string `VP` encoded as UTF-8 bytes, followed
  by the integer 1 encoded as uint8. In binary, this is
  `01010110 01011000 00000001`. This must be at the start of the encoded data,
  or the data does not represent a valid v1-encoded HMPB metadata.
  - Size: 24 bits.
- **Election Hash:** This is a dynamic-length hexidecimal string long
  (`ED.electionHash`).
  - Size: `(1 + bytes(ED.electionHash) / 2) * 8` bits.
- **Ballot Config:** The encoding of a `BallotConfig` derived from `H` and `ED`
  goes here.
