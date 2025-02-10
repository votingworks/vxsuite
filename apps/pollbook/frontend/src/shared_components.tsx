import type { Voter } from '@votingworks/pollbook-backend';
import { Callout, Font } from '@votingworks/ui';
import styled from 'styled-components';

export const AbsenteeModeCallout = styled(Callout).attrs({
  color: 'warning',
  icon: 'Envelope',
  children: 'Absentee Mode',
})`
  font-size: ${(p) => p.theme.sizes.headingsRem.h4}rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  > div {
    padding: 0.5rem 1rem;
  }
`;

export function VoterName({
  voter,
  lastNameFirst = false,
}: {
  voter: Voter;
  lastNameFirst?: boolean;
}): JSX.Element {
  return lastNameFirst ? (
    <span>
      {voter.lastName}, {voter.suffix} {voter.firstName} {voter.middleName}
    </span>
  ) : (
    <span>
      {voter.firstName} {voter.middleName} {voter.lastName} {voter.suffix}
    </span>
  );
}

export function VoterAddress({ voter }: { voter: Voter }): JSX.Element {
  return (
    <div>
      <div>
        {voter.streetNumber} {voter.addressSuffix} {voter.houseFractionNumber}{' '}
        {voter.streetName} {voter.apartmentUnitNumber}
      </div>
      {voter.addressLine2 === '' ? null : <div>{voter.addressLine2}</div>}
      <div>
        {voter.postalCityTown}, {voter.state} {voter.postalZip5}
        {voter.zip4 !== '' ? `-${voter.zip4}` : ''}
      </div>
    </div>
  );
}
