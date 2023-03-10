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

## Scripts

Note that all scripts are meant to be run from `libs/auth/` and not
`libs/auth/scripts/`.

### Initial Java Card Configuration Script

This script configures a Java Card for use with VotingWorks machines. The script
will be run at the Bakery for production cards and can be run locally for local
development.

```
# Install script dependencies
make install-script-dependencies

# With the relevant env vars set, a card reader connected, and a Java Card in the card reader, run:
./scripts/configure-java-card
```

For local development, you can use the following command, which sets the
relevant env vars for local development and then calls the base script:

```
./scripts/configure-dev-java-card
```

This command needs to be run on all Java Cards before they can be used in any
local development capacity, including before they can be programmed through
VxAdmin. This same command can be used to unprogram a card. This can come in
handy if you ever need to unprogram a system administrator card, the one type of
card that can't be unprogrammed through VxAdmin.

### Dev System Administrator Java Card Programming Script

This script programs a dev system administrator Java Card to bootstrap local
development with real smart cards. Once you have your first system administrator
card, you can program all other cards, including additional system administrator
cards, through VxAdmin.

```
./scripts/program_dev_system_administrator_java_card
```

The initial Java Card configuration script needs to be run before this script
can be run. This script will remind you if you haven't done so.

### Common Java Card Script Gotchas

This library's card reader code only allows one process to access the card
reader at a time, so make sure you quit any locally running backends before you
try to run the above scripts. Even if you don't think any backends are running,
you might have to `ps aux | grep node` for lingering Node processes.

### Dev Keys and Certs Generation Script

This script generates the dev keys and certs located in `./certs/dev/`. We
shouldn't have to update the current dev certs until they expire in 2123 ⏳😝,
so this script is mostly just a way to document how the certs were created.

```
./scripts/generate_dev_keys_and_certs
```
