# Auth

This library includes code for smart card authentication, to be used by app
backends.

## Error Handling

We've landed on the following model for error handling.

For methods that transition auth status, e.g. `checkPin`, `logOut`,
`startCardlessVoterSession`, `endCardlessVoterSession`:

- Use `assert` / throw errors for states incompatible with the static config
  (`this.config`)
- For other incompatible states (e.g. trying to check PIN when you're not in the
  PIN-checking state or trying to start a cardless voter session when you're not
  logged in as a poll worker), just ignore the request and leave the auth status
  unchanged

For card reading and writing methods, e.g. `programCard`, `unprogramCard`,
`readCardData`, `writeCardData`:

- Use `assert` / throw errors for states incompatible with the static config
  (`this.config`)
- Otherwise, return an error `Result` instead of throwing
- Methods that can perform access checks themselves should (e.g. `programCard`
  should check if you're logged in as a system administrator and return an error
  `Result` if need be). Methods that can't perform access checks themselves
  because the checks are dependent on the context in which they're used (e.g.
  `readCardData`) should leave those checks to backend consumers. Those backend
  consumers should also return an error `Result` instead of throwing.

The motivation for not throwing errors and so often returning an error `Result`,
which we typically reserve for expected errors / user errors, is that all these
methods depend not only on code but the status of the card in the card reader.
Someone could trigger an action in a valid state but then remove their card
right after, switching to an invalid state. We wouldn't want this to trigger the
frontend error boundary, which throwing errors on the backend typically does.
