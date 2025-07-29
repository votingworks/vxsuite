import styled from 'styled-components';
import { throwIllegalValue } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { IconName, Icons } from '@votingworks/ui';
import { Election } from '@votingworks/types';
import { Voter, VoterCheckIn } from '../types';

export const StyledReceipt = styled.div``;

export function ReceiptIcon({ icon }: { icon: IconName }): JSX.Element {
  const IconComponent = Icons[icon];
  return <IconComponent style={{ fontSize: '3rem', marginRight: '2px' }} />;
}

export function VoterName({ voter }: { voter: Voter }): JSX.Element {
  const name = voter.nameChange ?? voter;
  return (
    <span>
      {name.lastName}, {name.firstName} {name.middleName} {name.suffix}
    </span>
  );
}

export function prependSpaceIfNeeded(text?: string): string {
  if (!text) {
    return '';
  }
  return ` ${text}`;
}

function getPrecinctName(election: Election, precinctId: string): string {
  const precinct = election.precincts.find((p) => p.id === precinctId);
  return precinct?.name || precinctId;
}

export function VoterAddress({
  voter,
  election,
}: {
  voter: Voter;
  election: Election;
}): JSX.Element {
  if (voter.addressChange) {
    const address = voter.addressChange;
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
        {election.precincts.length > 1 && (
          <div>{`Precinct: ${getPrecinctName(
            election,
            address.precinct
          )}`}</div>
        )}
      </div>
    );
  }
  return (
    <div>
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
      {election.precincts.length > 1 && (
        <div>{`Precinct: ${getPrecinctName(election, voter.precinct)}`}</div>
      )}
    </div>
  );
}

export function VoterMailingAddress({ voter }: { voter: Voter }): JSX.Element {
  if (voter.mailingAddressChange) {
    const mailingAddress = voter.mailingAddressChange;
    return (
      <div>
        <div>
          {mailingAddress.mailingStreetNumber}
          {prependSpaceIfNeeded(mailingAddress.mailingHouseFractionNumber)}
          {mailingAddress.mailingSuffix} {mailingAddress.mailingStreetName}
          {prependSpaceIfNeeded(mailingAddress.mailingApartmentUnitNumber)}
        </div>
        {mailingAddress.mailingAddressLine2 === '' ? null : (
          <div>{mailingAddress.mailingAddressLine2}</div>
        )}
        <div>
          {mailingAddress.mailingCityTown}, {mailingAddress.mailingState}{' '}
          {mailingAddress.mailingZip5}
        </div>
      </div>
    );
  }
  const {
    mailingStreetNumber,
    mailingSuffix,
    mailingHouseFractionNumber,
    mailingStreetName,
    mailingApartmentUnitNumber,
    mailingAddressLine2,
    mailingCityTown,
    mailingState,
    mailingZip5,
  } = voter;

  const allEmpty =
    !mailingStreetNumber &&
    !mailingSuffix &&
    !mailingHouseFractionNumber &&
    !mailingStreetName &&
    !mailingApartmentUnitNumber &&
    !mailingAddressLine2 &&
    !mailingCityTown &&
    !mailingState &&
    !mailingZip5;

  if (allEmpty) {
    return <div>None</div>;
  }
  return (
    <div>
      <div>
        {voter.mailingStreetNumber}
        {prependSpaceIfNeeded(voter.mailingHouseFractionNumber)}
        {mailingSuffix} {voter.mailingStreetName}
        {prependSpaceIfNeeded(voter.mailingApartmentUnitNumber)}
      </div>
      {voter.mailingAddressLine2 === '' ? null : (
        <div>{voter.mailingAddressLine2}</div>
      )}
      <div>
        {voter.mailingCityTown}, {voter.mailingState} {voter.mailingZip5}
      </div>
    </div>
  );
}

export function PartyName({ party }: { party: 'DEM' | 'REP' | 'UND' }): string {
  switch (party) {
    case 'DEM':
      return 'Democratic';
    case 'REP':
      return 'Republican';
    case 'UND':
      return 'Undeclared';
    /* istanbul ignore next: Compile-time check for completeness @preserve */
    default: {
      throwIllegalValue(party);
    }
  }
}

export function IdentificationMethod({
  checkIn,
}: {
  checkIn: VoterCheckIn;
}): JSX.Element | null {
  if (checkIn.isAbsentee) return null;
  const { identificationMethod } = checkIn;
  switch (identificationMethod.type) {
    case 'default':
      return null;
    case 'outOfStateLicense':
      return <div>OOS DL ({identificationMethod.state})</div>;
    default: {
      /* istanbul ignore next: Compile-time check for completeness @preserve */
      throwIllegalValue(identificationMethod);
    }
  }
}

export interface ReceiptMetadataProps {
  machineId: string;
  receiptNumber: number;
  election: Election;
}

export function ReceiptMetadata({
  receiptNumber,
  election,
  machineId,
}: ReceiptMetadataProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '1rem',
        marginTop: '0.5rem',
        paddingTop: '0.25rem',
        borderTop: '1px solid black',
        fontSize: '0.75rem',
      }}
    >
      <div>
        {election.title}
        <br />
        {format.localeLongDate(
          election.date.toMidnightDatetimeWithSystemTimezone()
        )}
      </div>
      <div>
        {machineId}
        <br />
        Receipt&nbsp;#{receiptNumber}
      </div>
    </div>
  );
}
