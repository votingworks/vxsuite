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

See `CompletedBallot` in [election.ts](../election.ts) for the data structures
used to represent a completed ballot in memory. Given `E` (an `Election`) and
`V` (a `Votes`) corresponding to `E`, `V` is encoded as follows:

- **Roll Call**: Encodes which contests have votes using one bit per contest,
  where a bit at offset `i` from the start of this section is set if and only if
  there is a vote record for `E.contests[i]`, i.e. `V[E.contests[i].id]` has a
  value.
  - Size: `count(E.contests)` bits.
- **Vote Data**: Encodes `V[k]` for all keys `k` in `V` ordered by `E.contests`
  they appear in `E.contests`, encoding data for a vote only if its
  corresponding bit was set in _Roll Call_. Encoding votes for a contest depends
  on its `ContestType`.
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

All of these assume a ballot style ID `12`, a precinct ID `23`, and a ballot ID
of `abcde`. The first example will show all the metadata, but the subsequent
ones will omit it for brevity.

### An empty ballot, i.e. no contests

As we know there are no contests, we spend no bits on the vote data at all.
Normally the vote data would go after "Precinct ID" and before "Ballot ID".

```
Magic identifier "VX"      Ballot style ID length     Precinct ID length
|||||||| ||||||||          ||||||||                   ||||||||
vvvvvvvv vvvvvvvv          vvvvvvvv                   vvvvvvvv
01010110 01011000 00000001 00000010 00110001 00110010 00000010 00110010 00110011
                  ^^^^^^^^          ^^^^^^^^ ^^^^^^^^          ^^^^^^^^ ^^^^^^^^
                  ||||||||          |||||||| ||||||||          |||||||| ||||||||
                  Encoding v1         '1'      '2'               '2'      '3'

Ballot ID length
||||||||
vvvvvvvv
00000101 01100001 01100010 01100011 01100100 01100101
         ^^^^^^^^ ^^^^^^^^ ^^^^^^^^ ^^^^^^^^ ^^^^^^^^
         |||||||| |||||||| |||||||| |||||||| ||||||||
           'a'      'b'      'c'      'd'      'e'
```

> Size: 0 vote bits (0 bytes)

### A single yesno contest with a "yes" vote

```
Roll Call is one set bit for the one contest
|
v
11
 ^
 |
 Vote Data is one set bit for the "yes" vote
```

> Size: 2 vote bits (1 byte)

### A single candidate contest with two candidates, one seat, and no write-ins, voting for the second

```
Roll Call is one set bit for the one contest
|
| Second candidate was selected
| |
v v
101
 ^
 |
 First candidate was not selected
```

> Size: 3 vote bits (1 byte)

### A single candidate contest with one candidate, one seat, writing in a name

```
Roll Call is one set bit for the one contest
|
| Write-in count is one bit since the max write-ins is 1
| |
| |        'M'  'I'   'C'   'K'  'E'   'Y'   ' '  'M'   'O'   'U'  'S'   'E'
v v       <---><----><----><---><----><----><---><----><---> <---><----><--->
10100110 0011000 10000001 0010100 01001100 01101001 10001110 10100100 1000100
 ^ ^^^^^ ^
 | ||||| |
 | Length of write-in name in six bits (max length 40)
 |
 Only candidate was not selected
```

> Size: 71 vote bits (9 bytes)

### Two contests, "yes" in first and 3rd of 8 candidates in second, no write-ins

```
Roll Call is two bits, one for each contest, both set
||
|| Unset bits for each candidate not selected in second contest
|| || || |||
vv vv vv vvv
11100100 000
  ^  ^
  |  |
  |  |
  |  |
  |  Set bit for the 3rd candidate in second contest
  |
  Vote Data for first contest is one set bit for the "yes" vote
```

> Size: 11 vote bits (2 bytes)

### A single candidate contest selecting 1st and 3rd of 5 candidates, no write-ins

```
Roll Call is one set bit for the one contest
|
| Unset bits for each candidate not selected (2nd, 4th, and 5th)
| | ||
v v vv
110100
 ^ ^
 | |
 Set bits for selected candidates (1st and 3rd)
```

> Size: 6 vote bits (1 byte)

### A non-trivial number of contests with votes for all of them

```
Roll Call is one bit for each contest
|||||||| |||||||| ||||
|||||||| |||||||| ||||       #2, 3rd candidate
|||||||| |||||||| ||||       |||||| |     #4, 3rd candidate
|||||||| |||||||| ||||       |||||| |     || |||||||| |||||||| ||||||||
vvvvvvvv vvvvvvvv vvvv       vvvvvv v     vv vvvvvvvv vvvvvvvv vvvvvvvv
11111111 11011111 11111000 00001000 00001000 10000000 00000000 00000000
                      ^^^^ ^^        ^^^^^
                      |||| ||        |||||
                      |||| ||        #3, 4th candidate
                      #1, 1st candidate

#5, 5th candidate
|||||||| |
|||||||| |  #7, 1st candidate
|||||||| |  |
|||||||| |  |   #9, 1st, 4th, 6th, and 7th candidates
|||||||| |  |   | |||||||| ||||||
|||||||| |  |   | |||||||| ||||||   Write-in name length
|||||||| |  |   | |||||||| ||||||   ||||||
|||||||| |  |   | |||||||| ||||||   ||||||
|||||||| |  |   | |||||||| ||||||   ||||||       'H'        'R'
vvvvvvvv v  v   v vvvvvvvv vvvvvv   vvvvvv      vvvvv      vvv vv
00001000 00110011 00101100 00000001 00010010 01100111 01110100 01101000
          ^^ ^^^                 ^^       ^^ ^^^      ^^^^^      ^^^^^^
          || |||                 ||       || |||      |||||      ||||||
          || |||                 ||        'T'         'O'       #12, 1st, 3rd, and write-in candidates
          || |||                 ||
          || |||                 #10, 1 write-in candidate
          || |||
          || #8, 3rd candidate
          ||
          #6, 2nd candidate

                              # 13, "yes" vote
                              |
                              | #15 "no" vote
                              | |
Write-in count                | | #17, "yes" vote
|                             | | |
|       'O'         'I'       | | |  #19, "yes" vote
|      | ||||      |||||      | | |  |
v      v vvvv      vvvvv      v v v  v
10001000 11100001 10100001 10111011 011
 ^^^^^^      ^^^^ ^     ^^ ^^^ ^ ^  ^ ^
 ||||||      |||| |     || ||| | |  | |
 ||||||       'D'        'N'   | |  | #20, "yes" vote
 ||||||                        | |  |
  Write-in name length         | |  #18 "no" vote
                               | |
                               | #16, "yes" vote
                               |
                               #14, "yes" vote
```

> Size: 99 vote bits (13 bytes)
