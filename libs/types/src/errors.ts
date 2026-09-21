import { SystemLimitViolation } from './system_limits.js';

/**
 * Possible errors that can occur during election package configuration
 */
export type ElectionPackageConfigurationError =
  | { type: 'no_election_package' }
  | { type: 'auth_required_before_election_package_load' }
  | { type: 'election_package_authentication_error' }
  | { type: 'election_key_mismatch' }
  | { type: 'no_ballots' }
  | { type: 'system_limit_violation'; violation: SystemLimitViolation };

export type ExportDataError =
  | 'file-system-error'
  | 'file-too-large'
  | 'insufficient-space'
  | 'missing-usb-drive'
  | 'permission-denied'
  | 'relative-file-path';
