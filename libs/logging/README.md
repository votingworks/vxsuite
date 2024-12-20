# Logging

VVSG Certification requires that various things are logged throughout the voting
system. A table of all events that must be logged is included in the VVSG 2.0
draft found
[here](https://www.eac.gov/voting-equipment/voluntary-voting-system-guidelines)
under section 15.1-D.

In short, any time a user is taking an action in the voting system, or the
voting system is taking a meaningful action (reading or writing data) there must
be a corresponding log. Any error that occurs must also be logged.

## Data to Log

Applications will create an instance of the `Logger` class in order to control
logging. In our react apps it is best practice to store the `logger` object in
the React app's context for easy accessibility. When the application would like
to log a line it should call `logger.log` with the appropriate arguments. `log`
must be called with a `LogEventId` which should be defined in `log_event_ids.ts`
for each type of event that can be logged, the name of the user role taking the
action being logged, and a dictionary with any other data to include in the log.
You can include arbitrary key/value data pairs through this dictionary in
addition to a `message` key which will define the primary message on the log and
a `disposition` key which will indicate if the log represents a success or
failure. If not specified the disposition will be n/a.

## Defining Log Events

Each log has its own entry in the `LogEventId` enum and corresponding
`LogDetails`. These types are specified in
[`config/log_event_details.toml`](config/log_event_details.toml). Resulting
TypeScript types and Rust enums are found in the generated files
[log_event_ids.ts](src /log_event_ids.ts) and
[log_event_enums.rs](types-rust/src/log_event_enums.rs) respectively.

To add a log event, add a new entry to `log_event_details.toml`. Each entry must
specify `eventId`, `eventType` and `documentationMessage`. If you are logging an
action that takes some time it is best practice to have two `LogEventId`
definitions, one ending the suffix `-init` to log the beginning of the action,
and a second with the suffix `-complete` to mark the end of the action. The
`-complete` log should almost always be logged with either a success or failure
disposition.

You can optionally provide a `defaultMessage` for a log which will be the
message included on the log line if one is not specified in the call to `log`.

## Generating TypeScript and Rust types

After adding your entry to `log_event_details.toml` you'll need to regenerate
the type and enum files:

```
// Generate TypeScript and Rust types
pnpm build:generate-types
// Generate VotingWorksLoggingDocumentation.md
pnpm build:generate-docs
```

## Example

The following example shows how to define logs for, and actually log, an event
to import data. First we define the TOML log entries for an `init` and
`complete` log.

```toml
[ImportDataInit]
eventId = "import-data-init"
eventType = "user-action"
documentationMessage = "A request to import data."
defaultMessage = "Importing data..."

[ImportDataComplete]
eventId = "import-data-complete"
eventType = "user-action"
documentationMessage = "Data has finished being imported to the system. Success or failure is indicated by the disposition."
defaultMessage = "Importing data..."
```

Then after type generation, in the application you can log these events as
follows

```ts
const { logger, currentUserSession } = useContext(AppContext);
assert(currentUserSession.type === 'election_manager'); // Only election managers can import data
await logger.log(LogEventId.ImportDataInit, currentUserSession.type); // There is no disposition, and a default message so no information needs to be passed to log.
try {
  const data = await importData();
  await logger.log(LogEventId.ImportDataComplete, currentUserSession.type, {
    message: 'Import data completed successfully',
    disposition: 'success',
    fileImported: data.name,
  });
} catch (err) {
  await logger.log(LogEventId.ImportDataComplete, currentUserSession.type, {
    message: 'Error importing data.',
    disposition: 'failure',
    errorMessage: err.message,
  });
}
```

```rs
use vx_logging::{
    log, set_app_name,
    Disposition, EventId,
    EventType, Log,
};

// run this once at the start of the application
set_app_name("VxAppName");

fn import_something(file_name: &PathBuf) {
    log!(EventId::ImportDataInit, "starting to import some data from file: {file_name}");

    match do_import(file_name) {
        Ok(_) => log!(
            event_id: EventId::ImportDataComplete,
            event_type: EventType::UserAction,
            disposition: Disposition::Success,
            message: format!("Imported data from file: {file_name}"),
        ),
        Err(e) => log!(
            event_id: EventId::ImportDataComplete,
            event_type: EventType::UserAction,
            disposition: Disposition::Failure,
            message: format!("Error importing data from file: {file_name} ({e})"),
        ),
    }
}
```

## Viewing Logs in Development

You may want to view emitted logs during development. All logs are passed to
[`debug`](https://www.npmjs.com/package/debug) with the namespace `logger`. Logs
emitted by backend services can be viewed by running those services with the
environment variable `DEBUG` set to include `logger`. For example:

```bash
DEBUG=scan:*,logger pnpm start
```

If you want to view logs emitted by a frontend in the devtools console, you can
do so by setting the `debug` value on `localStorage`. For example, in the
console:

```js
localStorage.debug = 'logger';
```

In Chromium-based browsers, you will also have to set log level to "Verbose" or
the logs will not appear. For more information on limitations, allowed
wildcards, and additional options, view the
[`debug` README](https://www.npmjs.com/package/debug?activeTab=readme).

Note: Viewing logger values is a useful tool for debugging, but it is not a
replacement for confirming correct logging in automated tests.
