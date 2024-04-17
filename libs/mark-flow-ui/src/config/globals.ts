import { appStrings } from '@votingworks/ui';

// NOTE: Keep in sync with the value of appStrings.warningBmdInactiveSession:
export const IDLE_TIMEOUT_SECONDS = 5 * 60; // VVSG Requirement: 2–5 minutes
export const idleTimeoutWarningStringFn = appStrings.warningBmdInactiveSession;

export const IDLE_RESET_TIMEOUT_SECONDS = 45; // VVSG Requirement: 20–45 seconds
export const WRITE_IN_CANDIDATE_MAX_LENGTH = 40;
