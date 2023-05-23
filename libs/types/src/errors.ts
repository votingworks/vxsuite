/**
 * Possible errors that can occur during ballot package configuration
 */
export type BallotPackageConfigurationError =
  | 'no_ballot_package_on_usb_drive'
  | 'auth_required_before_ballot_package_load'
  | 'ballot_package_authentication_error'
  | 'election_hash_mismatch';
