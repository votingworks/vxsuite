import { SheetInterpretation } from './interpretation';

export const PRECINCT_SCANNER_STATES = [
  'connecting',
  'disconnected',
  'no_paper',
  'hardware_ready_to_scan',
  'scanning',
  'returning_to_rescan',
  'accepting',
  'accepted',
  'needs_review',
  'accepting_after_review',
  'returning',
  'returned',
  'rejecting',
  'rejected',
  'jammed',
  'cover_open',
  'both_sides_have_paper',
  'recovering_from_error',
  'double_sheet_jammed',
  'unrecoverable_error',
  'paused',
  'calibrating_double_feed_detection.double_sheet',
  'calibrating_double_feed_detection.single_sheet',
  'calibrating_double_feed_detection.done',
  'scanner_diagnostic.running',
  'scanner_diagnostic.done',
] as const;

export type PrecinctScannerState = (typeof PRECINCT_SCANNER_STATES)[number];

export type PrecinctScannerErrorType =
  | 'paper_status_timed_out'
  | 'scanning_timed_out'
  | 'scanning_failed'
  | 'both_sides_have_paper'
  | 'double_feed_detected'
  | 'outfeed_blocked'
  | 'paper_in_back_after_accept'
  | 'paper_in_front_after_reconnect'
  | 'paper_in_back_after_reconnect'
  | 'paper_in_both_sides_after_reconnect'
  | 'unexpected_paper_status'
  | 'unexpected_event'
  | 'client_error'
  | 'double_feed_calibration_timed_out'
  | 'scanner_diagnostic_failed';

/* istanbul ignore next */
export class PrecinctScannerError extends Error {
  constructor(
    // eslint-disable-next-line vx/gts-no-public-class-fields
    public type: PrecinctScannerErrorType,
    message?: string
  ) {
    super(message ?? type);
  }
}

export interface PrecinctScannerMachineStatus {
  state: PrecinctScannerState;
  interpretation?: SheetInterpretation;
  error?: PrecinctScannerErrorType;
}
