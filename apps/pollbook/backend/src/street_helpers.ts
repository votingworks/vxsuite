import { safeParseInt } from '@votingworks/types';
import {
  VoterAddressChangeRequest,
  ValidStreetInfo,
  VoterRegistrationRequest,
} from './types';
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

export function isVoterRegistrationValid(
  voterRegistration: VoterRegistrationRequest,
  streetInfo: ValidStreetInfo[]
): boolean {
  const validStreetInfo = maybeGetStreetInfoForAddress(
    voterRegistration.streetName,
    voterRegistration.streetNumber,
    streetInfo
  );
  return (
    isVoterNameChangeValid(voterRegistration) &&
    validStreetInfo !== undefined &&
    voterRegistration.streetNumber.length > 0 &&
    voterRegistration.city.length > 0 &&
    voterRegistration.zipCode.length === 5 &&
    voterRegistration.party.length > 0 &&
    ['DEM', 'REP', 'UND'].includes(voterRegistration.party)
  );
}

export function isVoterAddressChangeValid(
  addressChange: VoterAddressChangeRequest,
  streetInfo: ValidStreetInfo[]
): boolean {
  const validStreetInfo = maybeGetStreetInfoForAddress(
    addressChange.streetName,
    addressChange.streetNumber,
    streetInfo
  );
  return (
    validStreetInfo !== undefined &&
    addressChange.streetNumber.length > 0 &&
    addressChange.city.length > 0 &&
    addressChange.zipCode.length === 5
  );
}
