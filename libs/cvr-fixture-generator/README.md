# Cast Vote Record Fixture Generator

A command-line tool for generating cast vote record fixtures from ballot
packages.

## Usage

```bash
# from libs/cvr-fixture-generator
./bin/generate --ballotPackage ./ballot-package.zip --outputPath ./standard-cvr-fixture --includeBallotImages
```

Optional flags:

- `--includeBallotImages` - whether to include images and layouts for cast vote
  records with write-ins
- `--officialBallots` - whether to export a report for official ballots. By
  default the report is for test ballots.
- `--scannerNames` - if provided with a comma-separated list of scanners, there
  will be cast vote records for each of the listed scanners. Otherwise, all
  records will appear to come from a single `scanner`.
- `--numBallots` - number of records to include in the fixture. If no number is
  required, the default number is determined as the number of possible variants
  of ballot style, precinct, ballot type (absentee or precinct), scanner, and
  vote variations.
- `--ballotIdPrefix` - a prefix to prepend to every ballot id (or `UniqueId` in
  the CDF). Since ballot ids are incrementing numbers starting from 1, they will
  have id collisions in VxAdmin if they are not distinguished by a prefix.
- `--bmdBallots` - use this flag to generate BMD ballots instead of HMPB
  ballots. BMD ballots have no images, their write-ins include a `Text` field
  instead of an image reference, and all the contests are in one CVR rather than
  one CVR per sheet. Note that if you use this option, `--includeBallotImages`
  will do nothing.

## Vote Variations

The export may include the following vote variations for candidate contests:

- any possible vote variations with the correct number of votes
- a variant for each possible number of undervotes
- a variant for each possible number of overvotes
- if write-ins are allowed for the contest, any possible vote variations with
  the correct number of votes which includes one write-in

For ballot measure contests, each of the four possible vote variations are
included.

## Limitations

- Fixtures must be generated using a ballot package, which means that they
  cannot be auto-generated. We may revisit this once ballot layouts are included
  in the election definition.
- Multi-sheet ballots are not supported. There is no underlying technical
  limitation, we just do not have the fixtures or the requirement yet to test
  this and ensure the fixtures are correct.
- Vote variations do not include any cases of multiple write-ins for a single
  contest
- Vote variations do not reflect any probable real-world distribution of votes.
  For example, the number of undervotes and overvotes for ballot measure
  contests is extremely high.
- BMD ballots are not represented in the exports, only HMPB ballots.
- Ballot images do not have any real marks on them, they are only blank ballots.
- Ballot images are shared between different ballots of the same style and
  precinct since they are all identically blank. This is on purpose, to reduce
  the size of the fixture. This could be changed if it is deemed a limitation.
