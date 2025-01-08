import styled from 'styled-components';
import {
  VX_DEFAULT_FONT_FAMILY_DECLARATION,
  DesktopPalette,
} from '@votingworks/ui';
import { createCanvas } from 'canvas';
import JsBarcode from 'jsbarcode';
import { Voter } from './types';

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
}: {
  totalCheckIns: number;
}): JSX.Element {
  return (
    <StyledVoterChecklistHeader>
      <div>
        <h1>Backup Voter Checklist</h1>
        <h2>Sample Election &bull; Sample Town</h2>
      </div>
      <div
        style={{
          display: 'grid',
          columnGap: '2em',
          gridTemplateColumns: 'auto auto',
        }}
      >
        <div>
          Exported At:{' '}
          {new Intl.DateTimeFormat('en', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
          }).format(new Date())}
        </div>
        <div>
          Page: <span className="pageNumber" />/
          <span className="totalPages" />
        </div>
        <div>Total Check-ins: {totalCheckIns.toLocaleString()}</div>
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
          <th>Party</th>
          <th>Voter Name</th>
          <th>CVA</th>
          <th>OOS&nbsp;DL</th>
          <th>PR</th>
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
            <td>{voter.checkIn ? '☑' : '☐'}</td>
            <td>{voter.party}</td>
            <td>
              <span
                style={{
                  textDecoration: voter.checkIn ? 'line-through' : 'none',
                }}
              >
                {voter.lastName}
              </span>
              , {voter.suffix} {voter.firstName} {voter.middleName}
            </td>
            <td>
              {voter.checkIn?.identificationMethod.type ===
              'challengedVoterAffidavit'
                ? '☑'
                : '☐'}
            </td>
            <td>
              {voter.checkIn?.identificationMethod.type ===
              'outOfStateDriversLicense' ? (
                <u>
                  <span style={{ color: redTextColor }}>
                    {voter.checkIn.identificationMethod.state}
                  </span>
                </u>
              ) : (
                '__'
              )}
            </td>
            <td>
              {voter.checkIn?.identificationMethod.type ===
              'personalRecognizance' ? (
                <span style={{ color: redTextColor }}>
                  {
                    {
                      supervisor: 'S',
                      moderator: 'M',
                      cityClerk: 'C',
                    }[voter.checkIn.identificationMethod.recognizer]
                  }
                </span>
              ) : (
                '__'
              )}
            </td>
            <td>
              {voter.streetNumber} {voter.addressSuffix}{' '}
              {voter.houseFractionNumber} {voter.streetName}{' '}
              {voter.apartmentUnitNumber}
            </td>
            <td>
              {voter.mailingStreetNumber} {voter.mailingSuffix}{' '}
              {voter.mailingHouseFractionNumber} {voter.mailingStreetName}{' '}
              {voter.mailingApartmentUnitNumber}
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

export function VoterChecklist({
  voterGroups,
}: {
  voterGroups: Array<Voter[]>;
}): JSX.Element {
  return (
    <>
      {voterGroups.map((voters, index) => (
        <VoterChecklistTable key={index} voters={voters} />
      ))}
    </>
  );
}
