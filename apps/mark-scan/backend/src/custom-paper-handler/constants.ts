export const PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS = 100;
// Slower interval for limited hardware
export const DEV_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS = 750;
export const PAPER_HANDLER_STATUS_POLLING_TIMEOUT_MS = 30_000;
export const RESET_DELAY_MS = 8_000;
export const RESET_AFTER_JAM_DELAY_MS = 3_000;
// The delay the state machine will wait for paper to eject before
// declaring a jam state during rear ejection
export const DELAY_BEFORE_DECLARING_REAR_JAM_MS = 3_000;

export const SCAN_DPI = 72;
export const PRINT_DPI = 200;
