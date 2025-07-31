import { safeParseInt } from '@votingworks/types';
import { Optional } from '@votingworks/basics';
import {
  VoterAddressChangeRequest,
  ValidStreetInfo,
  VoterRegistrationRequest,
} from '@votingworks/types';
import { isVoterNameChangeValid } from './voter_helpers';

export function maybeGetStreetInfoForAddress(
  streetName: string,
  streetNumberStr: string,
  streetInfo: ValidStreetInfo[]
): ValidStreetInfo | undefined {
  const parsedStreetNumber = safeParseInt(streetNumberStr);
  if (!parsedStreetNumber.isOk()) {
    return undefined;
  }
  const streetNumber = parsedStreetNumber.ok();

  const validStreetNames = streetInfo.filter(
    (info) => info.streetName.toLocaleUpperCase() === streetName
  );
  for (const validStreetInfo of validStreetNames) {
    const step = validStreetInfo.side === 'all' ? 1 : 2;
    const validNumbers = new Set<number>();
    for (
      let n = validStreetInfo.lowRange;
      n <= validStreetInfo.highRange;
      n += step
    ) {
      validNumbers.add(n);
    }
    if (validNumbers.has(streetNumber)) {
      return validStreetInfo;
    }
  }
  return undefined;
}

/**
 * Validates voter registration and returns street info only if the address is valid
 * and from the correct precinct. Returns undefined if validation fails or if no
 * precinct is configured.
 */
export function maybeGetStreetInfoForVoterRegistration(
  voterRegistration: VoterRegistrationRequest,
  streetInfo: ValidStreetInfo[]
): Optional<ValidStreetInfo> {
  // Basic field validation
  if (
    !isVoterNameChangeValid(voterRegistration) ||
    voterRegistration.streetNumber.length === 0 ||
    voterRegistration.city.length === 0 ||
    voterRegistration.zipCode.length !== 5 ||
    voterRegistration.party.length === 0 ||
    !['DEM', 'REP', 'UND'].includes(voterRegistration.party)
  ) {
    return undefined;
  }

  // Get street info for the address
  const validStreetInfo = maybeGetStreetInfoForAddress(
    voterRegistration.streetName,
    voterRegistration.streetNumber,
    streetInfo
  );

  // Return street info only if it's valid and from the correct precinct
  if (
    validStreetInfo &&
    validStreetInfo.precinct === voterRegistration.precinct
  ) {
    return validStreetInfo;
  }
  return undefined;
}

/**
 * Validates address change and returns street info only if the address is valid
 * and from the correct precinct. Returns undefined if validation fails or if no
 * precinct is configured.
 */
export function maybeGetStreetInfoForAddressChange(
  addressChange: VoterAddressChangeRequest,
  streetInfo: ValidStreetInfo[]
): ValidStreetInfo | undefined {
  // Basic field validation
  if (
    addressChange.streetNumber.length === 0 ||
    addressChange.city.length === 0 ||
    addressChange.zipCode.length !== 5
  ) {
    return undefined;
  }

  // Get street info for the address
  const validStreetInfo = maybeGetStreetInfoForAddress(
    addressChange.streetName,
    addressChange.streetNumber,
    streetInfo
  );

  // Return street info only if it's valid and from the correct precinct
  if (validStreetInfo && validStreetInfo.precinct === addressChange.precinct) {
    return validStreetInfo;
  }

  return undefined;
}
