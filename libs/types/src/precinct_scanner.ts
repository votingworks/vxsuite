import { BallotStyleId, PrecinctId, VotesDict } from './election';
import { SheetInterpretation } from './interpretation';

export const PRECINCT_SCANNER_STATES = [
  'connecting',
  'disconnected',
  'waiting_for_ballot',
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
  'jammed',
  'cover_open',
  'both_sides_have_paper',
  'resetting',
  'unrecoverable_error',
  'paused',
  'calibrating_double_feed_detection.double_sheet',
  'calibrating_double_feed_detection.single_sheet',
  'calibrating_double_feed_detection.done',
  'calibrating_image_sensors.calibrating',
  'calibrating_image_sensors.done',
  'scanner_diagnostic.running',
  'scanner_diagnostic.done',
] as const;

export type PrecinctScannerState = (typeof PRECINCT_SCANNER_STATES)[number];

export type PrecinctScannerErrorType =
  | 'scanning_timed_out'
  | 'scanning_failed'
  | 'double_feed_detected'
  | 'outfeed_blocked'
  | 'paper_in_back_after_reconnect'
  | 'paper_in_front_after_reconnect'
  | 'unexpected_event'
  | 'client_error'
  | 'double_feed_calibration_timed_out'
  | 'image_sensor_calibration_timed_out'
  | 'image_sensor_calibration_failed'
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
  /**
   * Combined front and back votes for the ballot currently held in the scanner.
   * Only present in the `ready_to_accept` state, where the voter reviews their
   * selections before confirming.
   */
  votes?: VotesDict;
  /**
   * Ballot style and precinct of the ballot currently held in the scanner. Only
   * present in the `ready_to_accept` state. The ballot style is needed to
   * display the voter's selections in ballot-rotation order.
   */
  ballotStyleId?: BallotStyleId;
  precinctId?: PrecinctId;
  error?: PrecinctScannerErrorType;
}
