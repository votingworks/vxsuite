export const DEVICE_STATUS_POLLING_INTERVAL_MS = 200;
export const AUTH_STATUS_POLLING_INTERVAL_MS = 200;

// Slower interval for limited hardware
export const DEV_DEVICE_STATUS_POLLING_INTERVAL_MS = 1000;
export const DEV_AUTH_STATUS_POLLING_INTERVAL_MS = 1000;

export const DEVICE_STATUS_POLLING_TIMEOUT_MS = 30_000;
export const AUTH_STATUS_POLLING_TIMEOUT_MS = 30_000;
// The delay the state machine will wait after issuing a reset command.
// The reset command resolves immediately but the hardware takes about 7
// seconds to become available again.
export const RESET_DELAY_MS = 8_000;
// The delay the state machine will wait for paper to eject before
// declaring a jam state during rear ejection. Expected time for a successful
// ballot cast is is about 3.5 seconds.
export const DELAY_BEFORE_DECLARING_REAR_JAM_MS = 7_000;
export const NOTIFICATION_DURATION_MS = 5_000;

export const MAX_BALLOT_BOX_CAPACITY = 200;

export const SCAN_DPI = 72;
export const PRINT_DPI = 200;
