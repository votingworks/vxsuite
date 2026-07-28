import React from 'react';
import { assert, find } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  ballotPaperDimensions,
  BallotStyle,
  Candidate,
  CandidateContest,
  Election,
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
  getPrecinctById,
  HmpbBallotPaperSize,
  PartyId,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import styled from 'styled-components';
import { CandidatePartyList } from '@votingworks/ui';
import { RenderDocument, Renderer } from '../renderer';
import { BaseStyles } from '../base_styles';
import {
  Colors,
  Page,
  PAGE_CLASS,
  pageMarginsInches,
} from '../ballot_components';
import { ColorTints } from './nh_state_primary_ballot_template';

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
`;

const SignatureLine = styled.div`
  flex: 1;
  margin-top: 2em;
  border-bottom: 1px solid #000;
`;

const SvgContainer = styled.div`
  width: 1.2em;
  height: 1.2em;
  margin-left: 2px;

  svg {
    width: 100%;
    height: 100%;
  }
`;

function SignatureX(): JSX.Element {
  return (
    <SvgContainer>
      <svg
        width="50"
        height="40"
        viewBox="0 0 50 40"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          id="forwardslash"
          width="10"
          height="48"
          x="15"
          y="-4"
          transform="rotate(-45 20 20)"
          fill="#000000"
        />
        <rect
          id="backslash"
          width="10"
          height="48"
          x="15"
          y="-4"
          transform="rotate(45 20 20)"
          fill="black"
        />
      </svg>
    </SvgContainer>
  );
}

const ContestTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  // border: 1px solid ${Colors.DARKER_GRAY};
  break-inside: avoid;

  th {
    text-align: left;
    font-weight: normal;
    padding: 0.375rem;
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
    padding: 0.25rem 0.375rem;
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

function Field({ label }: { label: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        minWidth: '8rem',
        backgroundColor: 'white',
        border: `1px solid ${Colors.DARKER_GRAY}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontWeight: '500',
          fontSize: '0.8rem',
          padding: '0.125rem 0.25rem',
          borderBottom: `1px solid ${Colors.DARK_GRAY}`,
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, minHeight: '1.5rem' }} />
    </div>
  );
}

function PageFooter({
  pageNumber,
  totalPages,
}: {
  pageNumber: number;
  totalPages: number;
}): JSX.Element {
  // Pinned to the page's bottom-right rather than flowing after the content, so
  // the page number always renders even when a dense party ballot fills the
  // tally page to the bottom (otherwise the trailing footer gets clipped off).
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '0.375rem',
        right: '0.375rem',
        fontSize: '0.8rem',
      }}
    >
      Page {pageNumber} of {totalPages}
    </div>
  );
}

interface NhRovFormProps {
  election: Election;
  ballotStyle: BallotStyle;
  /**
   * Sheet size for both the tally and write-in pages. Defaults to 8.5x17,
   * the smallest sheet on which every NH ballot style's tally fits without
   * clipping a contest (Legal drops a contest on the densest ~9 forms).
   */
  paperSize?: HmpbBallotPaperSize;
  /**
   * Blank write-in slots per contest on the write-in page, laid out in two
   * columns. Defaults to 8 (the most that fits on 8.5x17).
   */
  writeInBlankRows?: number;
  /**
   * Write-in slot layout:
   * - 'split' (default): two slots per row, each split into a name box (3/4)
   *   and a count box (1/4).
   * - 'open': one big empty slot per row, no internal divisions.
   */
  writeInSlotStyle?: 'split' | 'open';
}

// Ward name for warded jurisdictions (the precinct differs from the town);
// undefined for unwarded towns where the precinct is the town itself.
function getWardName(
  election: Election,
  ballotStyle: BallotStyle
): string | undefined {
  const precinct = getPrecinctById({
    election,
    precinctId: ballotStyle.precincts[0],
  });
  return precinct && precinct.name !== election.jurisdiction.name
    ? precinct.name
    : undefined;
}

function partyColorTint(
  partyName: string
): keyof typeof ColorTints | undefined {
  if (/democrat/i.test(partyName)) return 'BLUE';
  if (/republican/i.test(partyName)) return 'RED';
  return undefined;
}

function contestTitleWithForPrefix(title: string): string {
  return title.startsWith('For ') ? title : `For ${title}`;
}

const SEATS_WORD: Record<number, string> = {
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
};

function cleanCandidateName(name: string): JSX.Element {
  const parts = name.split(/<br\/>/g);
  if (parts.length === 1) return <span>{name}</span>;
  return (
    <span>
      {parts.map((part, i) => (
        <React.Fragment key={`part-${i}`}>
          {i > 0 && <br />}
          {part}
        </React.Fragment>
      ))}
    </span>
  );
}

function mergeCrossEndorsedCandidates(
  candidates: readonly Candidate[]
): Candidate[] {
  const groups = new Map<string, Candidate>();
  for (const c of candidates) {
    const existing = groups.get(c.name);
    if (existing) {
      const merged: PartyId[] = [...(existing.partyIds ?? [])];
      for (const pid of c.partyIds ?? []) {
        if (!merged.includes(pid)) merged.push(pid);
      }
      groups.set(c.name, { ...existing, partyIds: merged });
    } else {
      groups.set(c.name, c);
    }
  }
  return [...groups.values()];
}

const PRIMARY_INSTRUCTIONS =
  'Record the number of votes received by each candidate in the appropriate ' +
  "space to the right of each candidate's name. If a candidate printed on " +
  "the ballot received write-in votes in this party's primary, include the " +
  'votes by write-in by adding those write-in votes into the total votes ' +
  'for that candidate on this return. Record the total Undervotes and total ' +
  'Overvotes for each race. Record the Ballots Cast information at the top ' +
  'of the return.';

const GENERAL_INSTRUCTIONS =
  'Record the number of votes received by each candidate or question in the ' +
  'appropriate space. Record the total Undervotes and total Overvotes for ' +
  'each race or question. Record the Ballots Cast information at the top ' +
  'of the return. The Clerk must verify that the numbers entered accurately ' +
  'reflect the vote counts determined by the moderator and sign the form. ' +
  'Return on ELECTION NIGHT to the Secretary of State.';

export function NhRovForm({
  election,
  ballotStyle,
  totalPages,
  paperSize = HmpbBallotPaperSize.Custom17,
}: NhRovFormProps & { totalPages: number }): JSX.Element {
  const { partyId } = ballotStyle;
  const party = partyId
    ? find(election.parties, (p) => p.id === partyId)
    : undefined;
  const wardName = getWardName(election, ballotStyle);
  const contests = getContests({ election, ballotStyle });
  const electionDate = format.localeLongDate(
    election.date.toMidnightDatetimeWithSystemTimezone()
  );
  const dimensions = ballotPaperDimensions(paperSize);
  const colorTint = party ? partyColorTint(party.fullName) : undefined;
  const headerBgColor = colorTint ? ColorTints[colorTint] : Colors.LIGHT_GRAY;
  const instructions = partyId ? PRIMARY_INSTRUCTIONS : GENERAL_INSTRUCTIONS;
  const ballotsCastPrefix = party ? `${party.name} ` : '';
  return (
    <Page pageNumber={1} dimensions={dimensions} margins={pageMarginsInches}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.375rem',
          padding: '0.375rem',
          height: '100%',
          position: 'relative',
        }}
      >
        <div
          style={{
            border: `1px solid ${Colors.DARKER_GRAY}`,
            backgroundColor: headerBgColor,
          }}
        >
          <Header style={{ padding: '0.5rem' }}>
            <div
              style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}
            >
              <img
                src={`data:image/svg+xml;base64,${Buffer.from(
                  election.seal
                ).toString('base64')}`}
                style={{ height: '5rem' }}
              />
              <div>
                <h1>Return of Votes</h1>
                <h2>
                  {election.jurisdiction.name}
                  {wardName ? ` ${wardName}` : ''}, {election.state}
                </h2>
                {party && <h2>{party.name}</h2>}
                <h4>{election.title}</h4>
                <h4>{electionDate}</h4>
              </div>
            </div>
            <div
              style={{
                fontSize: '0.8rem',
                border: '1px solid black',
                backgroundColor: 'white',
              }}
            >
              <div style={{ padding: '0.25rem 0.375rem' }}>
                <strong>Vote {electionDate}. A true copy attest:</strong>
              </div>
              <div
                style={{
                  borderTop: `1px solid ${Colors.DARK_GRAY}`,
                  borderBottom: `1px solid ${Colors.DARK_GRAY}`,
                  padding: '0.25rem 0.375rem',
                }}
              >
                <SignatureLine>
                  <SignatureX />
                </SignatureLine>
                <div>Signature of Town/City Clerk</div>
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  padding: '0.25rem 0.375rem',
                }}
              >
                One copy to be returned <strong>ELECTION NIGHT</strong> to the
                Secretary of State
              </div>
            </div>
          </Header>
          <div
            style={{
              fontSize: '0.8rem',
              padding: '0.375rem',
              borderTop: `1px solid ${Colors.DARKER_GRAY}`,
            }}
          >
            <strong>Instructions:</strong> {instructions}
          </div>
        </div>
        <div
          style={{
            border: `1px solid ${Colors.DARKER_GRAY}`,
            backgroundColor: headerBgColor,
          }}
        >
          <h4
            style={{
              padding: '0.375rem 0.5rem',
              borderBottom: `1px solid ${Colors.DARKER_GRAY}`,
            }}
          >
            Ballots Cast
          </h4>
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'stretch',
              padding: '0.5rem',
            }}
          >
            <Field
              label={<>{ballotsCastPrefix}Election Day Ballots&nbsp;Cast</>}
            />
            <h2 style={{ alignSelf: 'center' }}>+</h2>
            <Field label={<>{ballotsCastPrefix}Absentee Ballots&nbsp;Cast</>} />
            <h2 style={{ alignSelf: 'center' }}>=</h2>
            <Field label={<>{ballotsCastPrefix}Total Ballots&nbsp;Cast</>} />
            <div
              style={{
                borderLeft: '1px solid black',
              }}
            />
            <Field
              label={
                <>{ballotsCastPrefix}Federal Office Only Ballots&nbsp;Cast</>
              }
            />
          </div>
        </div>
        <div
          style={{
            columns: 3,
            columnGap: '0.5rem',
          }}
        >
          {contests.map((contest) => (
            <div
              key={contest.id}
              data-rov-contest="tally"
              style={{
                marginBottom: '0.375rem',
                border: `1px solid ${Colors.DARKER_GRAY}`,
              }}
            >
              <ContestTable style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th
                      colSpan={2}
                      style={
                        colorTint
                          ? { backgroundColor: ColorTints[colorTint] }
                          : undefined
                      }
                    >
                      <h4 style={{ fontSize: '1rem' }}>
                        {contestTitleWithForPrefix(contest.title)}
                      </h4>
                      {contest.type === 'candidate' && (
                        <div>
                          {contest.seats === 1 ? (
                            <>Vote for not more than 1</>
                          ) : (
                            <>
                              Vote for up to {contest.seats};{' '}
                              {SEATS_WORD[contest.seats]} will be elected
                            </>
                          )}
                          {contest.termDescription && (
                            <span> • {contest.termDescription}</span>
                          )}
                        </div>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contest.type === 'candidate' &&
                    mergeCrossEndorsedCandidates(
                      getOrderedCandidatesForContestInBallotStyle({
                        contest,
                        ballotStyle,
                      })
                    ).map((candidate) => (
                      <tr key={candidate.id}>
                        <td>
                          {cleanCandidateName(candidate.name)}
                          {!partyId &&
                            (candidate.partyIds?.length ?? 0) > 0 && (
                              <div style={{ fontWeight: '400' }}>
                                <CandidatePartyList
                                  candidate={candidate}
                                  electionParties={election.parties}
                                />
                              </div>
                            )}
                        </td>
                        <td></td>
                      </tr>
                    ))}
                  {contest.type === 'yesno' &&
                    contest.options.map((option) => (
                      <tr key={option.id}>
                        <td>{option.label}</td>
                        <td></td>
                      </tr>
                    ))}
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
        <PageFooter pageNumber={1} totalPages={totalPages} />
      </div>
    </Page>
  );
}

// Write-in page constants. Eight blank slots per contest (in two columns) keeps
// the whole write-in summary on a single page (one sheet, front and back with
// the tally form) even for the largest NH ballot styles on 8.5x17; clerks can
// attach additional sheets per the instructions if a race needs more room.
const WRITE_IN_BLANK_ROWS = 8;

function primaryWriteInInstructions(partyName: string): JSX.Element {
  const upperParty = partyName.toUpperCase();
  return (
    <span>
      Record write-in votes only -{' '}
      <strong>from {upperParty} ballots only</strong>. Please indicate names of
      all write-ins (regardless of whether they are known to you) and the number
      of votes received by each in the appropriate space. Use additional sheets
      if necessary. The moderator shall determine the number of votes for each
      person and the clerk must verify the accuracy of the number entered for
      &ldquo;Total write-in votes&rdquo; reported for each race on the write-in
      Return of Votes and sign the form. Return on ELECTION NIGHT to the
      Secretary of State. If candidates printed on the{' '}
      <strong>{upperParty}</strong> ballot receive write-in votes on the{' '}
      {partyName} ballot, add votes by write-in to the total votes by marked
      oval, located beside where that candidate&rsquo;s name is pre-printed on
      the first page of the Return of Votes. <strong>Do not</strong> include
      them on this page. <strong>DO NOT</strong> use hash marks. Use numbers to
      record write-in votes, i.e. 1, 2, 3, 4.
    </span>
  );
}

const GENERAL_WRITE_IN_INSTRUCTIONS = (
  <span>
    <strong>(1)</strong> Record all write-in votes. <strong>(2)</strong> Do not
    include write-ins for candidates printed on the ballot, include these votes
    with the candidate&rsquo;s total votes on the first page.{' '}
    <strong>(3)</strong> Do not include votes where the bubble was filled-in
    with no person&rsquo;s name. These are Undervotes and should be included in
    the Undervote totals on the first page. <strong>(4)</strong> Attach
    additional pages if necessary. Each additional page must be numbered and
    signed by the Clerk. Print &ldquo;See Attached, Page___&rdquo; and the page
    number for any race with additional page(s) of write-ins.{' '}
    <strong>(5)</strong> Do not use hash marks. Use numbers to record write-in
    votes, i.e. 1 or 5. <strong>(6)</strong> Total all write-in votes for each
    race. <strong>(7)</strong> The Clerk must sign the return.
  </span>
);

// Write-in slots are laid out in two columns within each contest (a 4-column
// grid: name/count, name/count) so each contest box is about half as tall as a
// single stacked column of slots. Border hierarchy: a darker border outlines
// the contest, divides the two slot columns, and stacks the slots; a lighter
// border separates the number box from the name box within each slot.
const WriteInContestTable = styled.table`
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  break-inside: avoid;

  th {
    text-align: left;
    font-weight: bold;
    padding: 0.25rem 0.375rem;
    background-color: ${Colors.LIGHT_GRAY};
    font-size: 0.9rem;
  }

  tr {
    height: 1.35rem;
  }

  td {
    padding: 0.125rem 0.375rem;
    /* Dark separator between stacked slots, matching the contest outline.
       'double' (not 'solid') so this border wins border-collapse conflict
       resolution against the lighter vertical dividers and renders unbroken
       through the intersections. At 1px it still draws as a single line. */
    border-top: 1px double ${Colors.DARKER_GRAY};
  }

  /* The vote-count box: the only light border -- it separates the count box
     from its name box within a slot. Its width (one quarter of each slot) is
     set on the <colgroup>. */
  td.count {
    border-left: 1px solid ${Colors.DARK_GRAY};
  }

  /* The second slot column: a dark divider separates the two slot columns,
     matching the contest outline. */
  td.slot-divider {
    border-left: 1px solid ${Colors.DARKER_GRAY};
  }

  tr.total td {
    font-weight: bold;
    font-size: 0.8rem;
    background-color: ${Colors.LIGHT_GRAY};
  }
`;

// 'open' slot layout: one big empty slot per row, no internal divisions -- just
// dark row separators matching the contest outline.
const OpenWriteInContestTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  break-inside: avoid;

  th {
    text-align: left;
    font-weight: bold;
    padding: 0.25rem 0.375rem;
    background-color: ${Colors.LIGHT_GRAY};
    font-size: 0.9rem;
  }

  tr {
    height: 1.35rem;
  }

  td {
    padding: 0.125rem 0.375rem;
    border-top: 1px solid ${Colors.INVERSE_GRAY};
  }

  tr.total td {
    font-weight: bold;
    font-size: 0.8rem;
    background-color: ${Colors.LIGHT_GRAY};
  }
`;

function WriteInContest({
  title,
  headerColor,
  blankRows,
  slotStyle,
}: {
  title: string;
  headerColor?: string;
  blankRows: number;
  slotStyle: 'split' | 'open';
}): JSX.Element {
  const titleText = contestTitleWithForPrefix(title);
  const headerBg = headerColor ? { backgroundColor: headerColor } : undefined;
  return (
    <div
      data-rov-contest="write-in"
      style={{
        marginBottom: '0.375rem',
        border: `1px solid ${Colors.DARKER_GRAY}`,
      }}
    >
      {slotStyle === 'open' ? (
        <OpenWriteInContestTable>
          <tbody>
            <tr>
              <th style={headerBg}>{titleText}</th>
            </tr>
            {Array.from({ length: blankRows }, (_, r) => (
              <tr key={`row-${r}`}>
                <td />
              </tr>
            ))}
            <tr className="total">
              <td>Total Write-In Votes:</td>
            </tr>
          </tbody>
        </OpenWriteInContestTable>
      ) : (
        <WriteInContestTable>
          {/* Each slot: name box (3/4) + count box (1/4); two slots per row. */}
          <colgroup>
            <col style={{ width: '37.5%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '37.5%' }} />
            <col style={{ width: '12.5%' }} />
          </colgroup>
          <tbody>
            <tr>
              <th colSpan={4} style={headerBg}>
                {titleText}
              </th>
            </tr>
            {Array.from({ length: Math.ceil(blankRows / 2) }, (_, r) => (
              <tr key={`row-${r}`}>
                <td />
                <td className="count" />
                <td className="slot-divider" />
                <td className="count" />
              </tr>
            ))}
            <tr className="total">
              <td colSpan={4}>Total Write-In Votes:</td>
            </tr>
          </tbody>
        </WriteInContestTable>
      )}
    </div>
  );
}

// Split contests into pages. First page has less space due to header +
// attestation, continuation pages have more room.
// Sized so every NH ballot style's write-in contests fit on a single page in the
// 3-column layout (the largest has 17). If a future style exceeds this, the
// summary spills to a continuation page rather than clipping.
const CONTESTS_PER_FIRST_PAGE = 21;
const CONTESTS_PER_CONTINUATION_PAGE = 21;

function splitContestsIntoPages(
  contests: CandidateContest[]
): Array<CandidateContest[]> {
  const pages: Array<CandidateContest[]> = [];
  let remaining = [...contests];

  const firstPageCount = Math.min(CONTESTS_PER_FIRST_PAGE, remaining.length);
  pages.push(remaining.slice(0, firstPageCount));
  remaining = remaining.slice(firstPageCount);

  while (remaining.length > 0) {
    const pageCount = Math.min(
      CONTESTS_PER_CONTINUATION_PAGE,
      remaining.length
    );
    pages.push(remaining.slice(0, pageCount));
    remaining = remaining.slice(pageCount);
  }

  return pages;
}

function getWriteInContests(
  election: Election,
  ballotStyle: BallotStyle
): CandidateContest[] {
  return getContests({ election, ballotStyle }).filter(
    (contest): contest is CandidateContest =>
      contest.type === 'candidate' && contest.allowWriteIns
  );
}

function NhWriteInPages({
  election,
  ballotStyle,
  totalPages,
  paperSize = HmpbBallotPaperSize.Custom17,
  writeInBlankRows = WRITE_IN_BLANK_ROWS,
  writeInSlotStyle = 'split',
}: NhRovFormProps & { totalPages: number }): JSX.Element | null {
  const { partyId } = ballotStyle;
  const party = partyId
    ? find(election.parties, (p) => p.id === partyId)
    : undefined;
  const wardName = getWardName(election, ballotStyle);
  const electionDate = format.localeLongDate(
    election.date.toMidnightDatetimeWithSystemTimezone()
  );
  const dimensions = ballotPaperDimensions(paperSize);

  const writeInContests = getWriteInContests(election, ballotStyle);

  if (writeInContests.length === 0) return null;

  const colorTint = party ? partyColorTint(party.fullName) : undefined;
  const headerBgColor = colorTint ? ColorTints[colorTint] : Colors.LIGHT_GRAY;

  const contestPages = splitContestsIntoPages(writeInContests);
  assert(contestPages.length > 0);

  return (
    <React.Fragment>
      {contestPages.map((pageContests, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const pageNumber = pageIndex + 2; // ROV form is page 1

        return (
          <Page
            key={`write-in-page-${pageNumber}`}
            pageNumber={pageNumber}
            dimensions={dimensions}
            margins={pageMarginsInches}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                padding: '0.375rem',
                position: 'relative',
              }}
            >
              {/* Header + Instructions box (matches ROV form structure) */}
              <div
                style={{
                  border: `1px solid ${Colors.DARKER_GRAY}`,
                  backgroundColor: headerBgColor,
                  marginBottom: '0.375rem',
                }}
              >
                <Header style={{ padding: '0.5rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.375rem',
                      alignItems: 'center',
                    }}
                  >
                    <img
                      src={`data:image/svg+xml;base64,${Buffer.from(
                        election.seal
                      ).toString('base64')}`}
                      style={{ height: '5rem' }}
                    />
                    <div>
                      {isFirstPage ? (
                        <React.Fragment>
                          <h1>Write-In Votes</h1>
                          <h2>
                            {election.jurisdiction.name}
                            {wardName ? ` ${wardName}` : ''}, {election.state}
                          </h2>
                          {party && <h2>{party.name}</h2>}
                          <h4>{election.title}</h4>
                          <h4>{electionDate}</h4>
                        </React.Fragment>
                      ) : (
                        <React.Fragment>
                          <h1>Write-In Votes Continued</h1>
                          <h2>
                            {election.jurisdiction.name}
                            {wardName ? ` ${wardName}` : ''}, {election.state}
                          </h2>
                          {party && <h2>{party.name}</h2>}
                          <h4>{election.title}</h4>
                          <h4>{electionDate}</h4>
                        </React.Fragment>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      border: '1px solid black',
                      backgroundColor: 'white',
                      minWidth: '22rem',
                    }}
                  >
                    <div style={{ padding: '0.25rem 0.375rem' }}>
                      <strong>A true copy attest:</strong>
                    </div>
                    <div
                      style={{
                        borderTop: `1px solid ${Colors.DARK_GRAY}`,
                        padding: '0.25rem 0.375rem',
                      }}
                    >
                      <SignatureLine>
                        <SignatureX />
                      </SignatureLine>
                      <div>Signature of Town/City Clerk</div>
                    </div>
                  </div>
                </Header>
                <div
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.375rem',
                    borderTop: `1px solid ${Colors.DARKER_GRAY}`,
                  }}
                >
                  <strong>Instructions:</strong>{' '}
                  {party
                    ? primaryWriteInInstructions(party.name)
                    : GENERAL_WRITE_IN_INSTRUCTIONS}
                </div>
              </div>

              {/* "The following persons" intro for primary first page */}
              {party && isFirstPage && (
                <div
                  style={{
                    fontSize: '0.8rem',
                    marginBottom: '0.375rem',
                  }}
                >
                  The following persons received <strong>WRITE-IN</strong> votes
                  on <strong>{party.name.toUpperCase()}</strong> ballots for the
                  following <strong>Offices:</strong>
                </div>
              )}

              {/* Contests in a 2-column layout. */}
              <div
                style={{
                  columns: 2,
                  columnGap: '0.5rem',
                  flex: 1,
                }}
              >
                {pageContests.map((contest) => (
                  <WriteInContest
                    key={contest.id}
                    title={contest.title}
                    headerColor={colorTint ? ColorTints[colorTint] : undefined}
                    blankRows={writeInBlankRows}
                    slotStyle={writeInSlotStyle}
                  />
                ))}
              </div>
              <PageFooter pageNumber={pageNumber} totalPages={totalPages} />
            </div>
          </Page>
        );
      })}
    </React.Fragment>
  );
}

// Guard against silent clipping: the tally and write-in contest boxes must all
// lie within a page's bounds. When a form is too dense for the chosen paper size
// (or write-in slot count), the fixed-height layout clips overflowing contests
// -- dropping a race from the form without any error. This check fails loudly
// instead, so a bad paper-size/slot combination can never ship.
async function assertContestsFit(
  document: RenderDocument,
  props: NhRovFormProps
): Promise<void> {
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  const boxes = await document.inspectElements('[data-rov-contest]');
  const tolerance = 2; // px, for sub-pixel layout rounding
  for (const box of boxes) {
    const page = pages.find(
      (p) => box.y >= p.y - tolerance && box.y < p.y + p.height - tolerance
    );
    const fits =
      page !== undefined &&
      box.x + box.width <= page.x + page.width + tolerance &&
      box.y + box.height <= page.y + page.height + tolerance;
    if (!fits) {
      const party = props.ballotStyle.partyId
        ? find(
            props.election.parties,
            (p) => p.id === props.ballotStyle.partyId
          ).abbrev
        : '';
      const wardName = getWardName(props.election, props.ballotStyle);
      const where = `${props.election.jurisdiction.name}${
        wardName ? ` ${wardName}` : ''
      }${party ? ` ${party}` : ''}`;
      throw new Error(
        `NH ROV form does not fit for ${where}: a ${
          box.data.rovContest ?? 'contest'
        } contest overflows its page and would be clipped. ` +
          `Use a larger paperSize or fewer writeInBlankRows.`
      );
    }
  }
}

export async function render(
  renderer: Renderer,
  props: NhRovFormProps
): Promise<RenderDocument> {
  const scratchpad = await renderer.createScratchpad(<BaseStyles />);
  const document = scratchpad.convertToDocument();
  const writeInContests = getWriteInContests(props.election, props.ballotStyle);
  const numWriteInPages =
    writeInContests.length === 0
      ? 0
      : splitContestsIntoPages(writeInContests).length;
  const totalPages = 1 + numWriteInPages;
  await document.setContent(
    'body',
    <React.Fragment>
      <NhRovForm {...props} totalPages={totalPages} />
      <NhWriteInPages {...props} totalPages={totalPages} />
    </React.Fragment>
  );
  await assertContestsFit(document, props);
  return document;
}
