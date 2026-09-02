// @coverage-defer-file: no production consumer yet; tests to come with the NH delivery integration
import React from 'react';
import { assertDefined, find, range } from '@votingworks/basics';
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
  Party,
  PartyId,
  PrecinctId,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import { CandidatePartyList, SignatureLine, SignatureX } from '@votingworks/ui';
import { styled } from '../styled.js';
import { RenderDocument, Renderer } from '../renderer.js';
import { BaseStyles } from '../base_styles.js';
import {
  Colors,
  Page,
  PAGE_CLASS,
  pageMarginsInches,
} from '../ballot_components.js';
import {
  ColorTint,
  colorTintForParty,
  ColorTints,
} from './nh_state_primary_ballot_template.js';
import { voteForText } from './nh_state_ballot_components.js';

const CONTEST_BOX_CLASS = 'rov-contest';

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
`;

const ContestTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  break-inside: avoid;

  th {
    text-align: left;
    font-weight: normal;
    padding: 0.375rem;
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

function BallotsCastField({ label }: { label: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        minWidth: '8rem',
        backgroundColor: Colors.WHITE,
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

// The ward name is only shown in warded jurisdictions (towns with multiple
// wards); in unwarded towns the precinct is the town itself.
function getWardName(
  election: Election,
  precinctId: PrecinctId
): string | undefined {
  if (election.precincts.length <= 1) {
    return undefined;
  }
  return assertDefined(getPrecinctById({ election, precinctId })).name;
}

function contestTitleWithForPrefix(title: string): string {
  return title.startsWith('For ') ? title : `For ${title}`;
}

function cleanCandidateName(name: string): JSX.Element {
  const parts = name.split(/<br\s*\/?>/gi);
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
    const existing = groups.get(c.id);
    if (existing) {
      const merged: PartyId[] = [...(existing.partyIds ?? [])];
      for (const pid of c.partyIds ?? []) {
        if (!merged.includes(pid)) merged.push(pid);
      }
      groups.set(c.id, { ...existing, partyIds: merged });
    } else {
      groups.set(c.id, c);
    }
  }
  return [...groups.values()];
}

const PRIMARY_INSTRUCTIONS = (
  <span>
    Record the number of votes received by each candidate in the appropriate
    space to the right of each candidate&rsquo;s name. If a candidate printed on
    the ballot received write-in votes in this party&rsquo;s primary, include
    the votes by write-in by adding those write-in votes into the total votes
    for that candidate on this return. Record the total Undervotes and total
    Overvotes for each race. Record the Ballots Cast information at the top of
    the return.
  </span>
);

const GENERAL_INSTRUCTIONS = (
  <span>
    Record the number of votes received by each candidate or question in the
    appropriate space. Record the total Undervotes and total Overvotes for each
    race or question. Record the Ballots Cast information at the top of the
    return. The Clerk must verify that the numbers entered accurately reflect
    the vote counts determined by the moderator and sign the form. Return on
    ELECTION NIGHT to the Secretary of State.
  </span>
);

function AttestationBox({
  heading,
  footer,
  minWidth,
}: {
  heading: React.ReactNode;
  footer?: React.ReactNode;
  minWidth?: string;
}): JSX.Element {
  return (
    <div
      style={{
        fontSize: '0.8rem',
        border: '1px solid black',
        backgroundColor: 'white',
        minWidth,
      }}
    >
      <div style={{ padding: '0.25rem 0.375rem' }}>
        <strong>{heading}</strong>
      </div>
      <div
        style={{
          borderTop: `1px solid ${Colors.DARK_GRAY}`,
          borderBottom: footer ? `1px solid ${Colors.DARK_GRAY}` : undefined,
          padding: '0.25rem 0.375rem',
        }}
      >
        <SignatureLine>
          <SignatureX />
        </SignatureLine>
        <div>Signature of Town/City Clerk</div>
      </div>
      {footer && (
        <div style={{ fontSize: '0.8rem', padding: '0.25rem 0.375rem' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

function FormHeader({
  election,
  title,
  party,
  wardName,
  electionDate,
  colorTint,
  attestation,
  instructions,
}: {
  election: Election;
  title: string;
  party?: Party;
  wardName?: string;
  electionDate: string;
  colorTint: ColorTint;
  attestation: JSX.Element;
  instructions: JSX.Element;
}): JSX.Element {
  return (
    <div
      style={{
        border: `1px solid ${Colors.DARKER_GRAY}`,
        backgroundColor: ColorTints[colorTint],
      }}
    >
      <Header style={{ padding: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
          <img
            src={`data:image/svg+xml;base64,${Buffer.from(
              election.seal
            ).toString('base64')}`}
            style={{ height: '5rem' }}
          />
          <div>
            <h1>{title}</h1>
            <h2>
              {election.jurisdiction.name}
              {wardName ? ` ${wardName}` : ''}, {election.state}
            </h2>
            {party && <h2>{party.name}</h2>}
            <h4>{election.title}</h4>
            <h4>{electionDate}</h4>
          </div>
        </div>
        {attestation}
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
  );
}

interface NhStateRovFormProps {
  election: Election;
  ballotStyle: BallotStyle;
  precinctId: PrecinctId;
  paperSize: HmpbBallotPaperSize;
}

function NhStateRovFormContestsPage({
  election,
  ballotStyle,
  precinctId,
  totalPages,
  paperSize,
}: NhStateRovFormProps & { totalPages: number }): JSX.Element {
  const party = ballotStyle.partyId
    ? find(election.parties, (p) => p.id === ballotStyle.partyId)
    : undefined;
  const wardName = getWardName(election, precinctId);
  const electionDate = format.localeLongDate(
    election.date.toMidnightDatetimeWithSystemTimezone()
  );
  const colorTint = party ? colorTintForParty(party) : 'GRAY';
  const contests = getContests({ election, ballotStyle });
  const dimensions = ballotPaperDimensions(paperSize);
  const instructions = party ? PRIMARY_INSTRUCTIONS : GENERAL_INSTRUCTIONS;
  const partyPrefix = party ? `${party.name} ` : '';
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
        <FormHeader
          election={election}
          title="Return of Votes"
          party={party}
          wardName={wardName}
          electionDate={electionDate}
          colorTint={colorTint}
          attestation={
            <AttestationBox
              heading={<>Vote {electionDate}. A true copy attest:</>}
              footer={
                <>
                  One copy to be returned <strong>ELECTION NIGHT</strong> to the
                  Secretary of State
                </>
              }
            />
          }
          instructions={instructions}
        />
        <div
          style={{
            border: `1px solid ${Colors.DARKER_GRAY}`,
            backgroundColor: ColorTints[colorTint],
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
            <BallotsCastField
              label={<>{partyPrefix}Election Day Ballots&nbsp;Cast</>}
            />
            <h2 style={{ alignSelf: 'center' }}>+</h2>
            <BallotsCastField
              label={<>{partyPrefix}Absentee Ballots&nbsp;Cast</>}
            />
            <h2 style={{ alignSelf: 'center' }}>=</h2>
            <BallotsCastField
              label={<>{partyPrefix}Total Ballots&nbsp;Cast</>}
            />
            <div
              style={{
                borderLeft: '1px solid black',
              }}
            />
            <BallotsCastField
              label={<>{partyPrefix}Federal Office Only Ballots&nbsp;Cast</>}
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
              className={CONTEST_BOX_CLASS}
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
                      style={{ backgroundColor: ColorTints[colorTint] }}
                    >
                      <h4 style={{ fontSize: '1rem' }}>
                        {contestTitleWithForPrefix(contest.title)}
                      </h4>
                      {contest.type === 'candidate' && (
                        <div>
                          {voteForText(contest.seats)}
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
                          {!party && (candidate.partyIds?.length ?? 0) > 0 && (
                            <div style={{ fontWeight: '400' }}>
                              <CandidatePartyList
                                candidate={candidate}
                                electionParties={election.parties}
                              />
                            </div>
                          )}
                        </td>
                        <td />
                      </tr>
                    ))}
                  {contest.type === 'yesno' &&
                    contest.options.map((option) => (
                      <tr key={option.id}>
                        <td>{option.label}</td>
                        <td />
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
    height: 1.375rem;
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
     from its name box within a slot. */
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

const WRITE_IN_ROWS_PER_CONTEST = 4;

function WriteInContest({
  title,
  colorTint,
}: {
  title: string;
  colorTint: ColorTint;
}): JSX.Element {
  return (
    <div
      className={CONTEST_BOX_CLASS}
      style={{
        marginBottom: '0.375rem',
        border: `1px solid ${Colors.DARKER_GRAY}`,
      }}
    >
      <WriteInContestTable>
        {/* Each slot: name box (3/4) + count box (1/4); two slots per row. */}
        <colgroup>
          <col style={{ width: 'calc(50% * 3 / 4)' }} />
          <col style={{ width: 'calc(50% * 1 / 4)' }} />
          <col style={{ width: 'calc(50% * 3 / 4)' }} />
          <col style={{ width: 'calc(50% * 1 / 4)' }} />
        </colgroup>
        <tbody>
          <tr>
            <th colSpan={4} style={{ backgroundColor: ColorTints[colorTint] }}>
              {contestTitleWithForPrefix(title)}
            </th>
          </tr>
          {range(0, WRITE_IN_ROWS_PER_CONTEST).map((r) => (
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
    </div>
  );
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

function NhStateRovFormWriteInPage({
  election,
  ballotStyle,
  precinctId,
  totalPages,
  paperSize,
}: NhStateRovFormProps & { totalPages: number }): JSX.Element | null {
  const writeInContests = getWriteInContests(election, ballotStyle);
  if (writeInContests.length === 0) return null;

  const party = ballotStyle.partyId
    ? find(election.parties, (p) => p.id === ballotStyle.partyId)
    : undefined;
  const wardName = getWardName(election, precinctId);
  const electionDate = format.localeLongDate(
    election.date.toMidnightDatetimeWithSystemTimezone()
  );
  const colorTint = party ? colorTintForParty(party) : 'GRAY';
  const dimensions = ballotPaperDimensions(paperSize);

  return (
    <Page pageNumber={2} dimensions={dimensions} margins={pageMarginsInches}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.375rem',
          height: '100%',
          padding: '0.375rem',
          position: 'relative',
        }}
      >
        <FormHeader
          election={election}
          title="Write-In Votes"
          party={party}
          wardName={wardName}
          electionDate={electionDate}
          colorTint={colorTint}
          attestation={
            <AttestationBox heading="A true copy attest:" minWidth="22rem" />
          }
          instructions={
            party
              ? primaryWriteInInstructions(party.name)
              : GENERAL_WRITE_IN_INSTRUCTIONS
          }
        />

        {party && (
          <div style={{ fontSize: '0.8rem' }}>
            The following persons received <strong>WRITE-IN</strong> votes on{' '}
            <strong>{party.name.toUpperCase()}</strong> ballots for the
            following <strong>Offices:</strong>
          </div>
        )}

        <div
          style={{
            columns: 2,
            columnGap: '0.5rem',
            flex: 1,
          }}
        >
          {writeInContests.map((contest) => (
            <WriteInContest
              key={contest.id}
              title={contest.title}
              colorTint={colorTint}
            />
          ))}
        </div>
        <PageFooter pageNumber={2} totalPages={totalPages} />
      </div>
    </Page>
  );
}

// Guard against silent clipping: the contest boxes must all lie within each
// page's bounds. (For now, NH wants a single sheet form, so we adjust paper
// size rather than paginate the content.)
async function assertContestsFit(
  document: RenderDocument,
  props: NhStateRovFormProps
): Promise<void> {
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  const pixelsPerInch = 96; // CSS reference pixel
  const tolerance = 2; // px, for sub-pixel layout rounding
  for (const [pageIndex, page] of pages.entries()) {
    const pageNumber = pageIndex + 1;
    const printableArea = {
      left: page.x + pageMarginsInches.left * pixelsPerInch,
      top: page.y + pageMarginsInches.top * pixelsPerInch,
      right: page.x + page.width - pageMarginsInches.right * pixelsPerInch,
      bottom: page.y + page.height - pageMarginsInches.bottom * pixelsPerInch,
    } as const;
    const boxes = await document.inspectElements(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${CONTEST_BOX_CLASS}`
    );
    for (const box of boxes) {
      const fits =
        box.x >= printableArea.left - tolerance &&
        box.y >= printableArea.top - tolerance &&
        box.x + box.width <= printableArea.right + tolerance &&
        box.y + box.height <= printableArea.bottom + tolerance;
      if (!fits) {
        const party = props.ballotStyle.partyId
          ? find(
              props.election.parties,
              (p) => p.id === props.ballotStyle.partyId
            ).abbrev
          : '';
        const wardName = getWardName(props.election, props.precinctId);
        const where = `${props.election.jurisdiction.name}${
          wardName ? ` ${wardName}` : ''
        }${party ? ` ${party}` : ''}`;
        throw new Error(
          `NH ROV form does not fit for ${where}: a contest overflows the ` +
            `printable area of page ${pageNumber} and would be clipped. Use ` +
            `a larger paperSize.`
        );
      }
    }
  }
}

export async function renderNhStateRovForm(
  renderer: Renderer,
  props: NhStateRovFormProps
): Promise<RenderDocument> {
  const scratchpad = await renderer.createScratchpad(<BaseStyles />);
  const document = scratchpad.convertToDocument();
  const writeInContests = getWriteInContests(props.election, props.ballotStyle);
  const totalPages = writeInContests.length === 0 ? 1 : 2;
  await document.setContent(
    'body',
    <React.Fragment>
      <NhStateRovFormContestsPage {...props} totalPages={totalPages} />
      <NhStateRovFormWriteInPage {...props} totalPages={totalPages} />
    </React.Fragment>
  );
  await assertContestsFit(document, props);
  return document;
}
