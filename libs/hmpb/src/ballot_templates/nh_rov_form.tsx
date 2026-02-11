import React from 'react';
import { find } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { ballotPaperDimensions, Election, PartyId } from '@votingworks/types';
import { format } from '@votingworks/utils';
import styled from 'styled-components';
import { SignatureLine, SignatureX } from '@votingworks/ui';
import { RenderDocument, Renderer } from '../renderer';
import { BaseStyles } from '../base_styles';
import { Colors, Page, pageMarginsInches } from '../ballot_components';

const Box = styled.div`
  border: 1px solid ${Colors.DARKER_GRAY};
  padding: 0.5rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
`;

const ContestTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  // border: 1px solid ${Colors.DARKER_GRAY};
  break-inside: avoid;

  th {
    text-align: left;
    font-weight: normal;
    padding: 0.5rem;
    // border: 1px solid ${Colors.DARK_GRAY};
    background-color: ${Colors.LIGHT_GRAY};
  }

  tr {
    height: 2rem;
    &:first-child td {
      border-top: none;
    }
    &:last-child td {
      border-bottom: none;
    }
  }

  td {
    border: 1px solid ${Colors.DARK_GRAY};
    padding: 0.25rem 0.5rem;
  }

  td:first-child {
    border-left: none;
    font-weight: 500;
  }

  td:last-child {
    width: 6rem;
    border-right: none;
  }
`;

function Field({ label }: { label: string }): JSX.Element {
  return (
    <div
      style={{
        border: `1px solid ${Colors.DARKER_GRAY}`,
        paddingBottom: '2.5rem',
        minWidth: '10rem',
        backgroundColor: 'white',
      }}
    >
      <div
        style={{
          padding: '0.25rem',
          backgroundColor: Colors.LIGHT_GRAY,
          fontWeight: '500',
          fontSize: '0.8rem',
        }}
      >
        {label}
      </div>
    </div>
  );
}

interface NhRovFormProps {
  election: Election;
  partyId?: PartyId;
}

export function NhRovForm({ election, partyId }: NhRovFormProps): JSX.Element {
  const party = partyId
    ? find(election.parties, (p) => p.id === partyId)
    : undefined;
  const electionDate = format.localeLongDate(
    election.date.toMidnightDatetimeWithSystemTimezone()
  );
  const dimensions = ballotPaperDimensions(election.ballotLayout.paperSize);
  return (
    <Page pageNumber={1} dimensions={dimensions} margins={pageMarginsInches}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          padding: '0.5rem',
        }}
      >
        <Header>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <img
              src={`data:image/svg+xml;base64,${Buffer.from(
                election.seal
              ).toString('base64')}`}
              style={{ height: '5rem' }}
            />
            <div>
              <h1>Return of Votes</h1>
              <h2>
                {election.county.name}, {election.state}
              </h2>
              {party && <h2>{party.fullName}</h2>}
              <h4>{election.title}</h4>
              <h4>{electionDate}</h4>
            </div>
          </div>
          <div
            style={{
              // width: '15rem',
              fontSize: '0.8rem',
              border: '1px solid black',
              padding: '0.5rem',
            }}
          >
            <div>
              <strong>Vote {electionDate}. A true copy attest:</strong>
            </div>
            <SignatureLine>
              <SignatureX />
            </SignatureLine>
            <div>Signature of Town/City Clerk</div>
            {/* <div style={{ fontSize: '0.8rem' }}>
              One copy to be Returned ELECTION NIGHT to the Secretary of State
            </div> */}
          </div>
        </Header>
        <Box style={{ fontSize: '0.8rem', backgroundColor: Colors.LIGHT_GRAY }}>
          <strong>Instructions:</strong> Record the Ballots Cast information.
          Record the number of votes received by each candidate in the
          appropriate space to the right of each candidate’s name. If a
          candidate printed on the ballot received write-in votes in this
          party’s primary, include the votes by write-in by adding those
          write-in votes into the total votes for that candidate on this return.
          Record the total Undervotes and total Overvotes for each race.{' '}
          <strong>
            One copy to be returned ELECTION NIGHT to the Secretary of State.
          </strong>
        </Box>
        <Box style={{ padding: 0 }}>
          <h4
            style={{
              backgroundColor: Colors.LIGHT_GRAY,
              padding: '0.5rem',
              margin: 0,
            }}
          >
            Ballots Cast
          </h4>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '0.5rem',
              alignItems: 'center',
              padding: '0.5rem',
            }}
          >
            <Field label="Election Day Ballots" />
            <h2>+</h2>
            <Field label="Absentee Ballots" />
            <h2>=</h2>
            <Field label="Total Ballots Cast" />
            <div
              style={{
                borderLeft: `1px solid ${Colors.DARK_GRAY}`,
                height: '4rem',
              }}
            />
            <Field label="Federal Office Only Ballots" />
          </div>
        </Box>
        <div
          style={{
            columns: 3,
            columnGap: '0.5rem',
          }}
        >
          {election.contests
            .filter(
              (contest) =>
                !partyId ||
                contest.type !== 'candidate' ||
                contest.partyId === partyId
            )
            .map((contest) => (
              <div
                key={contest.id}
                style={{
                  marginBottom: '0.5rem',
                  border: `1px solid ${Colors.DARKER_GRAY}`,
                }}
              >
                <ContestTable style={{ fontSize: '0.8rem' }}>
                  <tbody>
                    <thead>
                      <th colSpan={2}>
                        <h4 style={{ fontSize: '1rem' }}>{contest.title}</h4>
                        {contest.type === 'candidate' && (
                          <div>
                            Vote for {contest.seats}
                            {contest.type === 'candidate' &&
                              contest.termDescription && (
                                <span> • {contest.termDescription}</span>
                              )}
                          </div>
                        )}
                      </th>
                    </thead>
                    {contest.type === 'candidate' &&
                      contest.candidates.map((candidate) => (
                        <tr key={candidate.id}>
                          <td>{candidate.name}</td>
                          <td></td>
                        </tr>
                      ))}
                    {contest.type === 'yesno' && (
                      <>
                        <tr>
                          <td>{contest.yesOption.label}</td>
                          <td></td>
                        </tr>
                        <tr>
                          <td>{contest.noOption.label}</td>
                          <td></td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <td
                        colSpan={2}
                        style={{
                          fontStyle: 'italic',
                          fontWeight: 'normal',
                        }}
                      >
                        <div style={{ display: 'flex', width: '100%' }}>
                          <div style={{ flex: 1 }}>Undervotes:</div>
                          <div style={{ flex: 1 }}>Overvotes:</div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </ContestTable>
              </div>
            ))}
        </div>
      </div>
    </Page>
  );
}

export async function render(
  renderer: Renderer,
  props: NhRovFormProps
): Promise<RenderDocument> {
  const scratchpad = await renderer.createScratchpad(<BaseStyles />);
  const document = scratchpad.convertToDocument();
  await document.setContent('body', <NhRovForm {...props} />);
  return document;
}
