# Ballot Encoder v0

This format is the original format used to encode ballot choices, and is
retroactively called "v0" to distinguish it from later versions. Its main goal
is to be simple to implement and debug, sacrificing compactness to that end.

## Structure

See `Ballot` in [election.ts](../election.ts) for the data structures used to
represent a completed ballot in memory. Below is how the ballots are represented
in encoded form:

```bnf
; Full ballot
«ballot»          ::= «ballot style id» '.' «precinct id» '.' «votes» '.' «ballot id»

; Metadata
«ballot style id» ::= «id»
«precinct id»     ::= «id»
«ballot id»       ::= «id»

; Vote Data
«votes»           ::= «vote» | «votes» '|' «vote»
«vote»            ::= «empty vote» | «yesno vote» | «candidate votes»
«empty vote»      ::= ''
«yesno vote»      ::= '1' | '0'
«candidate votes» ::= «candidate vote» | «candidate votes» ',' «candidate vote»
«candidate vote»  ::= «write-in vote» | «candidate index»
«write-in vote»   ::= 'W'
«candidate index» ::= «digits»

; Ancillary
«digits»          ::= «digit» | «digits» «digit»
«digit»           ::= '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
«id»              ::= «char omitting '.'» | «id» «char omitting '.'»
```

## Examples

All of these assume a ballot style ID `12`, a precinct ID `23`, and a ballot ID
of `abcde`.

### An empty ballot, i.e. no contests

```
Ballot style ID
||
||     Ballot ID
||     |||||
vv     vvvvv
12.23..abcde
   ^^
   ||
   Precinct ID
```

> Size: 0 vote bytes

### A single yesno contest with a "yes" vote

```
      "yes" vote
      |
      v
12.23.1.abcde
```

> Size: 1 vote byte

### A single candidate contest with two candidates, one seat, and no write-ins, voting for the second

```
      2nd candidate
      |
      v
12.23.1.abcde
```

> Size: 1 vote byte

### A single candidate contest with one candidate, one seat, writing in a name

```
      Write-in vote for candidate contest
      |
      v
12.23.W.abcde
```

> Size: 1 vote byte

### Two contests, "yes" in first and 3rd of 8 candidates in second, no write-ins

```
      "yes" vote
      |
      v
12.23.W|2.abcde
        ^
        |
        3rd candidate
```

> Size: 3 vote bytes

### A single candidate contest selecting 1st and 3rd of 5 candidates, no write-ins

```
      1st candidate
      |
      v
12.23.0,2.abcde
        ^
        |
        3rd candidate
```

> Size: 3 vote bytes

### A non-trivial number of contests with votes for all of them

```
      #1, 1st candidate
      |
      |   #3, 4th candidate
      |   |
      |   |   #5, 5th candidate
      |   |   |
      |   |   |   #7, 1st candidate
      |   |   |   |
      |   |   |   |   #9, 6th, 4th, 7th, and 1st candidates
      |   |   |   |   | | | |
      |   |   |   |   | | | |  #11, skipped contest
      |   |   |   |   | | | |  ||
      |   |   |   |   | | | |  ||      #13, "yes" vote
      |   |   |   |   | | | |  ||      |
      |   |   |   |   | | | |  ||      |   #15, "no" vote
      |   |   |   |   | | | |  ||      |   |
      |   |   |   |   | | | |  ||      |   |   #17, "yes" vote
      |   |   |   |   | | | |  ||      |   |   |
      |   |   |   |   | | | |  ||      |   |   |   #19, "yes" vote
      |   |   |   |   | | | |  ||      |   |   |   |
      v   v   v   v   v v v v  vv      v   v   v   v
12.23.0|2|3|2|4|1|0|2|5,3,6,0|W||2,0,W|1|1|0|1|1|0|1|1.Ei5PXq7xbSJWHrF1dNRsjg
        ^   ^   ^   ^         ^  ^ ^ ^   ^   ^   ^   ^
        |   |   |   |         |  | | |   |   |   |   |
        |   |   |   |         |  | | |   |   |   |   #20, "yes" vote
        |   |   |   |         |  | | |   |   |   |
        |   |   |   |         |  | | |   |   |   #18, "no" vote
        |   |   |   |         |  | | |   |   |
        |   |   |   |         |  | | |   |   #16, "yes" vote
        |   |   |   |         |  | | |   |
        |   |   |   |         |  | | |   #14, "yes" vote
        |   |   |   |         |  | | |
        |   |   |   |         |  #12, 3rd, 1st, and write-in candidates
        |   |   |   |         |
        |   |   |   |         #10, write-in candidate
        |   |   |   |
        |   |   |   #8, 3rd candidate
        |   |   |
        |   |   #6, 2nd candidate
        |   |
        |   #4, 3rd candidate
        |
        #2 3rd candidate
```

> Size: 48 vote bytes
