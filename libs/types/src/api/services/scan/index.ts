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
  MarkAdjudications,
  MarkAdjudicationsSchema,
  BallotPageLayout,
  BallotPageLayoutSchema,
} from '../../../hmpb';
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
import { ElectionHash, IdSchema } from '../../../generic';

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

export interface BatchInfo {
  id: string;
  label: string;
  startedAt: Iso8601Timestamp;
  endedAt?: Iso8601Timestamp;
  error?: string;
  count: number;
}

export const BatchInfoSchema: z.ZodSchema<BatchInfo> = z.object({
  id: IdSchema,
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
  canUnconfigure: boolean;
  batches: BatchInfo[];
  adjudication: AdjudicationStatus;
  scanner: ScannerStatus;
}

export const ScanStatusSchema: z.ZodSchema<ScanStatus> = z.object({
  electionHash: z.optional(ElectionHash),
  canUnconfigure: z.boolean(),
  batches: z.array(BatchInfoSchema),
  adjudication: AdjudicationStatusSchema,
  scanner: ScannerStatusSchema,
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
 * @url /config/election
 * @method GET
 */
export type GetElectionConfigResponse = ElectionDefinition | null | string;

/**
 * @url /config/election
 * @method GET
 */
export const GetElectionConfigResponseSchema: z.ZodSchema<GetElectionConfigResponse> = z.union(
  [ElectionDefinitionSchema, z.null(), z.string()]
);

/**
 * @url /config/election
 * @method PATCH
 */
export type PatchElectionConfigResponse = OkResponse | ErrorsResponse;

/**
 * @url /config/election
 * @method PATCH
 */
export const PatchElectionConfigResponseSchema: z.ZodSchema<PatchElectionConfigResponse> = z.union(
  [OkResponseSchema, ErrorsResponseSchema]
);

/**
 * @url /config/election
 * @method PATCH
 */
export type PatchElectionConfigRequest = Uint8Array; // should be Buffer, but this triggers type errors

/**
 * @url /config/election
 * @method PATCH
 */
export const PatchElectionConfigRequestSchema: z.ZodSchema<PatchElectionConfigRequest> = z.instanceof(
  // should be Buffer, but this triggers type errors
  Uint8Array
);

/**
 * @url /config/election
 * @method DELETE
 */
export type DeleteElectionConfigResponse = OkResponse | ErrorsResponse;

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
 * @url /config/testMode
 * @method GET
 */
export type GetTestModeConfigResponse = OkResponse<{ testMode: boolean }>;

/**
 * @url /config/testMode
 * @method GET
 */
export const GetTestModeConfigResponseSchema: z.ZodSchema<GetTestModeConfigResponse> = z.object(
  {
    status: z.literal('ok'),
    testMode: z.boolean(),
  }
);

/**
 * @url /config/testMode
 * @method PATCH
 */
export interface PatchTestModeConfigRequest {
  testMode: boolean;
}

/**
 * @url /config/testMode
 * @method PATCH
 */
export const PatchTestModeConfigRequestSchema: z.ZodSchema<PatchTestModeConfigRequest> = z.object(
  {
    testMode: z.boolean(),
  }
);

/**
 * @url /config/testMode
 * @method PATCH
 */
export type PatchTestModeConfigResponse = OkResponse | ErrorsResponse;

/**
 * @url /config/testMode
 * @method PATCH
 */
export const PatchTestModeConfigResponseSchema: z.ZodSchema<PatchTestModeConfigResponse> = z.union(
  [OkResponseSchema, ErrorsResponseSchema]
);

/**
 * @url /config/precinct
 * @method GET
 */
export type GetCurrentPrecinctConfigResponse = OkResponse<{
  precinctId?: PrecinctId;
}>;

/**
 * @url /config/precinct
 * @method GET
 */
export const GetCurrentPrecinctResponseSchema: z.ZodSchema<GetCurrentPrecinctConfigResponse> = z.object(
  {
    status: z.literal('ok'),
    precinctId: z.optional(PrecinctIdSchema),
  }
);

/**
 * @url /config/precinct
 * @method PUT
 */
export interface PutCurrentPrecinctConfigRequest {
  precinctId?: PrecinctId;
}

/**
 * @url /config/precinct
 * @method PUT
 */
export const PutCurrentPrecinctConfigRequestSchema: z.ZodSchema<PutCurrentPrecinctConfigRequest> = z.object(
  {
    precinctId: z.optional(PrecinctIdSchema),
  }
);

/**
 * @url /config/precinct
 * @method PUT
 */
export type PutCurrentPrecinctConfigResponse = OkResponse | ErrorsResponse;

/**
 * @url /config/precinct
 * @method PUT
 */
export const PutCurrentPrecinctConfigResponseSchema: z.ZodSchema<PutCurrentPrecinctConfigResponse> = z.union(
  [OkResponseSchema, ErrorsResponseSchema]
);

/**
 * @url /config/precinct
 * @method DELETE
 */
export type DeleteCurrentPrecinctConfigResponse = OkResponse;

/**
 * @url /config/precinct
 * @method DELETE
 */
export const DeleteCurrentPrecinctConfigResponseSchema = OkResponseSchema;

/**
 * @url /config/markThresholdOverrides
 * @method GET
 */
export type GetMarkThresholdOverridesConfigResponse = OkResponse<{
  markThresholdOverrides?: MarkThresholds;
}>;

/**
 * @url /config/markThresholdOverrides
 * @method GET
 */
export const GetMarkThresholdOverridesConfigResponseSchema: z.ZodSchema<GetMarkThresholdOverridesConfigResponse> = z.object(
  {
    status: z.literal('ok'),
    markThresholdOverrides: z.optional(MarkThresholdsSchema),
  }
);

/**
 * @url /config/markThresholdOverrides
 * @method DELETE
 */
export type DeleteMarkThresholdOverridesConfigResponse = OkResponse;

/**
 * @url /config/markThresholdOverrides
 * @method DELETE
 */
export const DeleteMarkThresholdOverridesConfigResponseSchema = OkResponseSchema;

/**
 * @url /config/markThresholdOverrides
 * @method PATCH
 */
export interface PatchMarkThresholdOverridesConfigRequest {
  markThresholdOverrides?: MarkThresholds;
}

/**
 * @url /config/markThresholdOverrides
 * @method PATCH
 */
export const PatchMarkThresholdOverridesConfigRequestSchema: z.ZodSchema<PatchMarkThresholdOverridesConfigRequest> = z.object(
  {
    markThresholdOverrides: z.optional(MarkThresholdsSchema),
  }
);

/**
 * @url /config/markThresholdOverrides
 * @method PATCH
 */
export type PatchMarkThresholdOverridesConfigResponse =
  | OkResponse
  | ErrorsResponse;

/**
 * @url /config/markThresholdOverrides
 * @method PATCH
 */
export const PatchMarkThresholdOverridesConfigResponseSchema: z.ZodSchema<PatchMarkThresholdOverridesConfigResponse> = z.union(
  [OkResponseSchema, ErrorsResponseSchema]
);

/**
 * @url /config/skipElectionHashCheck
 * @method PATCH
 */
export interface PatchSkipElectionHashCheckConfigRequest {
  skipElectionHashCheck: boolean;
}

/**
 * @url /config/skipElectionHashCheck
 * @method PATCH
 */
export const PatchSkipElectionHashCheckConfigRequestSchema: z.ZodSchema<PatchSkipElectionHashCheckConfigRequest> = z.object(
  {
    skipElectionHashCheck: z.boolean(),
  }
);

/**
 * @url /config/skipElectionHashCheck
 * @method PATCH
 */
export type PatchSkipElectionHashCheckConfigResponse =
  | OkResponse
  | ErrorsResponse;

/**
 * @url /config/skipElectionHashCheck
 * @method PATCH
 */
export const PatchSkipElectionHashCheckConfigResponseSchema: z.ZodSchema<PatchSkipElectionHashCheckConfigResponse> = z.union(
  [OkResponseSchema, ErrorsResponseSchema]
);

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
export type ZeroResponse = OkResponse | ErrorsResponse;

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
export const GetNextReviewSheetResponseSchema: z.ZodSchema<GetNextReviewSheetResponse> = z.object(
  {
    interpreted: BallotSheetInfoSchema,
    layouts: z.object({
      front: BallotPageLayoutSchema.optional(),
      back: BallotPageLayoutSchema.optional(),
    }),
    definitions: z.object({
      front: z.object({ contestIds: z.array(IdSchema) }).optional(),
      back: z.object({ contestIds: z.array(IdSchema) }).optional(),
    }),
  }
);
