/* eslint-disable max-classes-per-file */
import { Dictionary } from '@votingworks/types';
import makeDebug from 'debug';
import { assert, assertDefined, deepEqual } from '@votingworks/basics';
import { LogEventId, LogSource, getDetailsForEventId } from './log_event_enums';
import {
  LogDisposition,
  LogDispositionStandardTypes,
  LogLine,
  LoggingUserRole,
} from './types';

export const LOGS_ROOT_LOCATION = '/var/log';
export const LOG_NAME = 'vx-logs';
export const FULL_LOG_PATH = `${LOGS_ROOT_LOCATION}/${LOG_NAME}.log`;

// The following log sources are frontends and always expect to log through window.kiosk
// In various tests window.kiosk may not be defined and we don't want to fallback to logging with console.log
// to avoid unnecessary log spew in the test runs.
export const CLIENT_SIDE_LOG_SOURCES = [
  LogSource.VxAdminFrontend,
  LogSource.VxCentralScanFrontend,
  LogSource.VxScanFrontend,
  LogSource.VxBallotActivationFrontend,
  LogSource.VxMarkFrontend,
  LogSource.VxMarkScanFrontend,
  LogSource.VxPollBookFrontend,
];

/**
 * The maximum number of repeated log lines before we emit a repeat summary log line, even if a
 * repeat sequence hasn't ended yet.
 */
const MAX_REPEAT_COUNT_BEFORE_REPEAT_SUMMARY_LOG_EMIT = 100;

/**
 * The maximum number of seconds between the first and last repeat of a log line before we emit a
 * repeat summary log line, even if a repeat sequence hasn't ended yet.
 */
const MAX_SECONDS_BETWEEN_FIRST_AND_LAST_REPEAT_BEFORE_REPEAT_SUMMARY_LOG_EMIT = 60;

const debug = makeDebug('logger');

export interface LogData extends Dictionary<string | boolean | number> {
  message?: string;
  disposition?: LogDisposition;
}

/**
 * A utility class for tracking and coalescing repeated log lines to reduce log spam while still
 * maintaining fidelity.
 */
class RepeatLogTracker {
  private trackedLogLine?: LogLine;
  private repeatCount: number = 0;
  private firstRepeatAt?: Date;
  private lastRepeatAt?: Date;

  /**
   * Checks whether the incoming log line is a repeat of the currently tracked log line and returns
   * log lines after repeat handling. Log lines after repeat handling could mean any of the
   * following:
   * - The incoming log line unchanged
   * - No log lines (if the incoming log line is a repeat and no repeat summary log line is due)
   * - A repeat summary log line
   * - Both a repeat summary log line and the incoming log line
   */
  track(incomingLogLine: LogLine): LogLine[] {
    const isIncomingLogLineRepeat =
      // Perform cheap checks before kicking off the more expensive deep equality check
      incomingLogLine.eventId === this.trackedLogLine?.eventId &&
      incomingLogLine.message === this.trackedLogLine?.message &&
      deepEqual(incomingLogLine, this.trackedLogLine);

    if (isIncomingLogLineRepeat) {
      this.recordRepeat();
    }

    const repeatSequenceHasEnded =
      !isIncomingLogLineRepeat && this.repeatCount > 0;
    const repeatSequenceHasHitThreshold =
      this.repeatCount >= MAX_REPEAT_COUNT_BEFORE_REPEAT_SUMMARY_LOG_EMIT ||
      this.secondsBetweenFirstAndLastRepeat() >=
        MAX_SECONDS_BETWEEN_FIRST_AND_LAST_REPEAT_BEFORE_REPEAT_SUMMARY_LOG_EMIT;
    const shouldEmitRepeatSummaryLogLine =
      repeatSequenceHasEnded || repeatSequenceHasHitThreshold;

    const logLinesAfterRepeatHandling: LogLine[] = [];
    if (shouldEmitRepeatSummaryLogLine) {
      logLinesAfterRepeatHandling.push(this.repeatSummaryLogLine());
    }
    if (!isIncomingLogLineRepeat) {
      logLinesAfterRepeatHandling.push(incomingLogLine);
    }

    if (shouldEmitRepeatSummaryLogLine || !isIncomingLogLineRepeat) {
      this.restartTracking(incomingLogLine);
    }

    return logLinesAfterRepeatHandling;
  }

  private recordRepeat() {
    this.repeatCount += 1;
    const now = new Date();
    if (this.repeatCount === 1) {
      this.firstRepeatAt = now;
    }
    this.lastRepeatAt = now;
  }

  private secondsBetweenFirstAndLastRepeat(): number {
    if (this.repeatCount === 0) {
      return 0;
    }
    return (
      (assertDefined(this.lastRepeatAt).getTime() -
        assertDefined(this.firstRepeatAt).getTime()) /
      1000
    );
  }

  private repeatSummaryLogLine(): LogLine {
    assert(this.repeatCount > 0);
    return {
      ...assertDefined(this.trackedLogLine),
      repeatCount: this.repeatCount.toString(),
      firstRepeatAt: assertDefined(this.firstRepeatAt).toISOString(),
      lastRepeatAt: assertDefined(this.lastRepeatAt).toISOString(),
    };
  }

  private restartTracking(logLineToTrack: LogLine) {
    this.trackedLogLine = logLineToTrack;
    this.repeatCount = 0;
    this.firstRepeatAt = undefined;
    this.lastRepeatAt = undefined;
  }
}

export class BaseLogger {
  private readonly repeatLogTracker: RepeatLogTracker;

  constructor(
    private readonly source: LogSource,
    private readonly kiosk?: KioskBrowser.Kiosk
  ) {
    this.repeatLogTracker = new RepeatLogTracker();
  }

  getSource(): LogSource {
    return this.source;
  }

  log(
    eventId: LogEventId,
    user: LoggingUserRole,
    logData?: LogData,
    outerDebug?: (logLine: LogLine) => void
  ): void {
    const incomingLogLine = this.prepareLogLine(eventId, user, logData);
    const logLinesAfterRepeatHandling =
      this.repeatLogTracker.track(incomingLogLine);
    for (const logLine of logLinesAfterRepeatHandling) {
      this.logInternal(logLine, outerDebug);
    }
  }

  private prepareLogLine(
    eventId: LogEventId,
    user: LoggingUserRole,
    logData?: LogData
  ): LogLine {
    const eventSpecificDetails = getDetailsForEventId(eventId);
    const {
      message = eventSpecificDetails.defaultMessage,
      disposition = LogDispositionStandardTypes.NotApplicable,
      ...additionalData
    } = logData ?? {};
    const logLine: LogLine = {
      source: this.source,
      eventId,
      eventType: eventSpecificDetails.eventType,
      user,
      message,
      disposition,
      ...additionalData,
    };
    return logLine;
  }

  private logInternal(
    logLine: LogLine,
    outerDebug?: (logLine: LogLine) => void
  ): void {
    // If the caller is passing in a debug instance, and we are not in production log to the debugger rather than through the normal logging pipeline.
    // This is to make logs more manageable in development, so a developer can toggle what logs to view with the normal debug namespaces.
    /* istanbul ignore next - figure out how to test this @preserve */
    if (outerDebug && process.env.NODE_ENV !== 'production') {
      outerDebug(logLine);
      return;
    }

    if (CLIENT_SIDE_LOG_SOURCES.includes(this.source)) {
      debug(logLine); // for internal debugging use log to the console
      if (this.kiosk) {
        void this.kiosk.log(
          JSON.stringify({
            timeLogInitiated: Date.now().toString(),
            ...logLine,
          })
        );
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(logLine));
    }
  }
}
