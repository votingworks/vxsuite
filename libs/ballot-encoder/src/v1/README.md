# Ballot Encoder v1

Ballot choice encoding uses a binary format for maximum compactness. Only the
choices made by the voter are encoded. None of the questions or candidate names
are encoded as that data is shared by both the encoder and decoder.

## Glossary

- **bit**: a value that can be either `1` (set) or `0` (unset).
- **byte**: a sequence of 8 bits, sometimes representing a number in the `0` to
  `255` range.
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
- **dynamic-width string**: a UTF-8 string with maximum length `M`, prefixed
  with a _dynamic-width number_ (max `M`) which is the length of the string in
  bytes.

## Structure

Here's the memory structures we'll be working with (as pseudocode):

```
struct Election {
  contests: Contest[]
}

struct Contest {
  id: string
  type: ContestType
  candidates: Candidate[]?
}

enum ContestType {
  yesno,
  candidate,
}

struct Candidate {
  id: string
  name: string
}

map Votes {
  key: string
  value: CandidateVote[] | "yes" | "no"
}

struct CandidateVote {
  id: string
  name: string
  isWriteIn: boolean
}
```

Given `E` (an `Election`) and `V` (a `Votes`) corresponding to `E`, `V` is
encoded as follows:

- **Roll Call**: Encodes which contests have votes using one bit per contest,
  where a bit at offset `i` from the start of this section is set if and only if
  there is a vote record for `E.contests[i]`, i.e. `V[E.contests[i].id]` has a
  value.
  - Size: `count(E.contests)` bits.
- **Vote Data**: Encodes `V[k]` for all keys `k` in `V` ordered by `E.contests`
  they appear in `E.contests`, encoding data for a vote only if its
  corresponding bit was set in _Roll Call_. Encoding votes for a contest depends
  on its `ContestType`
  - **`yesno` contests**: Uses a single bit to represent `"yes"` (bit set) or
    `"no"` (bit unset).
    - Size: 1 bit.
  - **`candidate` contests**: Encodes candidate selection followed by write-ins,
    if applicable:
    - **Selections:** Uses one bit per candidate to indicate whether each
      candidate is selected. The order of bits is the same as the order of
      candidates in `E.contests[i].candidates`.
      - Size: `count(E.contests[i].candidates)` bits.
    - **Write-Ins**: If `E.contests[i].allowWriteIns` is `false`, this section
      is omitted. Otherwise, it contains a _dynamic-width number_ `W` of
      write-ins followed by `W` strings containing the names of the write-in
      candidates. `W`'s maximum is calculated by subtracting the number of set
      bits in _Selections_ from `E.contests[i].seats`.
      - Size:
        `sizeof(W) + W * 8 + ∑(CV : V[E.contests[i].id], CV.isWriteIn ? sizeof(CV.name) : 0)`
        bits.
- **Padding**: To ensure the encoded data is composed of whole bytes, 0 bits
  will be added to the end if necessary.

## Examples

### An empty ballot, i.e. no election contests

```
(no data)
```

### A single yesno contest with a "yes" vote

```
Roll Call is one set bit for the one contest
|
| Padding is six bits to round out the byte
| ||||||
v vvvvvv
11000000
 ^
 |
 Vote Data is one set bit for the "yes" vote
```

### A single candidate contest with two candidates, one seat, and no write-ins, voting for the second

```
Roll Call is one set bit for the one contest
|
| Second candidate was selected
| |
v v
10100000
 ^ ^^^^^
 | |||||
 | Padding is five bits to round out the byte
 |
 First candidate was not selected
```

### A single candidate contest with one candidate, one seat, writing in a name

```
Roll Call is one set bit for the one contest
|
| Write-in count is one bit since the max write-ins is 1
| |
| |        'M'  'I'   'C'   'K'  'E'   'Y'   ' '  'M'   'O'   'U'  'S'   'E'
v v       <---><----><----><---><----><----><---><----><---> <---><----><--->
10100110 0011000 10000001 0010100 01001100 01101001 10001110 10100100 10001000
 ^ ^^^^^ ^                                                                   ^
 | ||||| |                            Padding is one bit to round out the byte
 | Length of write-in name in six bits (max length 40)
 |
 Only candidate was not selected
```

### Two contests, "yes" in first and 3rd of 8 candidates in second, no write-ins

```
Roll Call is two bits, one for each contest, both set
||
|| Unset bits for each candidate not selected in second contest
|| || || |||
vv vv vv vvv
11100100 00000000
  ^  ^      ^^^^^
  |  |      |||||
  |  |      Padding is five bits to round out the byte
  |  |
  |  Set bit for the 3rd candidate in second contest
  |
  Vote Data for first contest is one set bit for the "yes" vote
```
