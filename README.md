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
     - file name pattern: `election-${electionId}-precinct-${dashify(precinctName)}-id-${precinctId}-style-${ballotStyleId}.pdf`

## App Screens

- [x] Unconfigured App Screen
  - [x] Select election config file
  - [x] Convert from local election files
  - [x] Button to create new election
- [ ] Edit Election Definition
  - [ ] basic fields
  - [ ] parties (starting with some defaults)
  - [ ] districts
  - [ ] precincts
  - [ ] ballot styles and mappings to precincts and districts
  - [ ] contests
    - [ ] select district
    - [ ] candidate contest
    - [ ] measure contest
- [x] List Ballot Styles
  - [x] Rows:
    - [x] precinct
    - [x] style
    - [x] contest count
    - [x] view ballot link
  - [x] Sort:
    - [x] precinct
    - [x] style
  - [x] Export Election Ballot Package for Mail Ballot Manager
  - [x] View Ballot
    - [x] html ballot in print-ready format (via PagedJS)
    - [ ] PDF ballot (in iframe under html ballot or click to open in new window)
    - [ ] Previous and Next Ballot Style links
    - [x] Proof all Ballot Style content (from EMS)
  - [x] Export Election Ballot Package screen
    - [x] Mock export UI
    - [ ] Hook up to API in kiosk browser
- [x] Print Test Ballot Deck Results (from EMS)
- [ ] Program Cards (from EMS)
  - [ ] Admin
  - [ ] Poll Worker
- [ ] Results
  - [ ] Load CVR files (from EMS)
  - [ ] View results (from EMS)
- [x] Unconfigure
- [ ] Eject USB (from EMS)

## Navigation

Main Nav:

- [x] Definition
- [x] Ballots
- [x] Test Deck Results
- [ ] Results
- [ ] Cards

User Nav

- [ ] Eject USB
- [ ] Unconfigure

## Future Features

- Election Editor with sections to edit, metadata, parties, contests, ballot styles, etc.
  - Edit Contest section
    - List Contests screen
    - Edit Contest Screen with live preview
- "Export config" button on Config screen
