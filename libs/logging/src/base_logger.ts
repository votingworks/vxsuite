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
 * The maximum number of repeated log lines before we emit a log line with repeat details, even if
 * a repeat sequence hasn't ended yet.
 */
const MAX_REPEAT_COUNT_BEFORE_REPEAT_LOG_EMIT = 100;

/**
 * The maximum number of seconds between the first and last repeat of a log line before we emit a
 * log line with repeat details, even if a repeat sequence hasn't ended yet.
 */
const MAX_SECONDS_BETWEEN_FIRST_AND_LAST_REPEAT_BEFORE_REPEAT_LOG_EMIT = 60;

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
   * stats on the currently tracked log line.
   */
  track(incomingLogLine: LogLine): {
    /**
     * Whether the incoming log line is a repeat of the currently tracked log line.
     */
    isRepeat: boolean;
    /**
     * The repeat count of the currently tracked log line, including the incoming log line.
     */
    repeatCount: number;
    /**
     * The time between the first and last repeat of the currently tracked log line.
     */
    secondsBetweenFirstAndLastRepeat?: number;
  } {
    const isRepeat =
      // Perform cheap checks before kicking off the more expensive deep equality check
      incomingLogLine.eventId === this.trackedLogLine?.eventId &&
      incomingLogLine.message === this.trackedLogLine?.message &&
      deepEqual(incomingLogLine, this.trackedLogLine);
    if (isRepeat) {
      this.recordRepeat();
    }
    return {
      isRepeat,
      repeatCount: this.repeatCount,
      secondsBetweenFirstAndLastRepeat: !this.firstRepeatAt
        ? undefined
        : (assertDefined(this.lastRepeatAt).getTime() -
            this.firstRepeatAt.getTime()) /
          1000,
    };
  }

  /**
   * Emits a log line with repeat details about the currently tracked log line if applicable and
   * restarts tracking using the provided log line as the new log line to track.
   */
  flushAndRestartTracking(
    log: (logLine: LogLine) => void,
    logLineToTrack: LogLine
  ): void {
    if (this.repeatCount > 0) {
      log(this.prepareLogLineWithRepeatDetails());
    }
    this.trackedLogLine = logLineToTrack;
    this.repeatCount = 0;
    this.firstRepeatAt = undefined;
    this.lastRepeatAt = undefined;
  }

  private recordRepeat(): number {
    this.repeatCount += 1;
    if (this.repeatCount === 1) {
      this.firstRepeatAt = new Date();
    }
    this.lastRepeatAt = new Date();
    return this.repeatCount;
  }

  private prepareLogLineWithRepeatDetails(): LogLine {
    assert(this.trackedLogLine && this.repeatCount > 0);
    return {
      ...this.trackedLogLine,
      repeatCount: this.repeatCount.toString(),
      firstRepeatAt: assertDefined(this.firstRepeatAt).toISOString(),
      lastRepeatAt: assertDefined(this.lastRepeatAt).toISOString(),
    };
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
    const logLine = this.prepareLogLine(eventId, user, logData);

    const { isRepeat, repeatCount, secondsBetweenFirstAndLastRepeat } =
      this.repeatLogTracker.track(logLine);
    if (!isRepeat) {
      // If a repeat sequence has ended, emit a log line with repeat details
      this.repeatLogTracker.flushAndRestartTracking(
        (l) => this.logInternal(l, outerDebug),
        logLine
      );
      // Log the incoming, non-repeated log line
      this.logInternal(logLine, outerDebug);
    } else if (
      // If a repeat sequence is continuing, check other heuristics to determine whether we should
      // emit a log line with repeat details thus far
      repeatCount >= MAX_REPEAT_COUNT_BEFORE_REPEAT_LOG_EMIT ||
      (secondsBetweenFirstAndLastRepeat ?? 0) >=
        MAX_SECONDS_BETWEEN_FIRST_AND_LAST_REPEAT_BEFORE_REPEAT_LOG_EMIT
    ) {
      this.repeatLogTracker.flushAndRestartTracking(
        (l) => this.logInternal(l, outerDebug),
        logLine
      );
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
