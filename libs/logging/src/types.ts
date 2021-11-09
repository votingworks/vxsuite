import { CardDataTypes, Dictionary } from '@votingworks/types';
import { LogEventId, LogEventType } from '.';

export enum LogDispositionStandardTypes {
  Success = 'success',
  Failure = 'failure',
  NotApplicable = 'na',
}

export type LoggingUserRole = CardDataTypes | 'vx-staff' | 'system' | 'unknown';
export type LogDisposition = LogDispositionStandardTypes | string;
export enum LogSource {
  System = 'system',
  VxAdminApp = 'vx-admin',
  VxAdminServer = 'vx-admin-server',
  VxBatchScanApp = 'vx-batch-scan',
  VxBatchScanSever = 'vx-batch-scan-server',
  VxPrecinctScanApp = 'vx-precinct-scan',
  VxPrecinctScanServer = 'vx-precinct-scan-server',
  VxBallotMarkingDeviceApp = 'vx-ballot-marking-device',
  VxBallotMarkingDeviceServer = 'vx-ballot-marking-device-server',
  VxBallotActivationApp = 'vx-ballot-activation',
  VxBallotActivationServer = 'vx-ballot-activation-server',
  VxScanService = 'vx-scan-service',
}
// The following log sources are client side apps and always expect to log through window.kiosk
// In various tests window.kiosk may not be defined and we don't want to fallback to logging with console.log
// to avoid unnecessary log spew in the test runs.
export const CLIENT_SIDE_LOG_SOURCES = [
  LogSource.VxAdminApp,
  LogSource.VxBatchScanApp,
  LogSource.VxPrecinctScanApp,
  LogSource.VxBallotMarkingDeviceApp,
  LogSource.VxBallotActivationApp,
];

export interface LogLine extends Dictionary<string> {
  source: LogSource;
  eventId: LogEventId;
  eventType: LogEventType;
  user: LoggingUserRole;
  disposition: LogDisposition;
  message?: string;
  time?: string;
}
