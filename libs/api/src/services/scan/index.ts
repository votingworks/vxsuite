import { Result } from '@votingworks/basics';
import {
  AdjudicationStatus,
  AdjudicationStatusSchema,
  BallotPageLayout,
  BallotPageLayoutSchema,
  BallotSheetInfo,
  BallotSheetInfoSchema,
  BatchInfo,
  BatchInfoSchema,
  Contest,
  IdSchema,
} from '@votingworks/types';
import * as z from 'zod';
import {
  ErrorsResponse,
  ErrorsResponseSchema,
  OkResponse,
  OkResponseSchema,
} from '../../base';

export interface ScanStatus {
  canUnconfigure: boolean;
  batches: BatchInfo[];
  adjudication: AdjudicationStatus;
}

export const ScanStatusSchema: z.ZodSchema<ScanStatus> = z.object({
  canUnconfigure: z.boolean(),
  batches: z.array(BatchInfoSchema),
  adjudication: AdjudicationStatusSchema,
});

/**
 * @url /scan/status
 * @method GET
 */
export type GetScanStatusResponse = ScanStatus;

/**
 * @url /scan/status
 * @method GET
 */
export const GetScanStatusResponseSchema: z.ZodSchema<GetScanStatusResponse> =
  ScanStatusSchema;

/**
 * @url /scan/scanBatch
 * @method POST
 */
export type ScanBatchRequest = never;

/**
 * @url /scan/scanBatch
 * @method POST
 */
export const ScanBatchRequestSchema: z.ZodSchema<ScanBatchRequest> = z.never();

/**
 * @url /scan/scanBatch
 * @method POST
 */
export type ScanBatchResponse =
  | OkResponse<{ batchId: string }>
  | ErrorsResponse;

/**
 * @url /scan/scanBatch
 * @method POST
 */
export const ScanBatchResponseSchema: z.ZodSchema<ScanBatchResponse> = z.union([
  z.object({
    status: z.literal('ok'),
    batchId: z.string(),
  }),
  ErrorsResponseSchema,
]);

/**
 * @url /scan/scanContinue
 * @method POST
 */
export interface ScanContinueRequest {
  forceAccept: boolean;
}

/**
 * @url /scan/scanContinue
 * @method POST
 */
export const ScanContinueRequestSchema: z.ZodSchema<ScanContinueRequest> =
  z.object({
    forceAccept: z.boolean(),
  });

/**
 * @url /scan/scanContinue
 * @method POST
 */
export type ScanContinueResponse = OkResponse | ErrorsResponse;

/**
 * @url /scan/scanContinue
 * @method POST
 */
export const ScanContinueResponseSchema: z.ZodSchema<ScanContinueResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

/**
 * @url /scan/export-to-usb-drive
 * @method POST
 */
export type ExportToUsbDriveRequest = never;

/**
 * @url /scan/export-to-usb-drive
 * @method POST
 */
export const ExportToUsbDriveRequestSchema: z.ZodSchema<ExportToUsbDriveRequest> =
  z.never();

/**
 * @url /scan/export-to-usb-drive
 * @method POST
 */
export type ExportToUsbDriveResponse = OkResponse | ErrorsResponse;

/**
 * @url /scan/export-to-usb-drive
 * @method POST
 */
export const ExportToUsbDriveResponseSchema: z.ZodSchema<ExportToUsbDriveResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

/**
 * Possible errors when exporting a file.
 */
export type ExportFileError =
  | { type: 'relative-file-path'; message: string }
  | { type: 'permission-denied'; message: string }
  | { type: 'file-system-error'; message: string }
  | { type: 'missing-usb-drive'; message: string };

/**
 * Schema for {@link ExportFileError}.
 */
export const ExportFileErrorSchema: z.ZodSchema<ExportFileError> =
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('relative-file-path'),
      message: z.string(),
    }),
    z.object({
      type: z.literal('permission-denied'),
      message: z.string(),
    }),
    z.object({
      type: z.literal('file-system-error'),
      message: z.string(),
    }),
    z.object({
      type: z.literal('missing-usb-drive'),
      message: z.string(),
    }),
  ]);

/**
 * Possible errors when backing up the scan service.
 */
export type BackupError =
  | ExportFileError
  | { type: 'no-election'; message: string };

export const BackupErrorSchema: z.ZodSchema<BackupError> = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('relative-file-path'),
      message: z.string(),
    }),
    z.object({
      type: z.literal('permission-denied'),
      message: z.string(),
    }),
    z.object({
      type: z.literal('file-system-error'),
      message: z.string(),
    }),
    z.object({
      type: z.literal('missing-usb-drive'),
      message: z.string(),
    }),
    z.object({
      type: z.literal('no-election'),
      message: z.string(),
    }),
  ]
);

/**
 * Result of backing up the scan service: either a list of files that were
 * written to a USB drive, or an error.
 */
export type BackupResult = Result<string[], BackupError>;

/**
 * @url /scan/backup-to-usb
 * @method POST
 */
export type BackupToUsbRequest = never;

/**
 * @url /scan/backup-to-usb
 * @method POST
 */
export const BackupToUsbRequestSchema: z.ZodSchema<BackupToUsbRequest> =
  z.never();

/**
 * @url /scan/backup-to-usb
 * @method POST
 */
export type BackupToUsbResponse =
  | OkResponse<{ readonly paths: string[] }>
  | { status: 'error'; errors: BackupError[] };

/**
 * @url /scan/backup-to-usb
 * @method POST
 */
export const BackupToUsbResponseSchema: z.ZodSchema<BackupToUsbResponse> =
  z.union([
    z.object({
      status: z.literal('ok'),
      paths: z.array(z.string()),
    }),
    z.object({
      status: z.literal('error'),
      errors: z.array(BackupErrorSchema),
    }),
  ]);

/**
 * @url /scan/hmpb/review/next-sheet
 * @method GET
 */
export interface GetNextReviewSheetResponse {
  interpreted: BallotSheetInfo;
  layouts: {
    front?: BallotPageLayout;
    back?: BallotPageLayout;
  };
  definitions: {
    front?: {
      contestIds: ReadonlyArray<Contest['id']>;
    };
    back?: {
      contestIds: ReadonlyArray<Contest['id']>;
    };
  };
}

/**
 * @url /scan/hmpb/review/next-sheet
 * @method GET
 */
export const GetNextReviewSheetResponseSchema: z.ZodSchema<GetNextReviewSheetResponse> =
  z.object({
    interpreted: BallotSheetInfoSchema,
    layouts: z.object({
      front: BallotPageLayoutSchema.optional(),
      back: BallotPageLayoutSchema.optional(),
    }),
    definitions: z.object({
      front: z.object({ contestIds: z.array(IdSchema) }).optional(),
      back: z.object({ contestIds: z.array(IdSchema) }).optional(),
    }),
  });
