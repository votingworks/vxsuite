import {
  CardDataTypes,
  CardDataTypesSchema,
  Dictionary,
} from '@votingworks/types';
import { z } from 'zod';
import { DeviceType } from '@votingworks/cdf-types-election-event-logging';
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
// The following log sources are frontends and always expect to log through window.kiosk
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
  timeLogInitiated?: string;
}

export const LogSourceSchema: z.ZodSchema<LogSource> = z.nativeEnum(LogSource);
export const LogEventIdSchema: z.ZodSchema<LogEventId> =
  z.nativeEnum(LogEventId);
export const LogEventTypeSchema: z.ZodSchema<LogEventType> =
  z.nativeEnum(LogEventType);
export const LoggingUserRoleSchema: z.ZodSchema<LoggingUserRole> = z.union([
  CardDataTypesSchema,
  z.literal('vx-staff'),
  z.literal('system'),
  z.literal('unknown'),
]);

export const LogLineSchema: z.ZodSchema<LogLine> = z.object({
  source: LogSourceSchema,
  eventId: LogEventIdSchema,
  eventType: LogEventTypeSchema,
  user: LoggingUserRoleSchema,
  disposition: z.string(),
  message: z.string().optional(),
  timeLogInitiated: z.string().optional(),
  // this key is not required when writing logs but we want to make sure it is present when reading logs
  timeLogWritten: z.string(),
});

export const DEVICE_TYPES_FOR_APP: Dictionary<DeviceType> = {
  [LogSource.VxAdminApp]: DeviceType.Ems,
  [LogSource.VxBatchScanApp]: DeviceType.ScanBatch,
  [LogSource.VxPrecinctScanApp]: DeviceType.ScanSingle,
  [LogSource.VxBallotMarkingDeviceApp]: DeviceType.Bmd,
  [LogSource.VxBallotActivationApp]: DeviceType.BallotActivation,
};
