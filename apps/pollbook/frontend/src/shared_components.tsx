import type { Voter, VoterAddressChange } from '@votingworks/pollbook-backend';
import { Callout } from '@votingworks/ui';
import styled from 'styled-components';
import { Column } from './layout';

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

export function VoterAddress({
  voter,
  style,
}: {
  voter: Voter;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <div style={style}>
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

export function AddressChange({
  address,
}: {
  address: VoterAddressChange;
}): JSX.Element {
  return (
    <div>
      <div>
        {address.streetNumber} {address.streetSuffix} {address.streetName}{' '}
        {address.apartmentUnitNumber}
      </div>
      {address.addressLine2 === '' ? null : <div>{address.addressLine2}</div>}
      <div>
        {address.city}, NH {address.zipCode}
      </div>
    </div>
  );
}

export const TextField = styled.input`
  width: 100%;
  text-transform: uppercase;
`;

export const ExpandableInput = styled(Column)`
  flex: 1;
`;
export const StaticInput = styled(Column)`
  flex: 0;
`;
export const RequiredExpandableInput = styled(ExpandableInput)`
  & > *:first-child::after {
    content: ' *';
    color: red;
  }
`;
export const RequiredStaticInput = styled(StaticInput)`
  & > *:first-child::after {
    content: ' *';
    color: red;
  }
`;
