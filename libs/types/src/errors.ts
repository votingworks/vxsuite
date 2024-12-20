/**
 * Possible errors that can occur during election package configuration
 */
export type ElectionPackageConfigurationError =
  | 'no_election_package_on_usb_drive'
  | 'auth_required_before_election_package_load'
  | 'election_package_authentication_error'
  | 'election_key_mismatch';

export type ExportDataError =
  | 'file-system-error'
  | 'missing-usb-drive'
  | 'permission-denied'
  | 'relative-file-path';
