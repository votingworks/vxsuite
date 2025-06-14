import {
  Dictionary,
  EventLogging,
  UserRole,
  UserRoleSchema,
} from '@votingworks/types';
import { z } from 'zod/v4';
import {
  AppName,
  LogEventId,
  LogEventType,
  LogSource,
} from './log_event_enums';

export enum LogDispositionStandardTypes {
  Success = 'success',
  Failure = 'failure',
  NotApplicable = 'na',
}

export type LoggingUserRole = UserRole | 'vx-staff' | 'system' | 'unknown';
export type LogDisposition = LogDispositionStandardTypes | string;

export interface LogLine extends Dictionary<string> {
  source: LogSource;
  eventId: LogEventId;
  eventType: LogEventType;
  user: LoggingUserRole;
  disposition: LogDisposition;
  message?: string;
  timeLogInitiated?: string;
}

export const LogSourceSchema: z.ZodSchema<LogSource> = z.enum(LogSource);
export const AppNameSchema: z.ZodSchema<AppName> = z.enum(AppName);
export const LogEventIdSchema: z.ZodSchema<LogEventId> = z.enum(LogEventId);
export const LogEventTypeSchema: z.ZodSchema<LogEventType> =
  z.enum(LogEventType);
export const LoggingUserRoleSchema: z.ZodSchema<LoggingUserRole> = z.union([
  UserRoleSchema,
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

export const DEVICE_TYPES_FOR_APP: Dictionary<EventLogging.DeviceType> = {
  [LogSource.VxAdminFrontend]: EventLogging.DeviceType.Ems,
  [LogSource.VxCentralScanFrontend]: EventLogging.DeviceType.ScanBatch,
  [LogSource.VxScanFrontend]: EventLogging.DeviceType.ScanSingle,
  [LogSource.VxMarkFrontend]: EventLogging.DeviceType.Bmd,
  [LogSource.VxBallotActivationFrontend]:
    EventLogging.DeviceType.BallotActivation,
  [LogSource.VxMarkScanFrontend]: EventLogging.DeviceType.Bmd,
};
