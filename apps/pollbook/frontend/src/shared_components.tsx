import type { Voter, VoterAddressChange } from '@votingworks/pollbook-backend';
import { Callout, Card, H4 } from '@votingworks/ui';
import styled from 'styled-components';
import { throwIllegalValue } from '@votingworks/basics';
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
  const { lastName, firstName, middleName, suffix } = voter.nameChange ?? voter;
  return lastNameFirst ? (
    <span>
      {lastName}, {firstName} {middleName} {suffix}
    </span>
  ) : (
    <span>
      {firstName} {middleName} {lastName} {suffix}
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
        {voter.streetNumber}
        {voter.addressSuffix} {voter.houseFractionNumber} {voter.streetName}{' '}
        {voter.apartmentUnitNumber}
      </div>
      {voter.addressLine2 === '' ? null : <div>{voter.addressLine2}</div>}
      <div>
        {voter.postalCityTown}, {voter.state} {voter.postalZip5}
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
        {address.streetNumber}
        {address.streetSuffix} {address.streetName}{' '}
        {address.apartmentUnitNumber}
      </div>
      {address.addressLine2 === '' ? null : <div>{address.addressLine2}</div>}
      <div>
        {address.city}, {address.state} {address.zipCode}
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

const TitleBar = styled.div`
  padding: 0.5rem 1rem;
  background-color: ${(p) => p.theme.colors.containerLow};
`;

const StyledTitledCard = styled(Card)`
  flex: 1;
  > div {
    padding: 0;
  }
  h4 {
    margin: 0;
  }
`;

export function TitledCard({
  title,
  children,
}: {
  title: string | React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <StyledTitledCard>
      <TitleBar>
        {typeof title === 'string' ? <H4>{title}</H4> : title}
      </TitleBar>
      <div style={{ padding: '1rem' }}>{children}</div>
    </StyledTitledCard>
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
