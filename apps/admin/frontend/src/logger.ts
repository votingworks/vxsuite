import { extractErrorMessage } from '@votingworks/basics';
import type { UnexpectedErrorContext } from '@votingworks/election-definition-ui';
import { BaseLogger, LogEventId, LogSource } from '@votingworks/logging';

export const logger = new BaseLogger(LogSource.VxAdminFrontend, window.kiosk);

export function reportUnexpectedError(
  error: unknown,
  { action }: UnexpectedErrorContext
): void {
  void logger.log(LogEventId.UnknownError, 'system', {
    message: `Unexpected error during ${action}: ${extractErrorMessage(error)}`,
    stack: error instanceof Error ? error.stack : undefined,
    disposition: 'failure',
  });
}
