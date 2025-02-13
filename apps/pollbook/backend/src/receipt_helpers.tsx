import styled from 'styled-components';
import { Voter } from './types';

export const StyledReceipt = styled.div``;

export function capitalizeFirstLetters(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
