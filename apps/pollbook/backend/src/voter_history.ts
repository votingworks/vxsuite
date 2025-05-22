// Helper to generate the CSV contents for the Voter History export.

import { stringify } from 'csv-stringify/sync';
import { Voter } from './types';

export function generateVoterHistoryCsvContent(voters: Voter[]): string {
  const voterActivity = voters
    .filter(
      (voter) =>
        voter.checkIn ||
        voter.addressChange ||
        voter.nameChange ||
        voter.registrationEvent
    )
    .map((voter) => {
      const voterName = voter.nameChange ?? voter;
      const voterAddress = voter.addressChange ?? voter;
      return {
        'Voter ID': voter.voterId,
        Party: voter.party,
        'Last Name': voterName.lastName,
        'First Name': voterName.firstName,
        'Middle Name': voterName.middleName,
        'Name Suffix': voterName.suffix,
        'Street Number': voterAddress.streetNumber ?? '',
        'Street Number Suffix':
          (voter.addressChange
            ? voter.addressChange.streetSuffix
            : voter.addressSuffix) ?? '',
        'Street Number Fraction': voterAddress.houseFractionNumber ?? '',
        'Street Name': voterAddress.streetName ?? '',
        'Apartment/Unit Number': voterAddress.apartmentUnitNumber ?? '',
        'Address Line 2': voterAddress.addressLine2 ?? '',
        'Address Line 3': voterAddress.addressLine3 ?? '',
        'City/Town':
          (voter.addressChange
            ? voter.addressChange.city
            : voter.postalCityTown) ?? '',
        'Zip Code':
          (voter.addressChange
            ? voter.addressChange.zipCode
            : voter.postalZip5) ?? '',
        'Check-In': voter.checkIn ? 'Y' : 'N',
        Absentee: voter.checkIn?.isAbsentee ? 'Y' : 'N',
        'Address Change': voter.addressChange ? 'Y' : 'N',
        'Name Change': voter.nameChange ? 'Y' : 'N',
        'New Registration': voter.registrationEvent ? 'Y' : 'N',
        OOSDL:
          voter.checkIn?.identificationMethod.type === 'outOfStateLicense'
            ? voter.checkIn.identificationMethod.state
            : '',
      };
    });

  return stringify(voterActivity, { header: true });
}
