# VxSuite

The core of the VotingWorks paper-ballot voting system.

## About

Includes software for:

- [VxAdmin](./apps/admin/frontend) — An offline central election manager laptop
- [VxCentralScan](./apps/central-scan/frontend) — A central scanner for batch
  scanning of ballots, often used for absentee ballot processing
- [VxMark](./apps/mark/frontend) — A traditional ballot-marking device (BMD)
- [VxMarkScan](./apps/mark-scan/frontend) — A BMD that also supports
  limited-dexterity casting; VxMark supports limited-dexterity marking but not
  limited-dexterity casting
- [VxScan](./apps/scan/frontend) — A precinct scanner for casting of ballots
  (marked by hand or by BMD)
- [VxPollBook](./apps/pollbook/frontend) — An electronic poll book application
  for checking in voters
- [VxDesign](./apps/design/frontend) — An application for designing ballots

VxAdmin and VxCentralScan comprise the "central system." VxMark/VxMarkScan and
VxScan comprise the "precinct system."

VxPollBook, while also deployed in precincts, is certified and acquired
separately.

VxDesign exists separate from the other apps and is managed by VotingWorks
rather than deployed on hardware into locales.

See https://voting.works for more information about VotingWorks.

## Development

See the [developer documentation](./docs/development.md).

## License

All files are licensed under GNU GPL v3.0 only. Refer to the
[license file](./LICENSE) for more information.
