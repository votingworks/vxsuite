import {
  BaseLogger,
  LogData,
  LogEventId,
  LoggingUserRole,
  LogSource,
} from '@votingworks/logging';

export class FrontendLogger extends BaseLogger {
  constructor() {
    super(LogSource.System);
  }

  async log(
    eventId: LogEventId,
    user: LoggingUserRole,
    logData: LogData = {}
  ): Promise<void> {
    try {
      await fetch('/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, user, ...logData }),
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log('Error logging via frontend server failed. Error:', error);
    }
  }
}
