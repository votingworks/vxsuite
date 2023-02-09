# Election Manager (VxAdmin)

This app is intended to be used on an offline computer by system administrators
and election managers.

Note: Election manager can refer to VxAdmin or a user role, depending on the
context.

## Setup

Follow the instructions in the [VxSuite README](../../../README.md) to get set
up, then run the app like so:

```sh
# in apps/admin/frontend
pnpm start
```

The server will be available at http://localhost:3000/.

### Choosing a Converter

If you want to run with a particular converter configuration, start the server
with `REACT_APP_VX_CONVERTER` set to the appropriate value:

- **`ms-sems`** (default): uses `services/converter-ms-sems` to convert
  Mississippi SEMS files to the VotingWorks format. Currently, only BMD and
  VotingWorks-style hand-marked paper ballots are supported with this converter.
- **`nh-accuvote`**: uses `ballot-interpreter-nh` to convert New Hampshire
  AccuVote files to the VotingWorks format. Currently, only BMD and AccuVote
  timing-mark ballots are supported with this converter.

You may set this value in `.env.local` to make the value persistent on your
machine.

### Optional prerequisites

- If you want to program smartcards, start
  [`services/smartcards`](../../../services/smartcards)
- If you will need to convert SEMS files, start
  [`services/converter-ms-sems`](../../../services/converter-ms-sems)

## Testing

```sh
pnpm test
```

## License

GPLv3
