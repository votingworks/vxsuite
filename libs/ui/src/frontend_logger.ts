import {
  BaseLogger,
  LogData,
  LogEventId,
  LoggingUserRole,
  LogSource,
} from '@votingworks/logging';

export class FrontendLogger extends BaseLogger {
  constructor() {
    // log source does not matter because the frontend logger is just passing
    // logs to the backend
    super(LogSource.System);
  }

  async log(
    eventId: LogEventId,
    user: LoggingUserRole,
    logData: LogData = {}
  ): Promise<void> {
    const logEvent = JSON.stringify({ eventId, user, ...logData });
    try {
      await fetch('/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: logEvent,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log('Error logging via frontend server failed. Log:', logEvent);
    }
  }
}
