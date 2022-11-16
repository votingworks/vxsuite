import {
  AdjudicationReasonInfo,
  AdjudicationReasonInfoSchema,
  BallotPageLayout,
  BallotPageLayoutSchema,
  BallotSheetInfo,
  BallotSheetInfoSchema,
  Contest,
  ElectionDefinition,
  ElectionDefinitionSchema,
  ElectionHash,
  IdSchema,
  Iso8601Timestamp,
  Iso8601TimestampSchema,
  MarkThresholds,
  MarkThresholdsSchema,
  Optional,
  PollsState,
  PollsStateSchema,
  PrecinctSelection,
  PrecinctSelectionSchema,
} from '@votingworks/types';
import * as z from 'zod';
import {
  ErrorsResponse,
  ErrorsResponseSchema,
  OkResponse,
  OkResponseSchema,
} from '../../base';

export type Side = 'front' | 'back';
export const SideSchema = z.union([z.literal('front'), z.literal('back')]);

export interface AdjudicationStatus {
  adjudicated: number;
  remaining: number;
}

export const AdjudicationStatusSchema: z.ZodSchema<AdjudicationStatus> =
  z.object({
    adjudicated: z.number(),
    remaining: z.number(),
  });

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

export interface ScanStatus {
  electionHash?: string;
  canUnconfigure: boolean;
  batches: BatchInfo[];
  adjudication: AdjudicationStatus;
}

export const ScanStatusSchema: z.ZodSchema<ScanStatus> = z.object({
  electionHash: z.optional(ElectionHash),
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
 * @url /config/election
 * @method GET
 */
export type GetElectionConfigResponse = ElectionDefinition | null | string;

/**
 * @url /config/election
 * @method GET
 */
export const GetElectionConfigResponseSchema: z.ZodSchema<GetElectionConfigResponse> =
  z.union([ElectionDefinitionSchema, z.null(), z.string()]);

/**
 * @url /config/election
 * @method PATCH
 */
export type PatchElectionConfigResponse = OkResponse | ErrorsResponse;

/**
 * @url /config/election
 * @method PATCH
 */
export const PatchElectionConfigResponseSchema: z.ZodSchema<PatchElectionConfigResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

/**
 * @url /config/election
 * @method PATCH
 */
export type PatchElectionConfigRequest = Uint8Array; // should be Buffer, but this triggers type errors

/**
 * @url /config/election
 * @method PATCH
 */
export const PatchElectionConfigRequestSchema: z.ZodSchema<PatchElectionConfigRequest> =
  z.instanceof(
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
export const DeleteElectionConfigResponseSchema: z.ZodSchema<DeleteElectionConfigResponse> =
  OkResponseSchema;

/**
 * @url /config/package
 * @method PUT
 */
export type PutConfigPackageRequest = never;

/**
 * @url /config/package
 * @method PUT
 */
export const PutConfigPackageRequestSchema: z.ZodSchema<PutConfigPackageRequest> =
  z.never();

/**
 * @url /config/package
 * @method PUT
 */
export type PutConfigPackageResponse = OkResponse | ErrorsResponse;

/**
 * @url /config/package
 * @method PUT
 */
export const PutConfigPackageResponseSchema: z.ZodSchema<PutConfigPackageResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

/**
 * @url /config/testMode
 * @method GET
 */
export type GetTestModeConfigResponse = OkResponse<{ testMode: boolean }>;

/**
 * @url /config/testMode
 * @method GET
 */
export const GetTestModeConfigResponseSchema: z.ZodSchema<GetTestModeConfigResponse> =
  z.object({
    status: z.literal('ok'),
    testMode: z.boolean(),
  });

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
export const PatchTestModeConfigRequestSchema: z.ZodSchema<PatchTestModeConfigRequest> =
  z.object({
    testMode: z.boolean(),
  });

/**
 * @url /config/testMode
 * @method PATCH
 */
export type PatchTestModeConfigResponse = OkResponse | ErrorsResponse;

/**
 * @url /config/testMode
 * @method PATCH
 */
export const PatchTestModeConfigResponseSchema: z.ZodSchema<PatchTestModeConfigResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

/**
 * @url /config/precinct
 * @method GET
 */
export type GetPrecinctSelectionConfigResponse = OkResponse<{
  precinctSelection?: PrecinctSelection;
}>;

/**
 * @url /config/precinct
 * @method GET
 */
export const GetPrecinctSelectionConfigResponseSchema: z.ZodSchema<GetPrecinctSelectionConfigResponse> =
  z.object({
    status: z.literal('ok'),
    precinctSelection: z.optional(PrecinctSelectionSchema),
  });

/**
 * @url /config/precinct
 * @method PATCH
 */
export interface PatchPrecinctSelectionConfigRequest {
  precinctSelection: PrecinctSelection;
}

/**
 * @url /config/precinct
 * @method PATCH
 */
export const PatchPrecinctSelectionConfigRequestSchema: z.ZodSchema<PatchPrecinctSelectionConfigRequest> =
  z.object({
    precinctSelection: PrecinctSelectionSchema,
  });

/**
 * @url /config/precinct
 * @method PATCH
 */
export type PatchPrecinctSelectionConfigResponse = OkResponse | ErrorsResponse;

/**
 * @url /config/precinct
 * @method PATCH
 */
export const PatchPrecinctSelectionConfigResponseSchema: z.ZodSchema<PatchPrecinctSelectionConfigResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

/**
 * @url /config/isSoundMuted
 * @method PATCH
 */
export type PatchIsSoundMutedConfigResponse = OkResponse | ErrorsResponse;

/**
 * @url /config/isSoundMuted
 * @method PATCH
 */
export const PatchIsSoundMutedConfigResponseSchema: z.ZodSchema<PatchIsSoundMutedConfigResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

/**
 * @url /config/isSoundMuted
 * @method PATCH
 */
export interface PatchIsSoundMutedConfigRequest {
  isSoundMuted: boolean;
}

/**
 * @url /config/isSoundMuted
 * @method PATCH
 */
export const PatchIsSoundMutedConfigRequestSchema: z.ZodSchema<PatchIsSoundMutedConfigRequest> =
  z.object({
    isSoundMuted: z.boolean(),
  });

/**
 * @url /config/polls
 * @method PATCH
 */
export interface PatchPollsStateRequest {
  pollsState: PollsState;
}

/**
 * @url /config/polls
 * @method PATCH
 */
export const PatchPollsStateRequestSchema: z.ZodSchema<PatchPollsStateRequest> =
  z.object({
    pollsState: PollsStateSchema,
  });

/**
 * @url /config/polls
 * @method PATCH
 */
export type PatchPollsStateResponse = OkResponse | ErrorsResponse;

/**
 * @url /config/polls
 * @method PATCH
 */
export const PatchPollsStateResponseSchema: z.ZodSchema<PatchPollsStateResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

/**
 * @url /config/ballotCountWhenBallotBagLastReplaced
 * @method PATCH
 */
export type PatchBallotBagReplaced = OkResponse;

/**
 * @url /config/ballotCountWhenBallotBagLastReplaced
 * @method PATCH
 */
export const PatchBallotBagReplacedSchema: z.ZodSchema<PatchBallotBagReplaced> =
  OkResponseSchema;

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
export const GetMarkThresholdOverridesConfigResponseSchema: z.ZodSchema<GetMarkThresholdOverridesConfigResponse> =
  z.object({
    status: z.literal('ok'),
    markThresholdOverrides: z.optional(MarkThresholdsSchema),
  });

/**
 * @url /config/markThresholdOverrides
 * @method DELETE
 */
export type DeleteMarkThresholdOverridesConfigResponse = OkResponse;

/**
 * @url /config/markThresholdOverrides
 * @method DELETE
 */
export const DeleteMarkThresholdOverridesConfigResponseSchema =
  OkResponseSchema;

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
export const PatchMarkThresholdOverridesConfigRequestSchema: z.ZodSchema<PatchMarkThresholdOverridesConfigRequest> =
  z.object({
    markThresholdOverrides: z.optional(MarkThresholdsSchema),
  });

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
export const PatchMarkThresholdOverridesConfigResponseSchema: z.ZodSchema<PatchMarkThresholdOverridesConfigResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

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
export const PatchSkipElectionHashCheckConfigRequestSchema: z.ZodSchema<PatchSkipElectionHashCheckConfigRequest> =
  z.object({
    skipElectionHashCheck: z.boolean(),
  });

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
export const PatchSkipElectionHashCheckConfigResponseSchema: z.ZodSchema<PatchSkipElectionHashCheckConfigResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

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
export const AddTemplatesRequestSchema: z.ZodSchema<AddTemplatesRequest> =
  z.never();

/**
 * @url /scan/hmpb/addTemplates
 * @method POST
 */
export type AddTemplatesResponse = OkResponse | ErrorsResponse;

/**
 * @url /scan/hmpb/addTemplates
 * @method POST
 */
export const AddTemplatesResponseSchema: z.ZodSchema<AddTemplatesResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

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
export const DoneTemplatesRequestSchema: z.ZodSchema<DoneTemplatesRequest> =
  z.never();

/**
 * @url /scan/hmpb/doneTemplates
 * @method POST
 */
export type DoneTemplatesResponse = OkResponse;

/**
 * @url /scan/hmpb/doneTemplates
 * @method POST
 */
export const DoneTemplatesResponseSchema: z.ZodSchema<DoneTemplatesResponse> =
  OkResponseSchema;

/**
 * @url /scan/export
 * @method POST
 */
export type ExportRequest = Optional<{
  skipImages: boolean;
}>;

/**
 * @url /scan/export
 * @method POST
 */
export const ExportRequestSchema: z.ZodSchema<ExportRequest> = z
  .object({
    skipImages: z.boolean(),
  })
  .optional();

/**
 * @url /scan/export
 * @method POST
 */
export type ExportResponse = string | ErrorsResponse;

/**
 * @url /scan/export
 * @method POST
 */
export const ExportResponseSchema: z.ZodSchema<ExportResponse> = z.union([
  z.string(),
  ErrorsResponseSchema,
]);

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

// Precinct Scanner API types
export const PrecinctScannerStateSchema = z.enum([
  'connecting',
  'disconnected',
  'no_paper',
  'ready_to_scan',
  'scanning',
  'ready_to_accept',
  'accepting',
  'accepted',
  'needs_review',
  'accepting_after_review',
  'returning',
  'returned',
  'rejecting',
  'rejected',
  'calibrating',
  'jammed',
  'both_sides_have_paper',
  'recovering_from_error',
  'unrecoverable_error',
]);
export type PrecinctScannerState = z.infer<typeof PrecinctScannerStateSchema>;

export const InvalidInterpretationReasonSchema = z.enum([
  'invalid_test_mode',
  'invalid_election_hash',
  'invalid_precinct',
  'unreadable',
  'unknown',
]);
export type InvalidInterpretationReason = z.infer<
  typeof InvalidInterpretationReasonSchema
>;

export type SheetInterpretation =
  | {
      type: 'ValidSheet';
    }
  | {
      type: 'InvalidSheet';
      reason: InvalidInterpretationReason;
    }
  | {
      type: 'NeedsReviewSheet';
      reasons: AdjudicationReasonInfo[];
    };
export const SheetInterpretationSchema: z.ZodSchema<SheetInterpretation> =
  z.union([
    z.object({
      type: z.literal('ValidSheet'),
    }),
    z.object({
      type: z.literal('InvalidSheet'),
      reason: InvalidInterpretationReasonSchema,
    }),
    z.object({
      type: z.literal('NeedsReviewSheet'),
      reasons: z.array(AdjudicationReasonInfoSchema),
    }),
  ]);

export const PrecinctScannerErrorTypeSchema = z.enum([
  'paper_status_timed_out',
  'scanning_timed_out',
  'scanning_failed',
  'both_sides_have_paper',
  'paper_in_back_after_accept',
  'paper_in_front_after_reconnect',
  'paper_in_back_after_reconnect',
  'unexpected_paper_status',
  'unexpected_event',
  'plustek_error',
]);
export type PrecinctScannerErrorType = z.infer<
  typeof PrecinctScannerErrorTypeSchema
>;

export interface PrecinctScannerMachineStatus {
  state: PrecinctScannerState;
  interpretation?: SheetInterpretation;
  error?: PrecinctScannerErrorType;
}
export interface PrecinctScannerStatus extends PrecinctScannerMachineStatus {
  ballotsCounted: number;
  canUnconfigure: boolean;
}

export const PrecinctScannerStatusSchema: z.ZodSchema<PrecinctScannerStatus> =
  z.object({
    state: PrecinctScannerStateSchema,
    interpretation: SheetInterpretationSchema.optional(),
    error: PrecinctScannerErrorTypeSchema.optional(),
    ballotsCounted: z.number(),
    canUnconfigure: z.boolean(),
  });

export type GetPrecinctScannerStatusResponse = PrecinctScannerStatus;
/**
 * @url /scanner/status
 * @method GET
 */
export const GetPrecinctScannerStatusResponseSchema: z.ZodSchema<GetPrecinctScannerStatusResponse> =
  PrecinctScannerStatusSchema;

export interface PrecinctScannerConfig {
  // Config that persists across switching modes
  electionDefinition?: ElectionDefinition;
  precinctSelection?: PrecinctSelection;
  markThresholdOverrides?: MarkThresholds;
  isSoundMuted: boolean;
  // "Config" that is specific to each election session
  isTestMode: boolean;
  pollsState: PollsState;
  ballotCountWhenBallotBagLastReplaced: number;
}

export const PrecinctScannerConfigSchema: z.ZodSchema<PrecinctScannerConfig> =
  z.object({
    electionDefinition: ElectionDefinitionSchema.optional(),
    precinctSelection: PrecinctSelectionSchema.optional(),
    markThresholdOverrides: MarkThresholdsSchema.optional(),
    isSoundMuted: z.boolean(),
    isTestMode: z.boolean(),
    pollsState: PollsStateSchema,
    ballotCountWhenBallotBagLastReplaced: z.number(),
  });

export const InitialPrecinctScannerConfig: PrecinctScannerConfig = {
  isSoundMuted: false,
  isTestMode: true,
  pollsState: 'polls_closed_initial',
  ballotCountWhenBallotBagLastReplaced: 0,
};

/**
 * @url /config
 * @method GET
 */
export type GetPrecinctScannerConfigResponse = PrecinctScannerConfig;

/**
 * @url /config
 * @method GET
 */
export const GetPrecinctScannerConfigResponseSchema: z.ZodSchema<GetPrecinctScannerConfigResponse> =
  PrecinctScannerConfigSchema;
