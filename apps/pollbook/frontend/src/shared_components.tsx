import type {
  Voter,
  VoterAddressChange,
  VoterMailingAddressChange,
} from '@votingworks/pollbook-backend';
import { Callout, Card, H4 } from '@votingworks/ui';
import styled from 'styled-components';
import { throwIllegalValue } from '@votingworks/basics';
import { Election } from '@votingworks/types';
import { Column } from './layout';

export function prependSpaceIfNeeded(text?: string): string {
  if (!text) {
    return '';
  }
  return ` ${text}`;
}

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
        {prependSpaceIfNeeded(voter.houseFractionNumber)}
        {voter.addressSuffix} {voter.streetName}
        {prependSpaceIfNeeded(voter.apartmentUnitNumber)}
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
        {prependSpaceIfNeeded(address.houseFractionNumber)}
        {address.streetSuffix} {address.streetName}
        {prependSpaceIfNeeded(address.apartmentUnitNumber)}
      </div>
      {address.addressLine2 === '' ? null : <div>{address.addressLine2}</div>}
      <div>
        {address.city}, {address.state} {address.zipCode}
      </div>
    </div>
  );
}

export function MailingAddressChange({
  address,
}: {
  address: VoterMailingAddressChange;
}): JSX.Element {
  return (
    <div>
      <div>
        {address.mailingStreetNumber}
        {prependSpaceIfNeeded(address.mailingHouseFractionNumber)}
        {address.mailingSuffix} {address.mailingStreetName}
        {prependSpaceIfNeeded(address.mailingApartmentUnitNumber)}
      </div>
      {address.mailingAddressLine2 === '' ? null : (
        <div>{address.mailingAddressLine2}</div>
      )}
      <div>
        {address.mailingCityTown}, {address.mailingState} {address.mailingZip5}
        {address.mailingZip4 ? `-${address.mailingZip4}` : ''}
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
  border-top-left-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border-top-right-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
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

export function PrecinctName({
  precinctId,
  election,
}: {
  precinctId: string;
  election: Election;
}): string {
  const precinct = election.precincts.find((p) => p.id === precinctId);
  if (!precinct) {
    throw new Error(`Precinct with ID ${precinctId} not found in election.`);
  }
  return precinct.name;
}

/**
 * Checks if a voter has a non-empty mailing address
 */
export function hasMailingAddress(voter: Voter): boolean {
  return !!(
    voter.mailingStreetNumber?.trim() ||
    voter.mailingStreetName?.trim() ||
    voter.mailingCityTown?.trim() ||
    voter.mailingZip5?.trim()
  );
}

export function VoterMailingAddress({
  voter,
  style,
}: {
  voter: Voter;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <div style={style}>
      <div>
        {voter.mailingStreetNumber}
        {prependSpaceIfNeeded(voter.mailingHouseFractionNumber)}
        {voter.mailingSuffix} {voter.mailingStreetName}
        {prependSpaceIfNeeded(voter.mailingApartmentUnitNumber)}
      </div>
      {voter.mailingAddressLine2 === '' ? null : (
        <div>{voter.mailingAddressLine2}</div>
      )}
      <div>
        {voter.mailingCityTown}, {voter.mailingState} {voter.mailingZip5}
        {voter.mailingZip4 ? `-${voter.mailingZip4}` : ''}
      </div>
    </div>
  );
}
