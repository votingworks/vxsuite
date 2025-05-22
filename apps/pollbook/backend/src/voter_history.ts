// Helper to generate the CSV contents for the Voter History export.

import { stringify } from 'csv-stringify/sync';
import { Voter, VoterAddressChange, VoterNameChangeRequest } from './types';

function joinNonEmpty(parts: string[]): string {
  return parts.filter((part) => part !== '').join(' ');
}

function voterName(name: VoterNameChangeRequest): string {
  return joinNonEmpty([
    name.firstName,
    name.middleName,
    name.lastName,
    name.suffix,
  ]);
}

function voterAddress(address: VoterAddressChange | Voter): string {
  if ('zipCode' in address) {
    return `${
      joinNonEmpty([
        `${address.streetNumber}${address.streetSuffix}`,
        address.streetName,
        address.apartmentUnitNumber,
      ]) + (address.addressLine2 ? `, ${address.addressLine2}` : '')
    }, ${address.city}, ${address.state} ${address.zipCode}`;
  }
  return `${
    joinNonEmpty([
      `${address.streetNumber}${address.addressSuffix}`,
      address.houseFractionNumber,
      address.streetName,
      address.apartmentUnitNumber,
    ]) + (address.addressLine2 ? `, ${address.addressLine2}` : '')
  }, ${address.postalCityTown}, ${address.state} ${address.postalZip5}`;
}

export function generateVoterHistoryCsvContent(voters: Voter[]): string {
  const voterActivity = voters
    .filter(
      (voter) =>
        voter.checkIn ||
        voter.addressChange ||
        voter.nameChange ||
        voter.registrationEvent
    )
    .map((voter) => ({
      'Voter ID': voter.voterId,
      Party: voter.party,
      'Full Name': voterName(voter.nameChange ?? voter),
      'Full Address': voterAddress(voter.addressChange ?? voter),
      'Check-In': voter.checkIn ? 'Y' : 'N',
      Absentee: voter.checkIn?.isAbsentee ? 'Y' : 'N',
      'Address Change': voter.addressChange ? 'Y' : 'N',
      'Name Change': voter.nameChange ? 'Y' : 'N',
      'New Registration': voter.registrationEvent ? 'Y' : 'N',
      OOSDL:
        voter.checkIn?.identificationMethod.type === 'outOfStateLicense'
          ? voter.checkIn.identificationMethod.state
          : '',
    }));

  return stringify(voterActivity, { header: true });
}
