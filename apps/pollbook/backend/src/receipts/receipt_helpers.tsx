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
      {name.firstName} {name.middleName} {name.lastName} {name.suffix}
    </span>
  );
}

export function VoterAddress({ voter }: { voter: Voter }): JSX.Element {
  if (voter.addressChange) {
    const address = voter.addressChange;
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
    default: {
      /* istanbul ignore next: Compile-time check for completeness @preserve */
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
