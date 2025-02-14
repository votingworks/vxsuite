import styled from 'styled-components';
import { throwIllegalValue } from '@votingworks/basics';
import { Voter, VoterCheckIn, VoterIdentificationMethod } from '../types';

export const StyledReceipt = styled.div``;

export function capitalizeFirstLetters(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function VoterName({ voter }: { voter: Voter }): JSX.Element {
  return (
    <span>
      {voter.firstName} {voter.middleName} {voter.lastName} {voter.suffix}
    </span>
  );
}

export function VoterAddress({ voter }: { voter: Voter }): JSX.Element {
  return (
    <div>
      <div>
        {voter.streetNumber}
        {voter.addressSuffix} {voter.houseFractionNumber} {voter.streetName}{' '}
        {voter.apartmentUnitNumber}
      </div>
      {voter.addressLine2 === '' ? null : <div>{voter.addressLine2}</div>}
      <div>
        {voter.postalCityTown}, {voter.state} {voter.postalZip5}
        {voter.zip4 !== '' ? `-${voter.zip4}` : ''}
      </div>
    </div>
  );
}

export function PartyName({ party }: { party: 'DEM' | 'REP' | 'UND' }): string {
  switch (party) {
    case 'DEM':
      return 'Democrat';
    case 'REP':
      return 'Republican';
    case 'UND':
      return 'Undeclared';
    default:
      throwIllegalValue(party);
  }
}

export function IdentificationMethod({
  checkIn,
}: {
  checkIn: VoterCheckIn;
}): string {
  const { identificationMethod } = checkIn;
  switch (identificationMethod.type) {
    case 'photoId':
      return `Photo ID (${identificationMethod.state})`;
    case 'personalRecognizance': {
      const { recognizerType, recognizerInitials } = identificationMethod;
      return `P-${
        {
          supervisor: 'S',
          moderator: 'M',
          cityClerk: 'C',
        }[recognizerType]
      }-${recognizerInitials}`;
    }
    default:
      throwIllegalValue(identificationMethod);
  }
}
