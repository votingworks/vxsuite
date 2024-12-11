# Fixture Generators

Tools for generating election data fixtures for testing.

## Cast Vote Record Fixture Generator

A command-line tool for generating cast vote record fixtures from ballot
packages. Generates BMD ballot CVRs for VotingWorks election definitions and
HMPB ballot CVRs for NH (`gridLayouts`) election definitions

### Usage

```bash
./bin/generate-cvrs --electionDefinition ./election.json --outputPath ./standard-cvr-fixture
```

Optional flags:

- `--officialBallots` - whether to export a report for official ballots. By
  default the report is for test ballots.
- `--scannerIds` - if provided with a space-separated list of scanner ids, there
  will be cast vote records for each of the listed scanners. Otherwise, all
  records will appear to come from a single `scanner`.
- `--numBallots` - number of records to include in the fixture. If no number is
  required, the default number is determined as the number of possible variants
  of ballot style, precinct, ballot type (absentee or precinct), scanner, and
  vote variations.
- `--ballotIdPrefix` - a prefix to prepend to every ballot id (or `UniqueId` in
  the CDF). Since ballot ids are incrementing numbers starting from 1, they will
  have id collisions in VxAdmin if they are not distinguished by a prefix.

### Saved Fixtures

To regenerate the saved fixtures in [libs/fixtures](../libs/fixtures), run:

```bash
pnpm generate-cvr-fixtures
```

### Vote Variations

The export may include the following vote variations for candidate contests:

- any possible vote variations with the correct number of votes
- a variant for each possible number of undervotes
- a variant for each possible number of overvotes
- if write-ins are allowed for the contest, any possible vote variations with
  the correct number of votes which includes one write-in

For ballot measure contests, each of the four possible vote variations are
included.

### Limitations

- Multi-sheet ballots are not supported. There is no underlying technical
  limitation, we just do not have the fixtures or the requirement yet to test
  this and ensure the fixtures are correct.
- Vote variations do not include any cases of multiple write-ins for a single
  contest
- Vote variations do not reflect any probable real-world distribution of votes.
  For example, the number of undervotes and overvotes for ballot measure
  contests is extremely high.
- Ballot images do not have any real marks on them, they are only blank pages.

## Election Fixture Generator

A command-line tool for generating an election definition based on a set of
configurable parameters. Originally created to support scale testing by creating
large election definitions.

### Usage

Takes a JSON config file as input. See
[config.ts](./src/generate-election/config.ts) for a list of fields. All fields
are optional and have default values.

```bash
./bin/generate-election config.json > election.json
```

## Election Package Generator

A command-line tool for generating election packages and elections with grid
layouts and translations. Follow the instructions to setup Google Cloud account
authentication [here](/../backend/src/language_and_audio/README.md) before
using.

```bash
./bin/generate-election-package -e path/to/base-election-definition.json -o path/to/output-directory
```

To generate an election.json and election-package file in the specified output
directory with gridLayouts and all necessary strings from the base election
provided. If --isMultiLanguage is specified then the strings will include
translations for all languages. If --priorElectionPackage is specified that
election package will be used as a cache for translations before querying google
cloud.

## Election Packages Generator

Wrapper script to regenerate election packages for all configured fixtures.

```bash
pnpm generate-election-packages
```

Run with FORCE_RETRANSLATE=1 to make new translations generate for all election
packages. Note you will need to run pnpm build:resources && pnpm build in
libs/fixtures after running this to register the new fixtures.
