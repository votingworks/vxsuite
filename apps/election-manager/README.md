# Election Manager

This app is intended to be used on an offline computer by an election admin.

### Features

- manage election configuration
- create hand-marked paper ballots
- export an "election ballot package" for [Mail Ballot Manager](https://github.com/votingworks/mail-ballot-manager)

## Workflow

1. Admin may create a new election or select an existing election configuration file (`election.json`) to start with (or possibly a previously created election ballot package).
2. Admin can edit the election configuration via simple UI forms at any time.
3. Admin can list all ballots by precinct/style.
4. Admin can view an individual ballot, both HTML and PDF versions.
5. Admin can export an election ballot package for [Mail Ballot Manager](https://github.com/votingworks/mail-ballot-manager).

   Election Ballot Package contains:

   - `election.json` - VotingWorks data format for election data: contests, canidates,ballot styles, precincts, etc.
   - approved official ballots in pdf format:
     - one for each combination of ballot style and precinct
     - file name pattern: `election-${electionHash}-ballot-style-${ballotStyle}-precinct-id-${precinctId}.pdf`

## App Screens

- [x] Unconfigured App Screen
  - [x] Select election config file
  - [x] Button to create new election
- [x] Edit Election Config (MVP solution)
  - [x] Form:
    - [x] Textarea
    - [x] Save button
    - [x] Reset button
    - [x] Unconfigure button (with warning modal)
- [x] List Ballot Styles
  - [x] Rows:
    - [x] precinct
    - [x] style
    - [x] contest count
    - [x] view ballot link
  - [x] Sort:
    - [x] precinct
    - [x] style
- [x] View Ballot
  - [ ] html ballot in print-ready format (via PagedJS)
  - [ ] PDF ballot (in iframe under html ballot or click to open in new window)
  - [ ] Previous and Next Ballot Style links

## Navigation

Displayed when election config exists.

- [x] Ballot Styles
- [x] Edit Election Config
- [x] Export Election Ballot Package

## Future Features

- Election Editor with sections to edit, metadata, parties, contests, ballot styles, etc.
  - Edit Contest section
    - List Contests screen
    - Edit Contest Screen with live preview
- "Export config" button on Config screen

## Open Questions

- Do we implement anything to ensure that ballots are not edited after package is created?
  - hash of the election package displayed at creation and when loaded into other components?
  - possibly a manifest of ballot files with hashes?
