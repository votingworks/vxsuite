import * as z from 'zod';
import {
  ErrorsResponse,
  ErrorsResponseSchema,
  Iso8601Timestamp,
  Iso8601TimestampSchema,
  OkResponse,
  OkResponseSchema,
} from '../..';
import {
  BallotSheetInfo,
  BallotSheetInfoSchema,
  Contest,
  ElectionDefinition,
  ElectionDefinitionSchema,
  MarkThresholds,
  MarkThresholdsSchema,
  PrecinctId,
  PrecinctIdSchema,
} from '../../../election';
import { HexString, IdSchema } from '../../../generic';
import {
  MarkAdjudications,
  MarkAdjudicationsSchema,
  SerializableBallotPageLayout,
  SerializableBallotPageLayoutSchema,
} from '../../../hmpb';

export type Side = 'front' | 'back';
export const SideSchema = z.union([z.literal('front'), z.literal('back')]);

export interface AdjudicationStatus {
  adjudicated: number;
  remaining: number;
}

export const AdjudicationStatusSchema: z.ZodSchema<AdjudicationStatus> = z.object(
  {
    adjudicated: z.number(),
    remaining: z.number(),
  }
);

export type BatchId = string;
export const BatchIdSchema: z.ZodSchema<BatchId> = IdSchema;

export interface BatchInfo {
  id: BatchId;
  label: string;
  startedAt: Iso8601Timestamp;
  endedAt?: Iso8601Timestamp;
  error?: string;
  count: number;
}

export const BatchInfoSchema: z.ZodSchema<BatchInfo> = z.object({
  id: BatchIdSchema,
  label: z.string(),
  startedAt: Iso8601TimestampSchema,
  endedAt: z.optional(Iso8601TimestampSchema),
  error: z.optional(z.string()),
  count: z.number().nonnegative(),
});

export enum ScannerStatus {
  WaitingForPaper = 'WaitingForPaper',
  ReadyToScan = 'ReadyToScan',
  Scanning = 'Scanning',
  Accepting = 'Accepting',
  Rejecting = 'Rejecting',
  ReadyToAccept = 'ReadyToAccept',
  Rejected = 'Rejected',
  Calibrating = 'Calibrating',
  Error = 'Error',
  Unknown = 'Unknown',
}

export const ScannerStatusSchema = z.nativeEnum(ScannerStatus);

export interface ScanStatus {
  electionHash?: string;
  batches: BatchInfo[];
  adjudication: AdjudicationStatus;
  scanner: ScannerStatus;
}

export const ScanStatusSchema: z.ZodSchema<ScanStatus> = z.object({
  electionHash: z.optional(HexString),
  batches: z.array(BatchInfoSchema),
  adjudication: AdjudicationStatusSchema,
  scanner: ScannerStatusSchema,
});

export interface ElectionRecord {
  readonly id: string;
  readonly definition: ElectionDefinition;
  readonly testMode: boolean;
  readonly markThresholdOverrides?: MarkThresholds;
  readonly currentPrecinctId?: PrecinctId;
  readonly createdAt: Iso8601Timestamp;
}

export const ElectionRecordSchema: z.ZodSchema<ElectionRecord> = z.object({
  id: IdSchema,
  definition: ElectionDefinitionSchema,
  testMode: z.boolean(),
  markThresholdOverrides: z.optional(MarkThresholdsSchema),
  currentPrecinctId: z.optional(PrecinctIdSchema),
  createdAt: Iso8601TimestampSchema,
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
export const GetScanStatusResponseSchema: z.ZodSchema<GetScanStatusResponse> = ScanStatusSchema;

/**
 * @url /config
 * @method GET
 */
export type GetConfigResponse = ElectionRecord;

/**
 * @url /config
 * @method GET
 */
export const GetConfigResponseSchema: z.ZodSchema<GetConfigResponse> = ElectionRecordSchema;

/**
 * @url /config
 * @method GET
 */
export type GetConfigRequest = never;

/**
 * @url /config
 * @method GET
 */
export const GetConfigRequestSchema: z.ZodSchema<GetConfigRequest> = z.never();

/**
 * @url /config/election
 * @method PUT
 */
export type PutElectionConfigResponse = OkResponse | ErrorsResponse;

/**
 * @url /config/election
 * @method PUT
 */
export const PutElectionConfigResponseSchema: z.ZodSchema<PutElectionConfigResponse> = z.union(
  [OkResponseSchema, ErrorsResponseSchema]
);

/**
 * @url /config/election
 * @method PUT
 */
export type PutElectionConfigRequest = Uint8Array; // should be Buffer, but this triggers type errors

/**
 * @url /config/election
 * @method PUT
 */
export const PutElectionConfigRequestSchema: z.ZodSchema<PutElectionConfigRequest> = z.instanceof(
  // should be Buffer, but this triggers type errors
  Uint8Array
);

/**
 * @url /config/election
 * @method DELETE
 */
export type DeleteElectionConfigResponse = OkResponse;

/**
 * @url /config/election
 * @method DELETE
 */
export const DeleteElectionConfigResponseSchema: z.ZodSchema<DeleteElectionConfigResponse> = OkResponseSchema;

/**
 * @url /config/package
 * @method PUT
 */
export type PutConfigPackageRequest = never;

/**
 * @url /config/package
 * @method PUT
 */
export const PutConfigPackageRequestSchema: z.ZodSchema<PutConfigPackageRequest> = z.never();

/**
 * @url /config/package
 * @method PUT
 */
export type PutConfigPackageResponse = OkResponse | ErrorsResponse;

/**
 * @url /config/package
 * @method PUT
 */
export const PutConfigPackageResponseSchema: z.ZodSchema<PutConfigPackageResponse> = z.union(
  [OkResponseSchema, ErrorsResponseSchema]
);

/**
 * @url /scan/batch/{batchId}
 * @method DELETE
 */
export type DeleteScanBatchResponse = OkResponse | ErrorsResponse;

/**
 * @url /scan/batch/{batchId}
 * @method DELETE
 */
export const DeleteScanBatchResponseSchema: z.ZodSchema<DeleteScanBatchResponse> = z.union(
  [OkResponseSchema, ErrorsResponseSchema]
);

/**
 * @url /scan/batch
 * @method POST
 */
export type ScanBatchRequest = never;

/**
 * @url /scan/batch
 * @method POST
 */
export const ScanBatchRequestSchema: z.ZodSchema<ScanBatchRequest> = z.never();

/**
 * @url /scan/batch
 * @method POST
 */
export type ScanBatchResponse =
  | OkResponse<{ batchId: string }>
  | ErrorsResponse;

/**
 * @url /scan/batch
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
export type ScanContinueRequest =
  | { forceAccept: false }
  | {
      forceAccept: true;
      frontMarkAdjudications: MarkAdjudications;
      backMarkAdjudications: MarkAdjudications;
    };

/**
 * @url /scan/scanContinue
 * @method POST
 */
export const ScanContinueRequestSchema: z.ZodSchema<ScanContinueRequest> = z.union(
  [
    z.object({ forceAccept: z.literal(false) }),
    z.object({
      forceAccept: z.literal(true),
      frontMarkAdjudications: MarkAdjudicationsSchema,
      backMarkAdjudications: MarkAdjudicationsSchema,
    }),
  ]
);

/**
 * @url /scan/scanContinue
 * @method POST
 */
export type ScanContinueResponse = OkResponse | ErrorsResponse;

/**
 * @url /scan/scanContinue
 * @method POST
 */
export const ScanContinueResponseSchema: z.ZodSchema<ScanContinueResponse> = z.union(
  [OkResponseSchema, ErrorsResponseSchema]
);

/**
 * This is `never` because the request is not JSON, but multipart/form-data,
 * so none of the actual data ends up in `request.body`.
 *
 * @url /scan/hmpb/addTemplates
 * @method POST
 */
export type AddTemplatesRequest = never;

/**
 * This is `never` because the request is not JSON, but multipart/form-data,
 * so none of the actual data ends up in `request.body`.
 *
 * @url /scan/hmpb/addTemplates
 * @method POST
 */
export const AddTemplatesRequestSchema: z.ZodSchema<AddTemplatesRequest> = z.never();

/**
 * @url /scan/hmpb/addTemplates
 * @method POST
 */
export type AddTemplatesResponse = OkResponse | ErrorsResponse;

/**
 * @url /scan/hmpb/addTemplates
 * @method POST
 */
export const AddTemplatesResponseSchema: z.ZodSchema<AddTemplatesResponse> = z.union(
  [OkResponseSchema, ErrorsResponseSchema]
);

/**
 * This is `never` because there is no request data.
 *
 * @url /scan/hmpb/doneTemplates
 * @method POST
 */
export type DoneTemplatesRequest = never;

/**
 * This is `never` because there is no request data.
 *
 * @url /scan/hmpb/doneTemplates
 * @method POST
 */
export const DoneTemplatesRequestSchema: z.ZodSchema<DoneTemplatesRequest> = z.never();

/**
 * @url /scan/hmpb/doneTemplates
 * @method POST
 */
export type DoneTemplatesResponse = OkResponse;

/**
 * @url /scan/hmpb/doneTemplates
 * @method POST
 */
export const DoneTemplatesResponseSchema: z.ZodSchema<DoneTemplatesResponse> = OkResponseSchema;

/**
 * This is `never` because there is no request data.
 *
 * @url /scan/export
 * @method POST
 */
export type ExportRequest = never;

/**
 * This is `never` because there is no request data.
 *
 * @url /scan/export
 * @method POST
 */
export const ExportRequestSchema: z.ZodSchema<ExportRequest> = z.never();

/**
 * @url /scan/export
 * @method POST
 */
export type ExportResponse = string;

/**
 * @url /scan/export
 * @method POST
 */
export const ExportResponseSchema: z.ZodSchema<ExportResponse> = z.string();

/**
 * This is `never` because there is no request data.
 *
 * @url /scan/zero
 * @method POST
 */
export type ZeroRequest = never;

/**
 * This is `never` because there is no request data.
 *
 * @url /scan/zero
 * @method POST
 */
export const ZeroRequestSchema: z.ZodSchema<ZeroRequest> = z.never();

/**
 * @url /scan/zero
 * @method POST
 */
export type ZeroResponse = OkResponse;

/**
 * @url /scan/zero
 * @method POST
 */
export const ZeroResponseSchema: z.ZodSchema<ZeroResponse> = OkResponseSchema;

/**
 * This is `never` because there is no request data.
 *
 * @url /scan/calibrate
 * @method POST
 */
export type CalibrateRequest = never;

/**
 * This is `never` because there is no request data.
 *
 * @url /scan/calibrate
 * @method POST
 */
export const CalibrateRequestSchema: z.ZodSchema<CalibrateRequest> = z.never();

/**
 * @url /scan/calibrate
 * @method POST
 */
export type CalibrateResponse = OkResponse | ErrorsResponse;

/**
 * @url /scan/calibrate
 * @method POST
 */
export const CalibrateResponseSchema: z.ZodSchema<CalibrateResponse> = z.union([
  OkResponseSchema,
  ErrorsResponseSchema,
]);

/**
 * @url /scan/hmpb/review/next-sheet
 * @method GET
 */
export interface GetNextReviewSheetResponse {
  interpreted: BallotSheetInfo;
  layouts: {
    front?: SerializableBallotPageLayout;
    back?: SerializableBallotPageLayout;
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
export const GetNextReviewSheetResponseSchema: z.ZodSchema<GetNextReviewSheetResponse> = z.object(
  {
    interpreted: BallotSheetInfoSchema,
    layouts: z.object({
      front: SerializableBallotPageLayoutSchema.optional(),
      back: SerializableBallotPageLayoutSchema.optional(),
    }),
    definitions: z.object({
      front: z.object({ contestIds: z.array(IdSchema) }).optional(),
      back: z.object({ contestIds: z.array(IdSchema) }).optional(),
    }),
  }
);
