import {
  CardDataTypes,
  CardDataTypesSchema,
  Dictionary,
} from '@votingworks/types';
import { z } from 'zod';
import { DeviceType } from '@votingworks/cdf-types-election-event-logging';
import { LogEventId, LogEventType } from '.';
import { LogSource } from './log_source';

export enum LogDispositionStandardTypes {
  Success = 'success',
  Failure = 'failure',
  NotApplicable = 'na',
}

export type LoggingUserRole = CardDataTypes | 'vx-staff' | 'system' | 'unknown';
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
  [LogSource.VxAdminFrontend]: DeviceType.Ems,
  [LogSource.VxBatchScanFrontend]: DeviceType.ScanBatch,
  [LogSource.VxPrecinctScanFrontend]: DeviceType.ScanSingle,
  [LogSource.VxBallotMarkingDeviceFrontend]: DeviceType.Bmd,
  [LogSource.VxBallotActivationFrontend]: DeviceType.BallotActivation,
};
