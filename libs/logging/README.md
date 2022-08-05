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

Look at the example `LogEventId` declarations to understand how to declare a new
event ID. You must specify a `LogEventType` and `documentationMessage` string
for all event IDs. If you are logging an action that takes some time it is best
practice to have two `LogEventId` definitions, one ending the suffix `-init` to
log the beginning of the action, and a second with the suffix `-complete` to
mark the end of the action. The `-complete` log should almost always be logged
with either a success or failure disposition.

You can optionally provide a `defaultMessage` for a `LogEventId` which will be
the message included on the log line if one is not specified in the call to
`log`.

## Example

The following example shows how to define logs for, and actually log, an event
to import data. First we define the `LogEventId` entries for an `init` and
`complete` log.

```ts
const ImportDataInit: LogDetails = {
  eventId: LogEventId.ImportDataInit,
  eventType: LogEventType.UserAction,
  documentationMessage: 'A request to import data.',
  defaultMessage: 'Importing data...',
};
const ImportDataComplete: LogDetails = {
  eventId: LogEventId.ImportDataComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Data has finished being imported to the system. Success or failure is indicated by the disposition.',
};
```

Then in the application you can log these events as followed

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
