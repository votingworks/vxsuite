import styled from 'styled-components';
import { throwIllegalValue } from '@votingworks/basics';
import { Voter, VoterCheckIn } from '../types';

export const StyledReceipt = styled.div``;

export function capitalizeFirstLetters(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function VoterName({ voter }: { voter: Voter }): JSX.Element {
  const name = voter.nameChange ?? voter;
  return (
    <span>
      {name.firstName} {name.middleName} {name.lastName} {name.suffix}
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
}): JSX.Element | null {
  const { identificationMethod } = checkIn;
  switch (identificationMethod.type) {
    case 'default':
      return null;
    case 'outOfStateLicense':
      return <div>OOS DL ({identificationMethod.state})</div>;
    default:
      throwIllegalValue(identificationMethod);
  }
}
