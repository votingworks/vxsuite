import { SystemLimitViolation } from './system_limits';

/**
 * Possible errors that can occur during election package configuration
 */
export type ElectionPackageConfigurationError =
  | { type: 'no_election_package_on_usb_drive' }
  | { type: 'auth_required_before_election_package_load' }
  | { type: 'election_package_authentication_error' }
  | { type: 'election_key_mismatch' }
  | { type: 'no_ballots' }
  | { type: 'system_limit_violation'; violation: SystemLimitViolation };

export type ExportDataError =
  | 'file-system-error'
  | 'missing-usb-drive'
  | 'permission-denied'
  | 'relative-file-path';
