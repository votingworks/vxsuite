import {
  UserRole,
  UserRoleSchema,
  UserRoleSchemaZ4,
  Dictionary,
  EventLogging,
} from '@votingworks/types';
// import { z } from 'zod';
import { z } from 'zod';
import { z as z4 } from 'zod4';
import { LogEventId } from './log_event_ids';
import { AppName, LogSource } from './base_types/log_source';
import { LogEventType } from './base_types/log_event_types';

export enum LogDispositionStandardTypes {
  Success = 'success',
  Failure = 'failure',
  NotApplicable = 'na',
}

export type LoggingUserRole = UserRole | 'vx-staff' | 'system' | 'unknown';
export type LogDisposition = LogDispositionStandardTypes | string;

export interface LogLineKnownFields {
  source: LogSource;
  eventId: LogEventId;
  eventType: LogEventType;
  user: LoggingUserRole;
  disposition: LogDisposition;
  message?: string;
  timeLogInitiated?: string;
}

export interface LogLine extends Dictionary<string>, LogLineKnownFields {}

export const LogSourceSchema: z.ZodSchema<LogSource> = z.nativeEnum(LogSource);
export const AppNameSchema: z.ZodSchema<AppName> = z.nativeEnum(AppName);
export const LogEventIdSchema: z.ZodSchema<LogEventId> =
  z.nativeEnum(LogEventId);
export const LogEventTypeSchema: z.ZodSchema<LogEventType> =
  z.nativeEnum(LogEventType);
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

export const LogSourceSchemaZ4: z4.ZodSchema<LogSource> =
  z4.nativeEnum(LogSource);
export const AppNameSchemaZ4: z4.ZodSchema<AppName> = z4.nativeEnum(AppName);
export const LogEventIdSchemaZ4: z4.ZodSchema<LogEventId> =
  z4.nativeEnum(LogEventId);
export const LogEventTypeSchemaZ4: z4.ZodSchema<LogEventType> =
  z4.nativeEnum(LogEventType);
export const LoggingUserRoleSchemaZ4: z4.ZodSchema<LoggingUserRole> = z4.union([
  UserRoleSchemaZ4,
  z4.literal('vx-staff'),
  z4.literal('system'),
  z4.literal('unknown'),
]);

export const LogLineSchemaZ4: z4.ZodSchema<LogLine> = z4.object({
  source: LogSourceSchemaZ4,
  eventId: LogEventIdSchemaZ4,
  eventType: LogEventTypeSchemaZ4,
  user: LoggingUserRoleSchemaZ4,
  disposition: z4.string(),
  message: z4.string().optional(),
  timeLogInitiated: z4.string().optional(),
  // this key is not required when writing logs but we want to make sure it is present when reading logs
  timeLogWritten: z4.string(),
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
