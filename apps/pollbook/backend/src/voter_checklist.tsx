import styled from 'styled-components';
import {
  VX_DEFAULT_FONT_FAMILY_DECLARATION,
  DesktopPalette,
} from '@votingworks/ui';
import { createCanvas } from 'canvas';
import JsBarcode from 'jsbarcode';
import { format } from '@votingworks/utils';
import React from 'react';
import { Voter, VoterGroup } from './types';

const ROWS_PER_PAGE = 16;

const grayBackgroundColor = DesktopPalette.Gray10;
const redTextColor = DesktopPalette.Red80;

function generateBarcode(value: string) {
  const canvas = createCanvas(100, 20);
  JsBarcode(canvas, value, {
    format: 'CODE128',
    displayValue: false,
    width: 1,
    height: 20,
    background: 'transparent',
    margin: 0,
  });

  return canvas.toDataURL();
}

const StyledVoterChecklistHeader = styled.div`
  box-sizing: border-box;
  width: 11in; /* Letter paper width */
  display: flex;
  justify-content: space-between;
  padding: 0 0.25in; /* Match page margins */

  font-size: 14px;
  font-family: ${VX_DEFAULT_FONT_FAMILY_DECLARATION};
  h1 {
    margin: 0;
    line-height: 1.2;
    font-size: 1.25em;
  }
  h2 {
    margin: 0;
    font-weight: 400;
    font-size: 1em;
  }
`;

export function VoterChecklistHeader({
  totalCheckIns,
  lastReceiptNumber,
  voterGroup,
}: {
  totalCheckIns: number;
  lastReceiptNumber: number;
  voterGroup: VoterGroup;
}): JSX.Element {
  const letter = voterGroup.existingVoters[0].lastName[0].toLocaleUpperCase();
  return (
    <StyledVoterChecklistHeader>
      <div>
        <h1>Backup Voter Checklist: {letter}</h1>
        <h2>Sample Election &bull; Sample Town</h2>
      </div>
      <div
        style={{
          display: 'grid',
          columnGap: '2em',
          gridTemplateColumns: 'auto auto',
        }}
      >
        <div>Exported At: {format.localeNumericDateAndTime(new Date())}</div>
        <div>
          Page: <span className="pageNumber" />/
          <span className="totalPages" />
        </div>
        <div>Total Check-ins: {totalCheckIns.toLocaleString()}</div>
        <div>Last Receipt: #{lastReceiptNumber}</div>
      </div>
    </StyledVoterChecklistHeader>
  );
}

const VoterTable = styled.table`
  font-size: 14px;
  width: 100%;
  border-collapse: collapse;

  th {
    border-top: 1px solid black;
    border-bottom: 1px solid black;
    text-align: left;
    vertical-align: top;
  }

  th,
  td {
    padding: 0.75em 0.5em;
  }

  tr:nth-child(even) td {
    background-color: ${grayBackgroundColor};
  }

  page-break-after: always;
`;

export function MarginDetails({ voter }: { voter: Voter }): JSX.Element {
  return (
    <React.Fragment>
      {voter.checkIn?.isAbsentee && (
        <span style={{ color: redTextColor }}>A.V.</span>
      )}
    </React.Fragment>
  );
}

export function VoterName({ voter }: { voter: Voter }): JSX.Element {
  return (
    <div>
      {voter.nameChange && (
        <div style={{ color: redTextColor }}>
          {voter.nameChange.lastName}, {voter.nameChange.suffix}{' '}
          {voter.nameChange.firstName} {voter.nameChange.middleName}
        </div>
      )}
      <span
        style={{
          textDecoration: voter.checkIn ? 'line-through' : 'none',
        }}
      >
        {voter.lastName}
      </span>
      , {voter.suffix} {voter.firstName} {voter.middleName}
    </div>
  );
}

export function VoterCheckInDetails({ voter }: { voter: Voter }): JSX.Element {
  return (
    <React.Fragment>
      {voter.checkIn?.identificationMethod.type === 'outOfStateLicense' ? (
        <u>
          <span style={{ color: redTextColor }}>
            {voter.checkIn.identificationMethod.state}
          </span>
        </u>
      ) : (
        '__'
      )}
    </React.Fragment>
  );
}

export function VoterDomicileAddress({ voter }: { voter: Voter }): JSX.Element {
  return (
    <div>
      {voter.addressChange && (
        <div style={{ color: redTextColor }}>
          {voter.addressChange.streetNumber}
          {voter.addressChange.streetSuffix}{' '}
          {voter.addressChange.houseFractionNumber}{' '}
          {voter.addressChange.streetName}{' '}
          {voter.addressChange.apartmentUnitNumber}
          {voter.addressChange.addressLine2 && (
            <div>{voter.addressChange.addressLine2}</div>
          )}
        </div>
      )}
      <div
        style={{
          textDecoration: voter.addressChange ? 'line-through' : 'none',
        }}
      >
        {voter.streetNumber}
        {voter.addressSuffix} {voter.houseFractionNumber} {voter.streetName}{' '}
        {voter.apartmentUnitNumber}
        {voter.addressLine2 && <div>{voter.addressLine2}</div>}
      </div>
    </div>
  );
}

export function VoterChecklistTable({
  voters,
}: {
  voters: Voter[];
}): JSX.Element {
  return (
    <VoterTable>
      <thead>
        <tr>
          <th />
          <th />
          <th>Party</th>
          <th>Voter Name</th>
          <th>OOS&nbsp;DL</th>
          <th>Domicile Address</th>
          <th>Mailing Address</th>
          <th>Dist</th>
          <th>Voter ID</th>
          <th>Barcode</th>
        </tr>
      </thead>
      <tbody>
        {voters.map((voter) => (
          <tr key={voter.voterId}>
            <td>
              <MarginDetails voter={voter} />
            </td>
            <td>{voter.checkIn ? '☑' : '☐'}</td>
            <td>{voter.party}</td>
            <td>
              <VoterName voter={voter} />
            </td>
            <td>
              <VoterCheckInDetails voter={voter} />
            </td>
            <td>
              <VoterDomicileAddress voter={voter} />
            </td>
            <td>
              {voter.mailingStreetNumber}
              {voter.mailingSuffix} {voter.mailingHouseFractionNumber}{' '}
              {voter.mailingStreetName} {voter.mailingApartmentUnitNumber}
              {voter.mailingAddressLine2 && (
                <div>{voter.mailingAddressLine2}</div>
              )}
            </td>
            <td>{voter.district}</td>
            <td>{voter.voterId}</td>
            <td>
              <img src={generateBarcode(voter.voterId)} />
            </td>
          </tr>
        ))}
      </tbody>
    </VoterTable>
  );
}

export function NewRegistrationsVoterChecklistTable({
  voters,
}: {
  voters: Voter[];
}): JSX.Element {
  const emptyRows =
    ROWS_PER_PAGE > voters.length ? ROWS_PER_PAGE - voters.length : 0;
  return (
    <VoterTable>
      <thead>
        <tr>
          <th />
          <th />
          <th>Party</th>
          <th>Voter Name</th>
          <th>OOS&nbsp;DL</th>
          <th>Domicile Address</th>
          <th>Dist</th>
        </tr>
      </thead>
      <tbody>
        {voters.map((voter) => (
          <tr key={voter.voterId}>
            <td>
              <MarginDetails voter={voter} />
            </td>
            <td>{voter.checkIn ? '☑' : '☐'}</td>
            <td>{voter.party}</td>
            <td>
              <VoterName voter={voter} />
            </td>
            <td>
              <VoterCheckInDetails voter={voter} />
            </td>
            <td>
              <VoterDomicileAddress voter={voter} />
            </td>
            <td>{voter.district}</td>
          </tr>
        ))}
        {Array.from({ length: emptyRows }).map((_, index) => (
          <tr key={`empty-${index}`}>
            <td />
            <td> ☐ </td>
            <td />
            <td />
            <td />
            <td />
            <td />
          </tr>
        ))}
      </tbody>
    </VoterTable>
  );
}

export function VoterChecklist({
  voterGroup,
}: {
  voterGroup: VoterGroup;
}): JSX.Element {
  return (
    <React.Fragment>
      <VoterChecklistTable voters={voterGroup.existingVoters} />
      <NewRegistrationsVoterChecklistTable
        voters={voterGroup.newRegistrations}
      />
    </React.Fragment>
  );
}
