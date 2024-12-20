// istanbul ignore file - difficult to test in a jest environment, since jest
// intercepts unhandled exceptions.
// Could potentially set up a custom test environment, if we need the coverage
// for this: https://github.com/jestjs/jest/issues/10364#issuecomment-669047725

import { BaseLogger, LogEventId } from '@votingworks/logging';

/** Sets up handlers for unhandled exceptions. */
export function handleUncaughtExceptions(logger: BaseLogger): void {
  async function handleException(
    error: Error,
    origin: NodeJS.UncaughtExceptionOrigin
  ) {
    await logger.log(LogEventId.UnknownError, 'system', {
      message: `Server shutting down due to ${origin}: ${error.message}`,
      stack: error.stack,
      disposition: 'failure',
    });

    // To avoid proceeding in a potentially corrupted state, we shut down the
    // server, which will trigger the frontend error boundary that prompts for
    // a machine restart.
    process.exit(1);
  }

  // This will also catch `unhandledRejection`s, based on the default value of
  // the `--unhandled-rejections` node flag being set to `throw`.
  // See https://nodejs.org/docs/v16.9.1/api/cli.html#cli_unhandled_rejections_mode
  process.on('uncaughtException', handleException);
}
