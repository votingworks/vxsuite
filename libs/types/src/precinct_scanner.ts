export const PRECINCT_SCANNER_STATES = [
  'connecting',
  'disconnected',
  'no_paper',
  'hardware_ready_to_scan',
  'scanning',
  'returning_to_rescan',
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
  'both_sides_have_paper',
  'recovering_from_error',
  'double_sheet_jammed',
  'unrecoverable_error',
] as const;

export type PrecinctScannerState = (typeof PRECINCT_SCANNER_STATES)[number];
