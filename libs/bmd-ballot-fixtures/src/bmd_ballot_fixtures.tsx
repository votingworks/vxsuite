import React from 'react';
import { renderToPdf } from '@votingworks/printing';
import tmp from 'tmp';
import {
  BallotType,
  ElectionDefinition,
  VotesDict,
  BallotStyleId,
  PrecinctId,
  getBallotStyle,
  getContests,
  vote,
} from '@votingworks/types';
import { encodeSummaryBallotPage } from '@votingworks/ballot-encoder';
import { BmdPaperBallot } from '@votingworks/ui';

import {
  electionFamousNames2021Fixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { assertDefined, iter } from '@votingworks/basics';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';

const electionGeneralDefinition = readElectionGeneralDefinition();

const DEFAULT_BALLOT_AUDIT_ID = 'fixture-audit-id';

export interface BmdBallotFixtureOptions {
  electionDefinition: ElectionDefinition;
  ballotStyleId?: BallotStyleId;
  precinctId?: PrecinctId;
  votes?: VotesDict;
  /** Page number (1-indexed). Defaults to 1. */
  pageNumber?: number;
  /** Total number of pages in the ballot. Defaults to 1. */
  totalPages?: number;
  /** Ballot audit ID to correlate pages. Defaults to a constant fixture value. */
  ballotAuditId?: string;
  /**
   * Contest IDs to include on this page. Defaults to all contests for the
   * ballot style.
   */
  contestIdsForPage?: string[];
  /** Whether to rotate the image 180 degrees */
  rotateImage?: boolean;
  /** Whether to omit the trailing blank page. */
  frontPageOnly?: boolean;
  /** Whether this is a test mode ballot */
  isLiveMode?: boolean;
}

export async function renderBmdBallotFixture(
  options: BmdBallotFixtureOptions
): Promise<Uint8Array> {
  const {
    electionDefinition,
    ballotStyleId,
    precinctId,
    votes = {},
    pageNumber = 1,
    totalPages = 1,
    ballotAuditId = DEFAULT_BALLOT_AUDIT_ID,
    contestIdsForPage,
    rotateImage = false,
    frontPageOnly = false,
    isLiveMode = false,
  } = options;

  const { election } = electionDefinition;
  const ballotStyle = ballotStyleId
    ? assertDefined(getBallotStyle({ election, ballotStyleId }))
    : election.ballotStyles[0];
  const resolvedPrecinctId = precinctId ?? ballotStyle.precincts[0];
  const allContests = getContests({ election, ballotStyle });
  const contestsForPage = contestIdsForPage
    ? allContests.filter((c) => contestIdsForPage.includes(c.id))
    : allContests;

  // Filter votes to only include contests on this page
  const votesForPage: VotesDict = {};
  for (const contest of contestsForPage) {
    if (contest.id in votes) {
      votesForPage[contest.id] = votes[contest.id];
    }
  }

  const encodedBallot = encodeSummaryBallotPage(electionDefinition.election, {
    ballotHash: electionDefinition.ballotHash,
    ballotStyleId: ballotStyle.id,
    precinctId: resolvedPrecinctId,
    votes: votesForPage,
    isTestMode: !isLiveMode,
    ballotType: BallotType.Precinct,
    pageNumber,
    totalPages,
    ballotAuditId,
    contests: contestsForPage,
  });

  const ballot = (
    <React.Fragment>
      <BmdPaperBallot
        electionDefinition={electionDefinition}
        isLiveMode={isLiveMode}
        machineType="mark"
        ballotStyleId={ballotStyle.id}
        precinctId={resolvedPrecinctId}
        votes={votesForPage}
        pageNumber={pageNumber}
        totalPages={totalPages}
        contestsForPage={contestsForPage}
        encodedBallot={encodedBallot}
      />
      {!frontPageOnly && <div style={{ pageBreakAfter: 'always' }} />}
    </React.Fragment>
  );

  const document = rotateImage ? (
    <div style={{ transform: 'rotate(180deg)' }}>{ballot}</div>
  ) : (
    ballot
  );

  return (await renderToPdf({ document })).unsafeUnwrap();
}

// Writes the first page of `pdfData` to an image file and returns the filepath.
// BMD ballots print on one side only. Consider libs/image-utils' `BLANK_PAGE_IMAGE_DATA`
// for mocking the blank back in testing.
export async function writeFirstBallotPageToImageFile(
  pdfData: Uint8Array
): Promise<string> {
  const first = assertDefined(
    await iter(pdfToImages(pdfData, { scale: 200 / 72 })).first()
  );
  const file = tmp.fileSync({ postfix: '.png' });
  await writeImageData(file.name, first.page);
  return file.name;
}

export const DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID = '1-4' as BallotStyleId;
export const DEFAULT_FAMOUS_NAMES_PRECINCT_ID: PrecinctId = '23';
export const DEFAULT_FAMOUS_NAMES_POLLING_PLACE_ID: string = '23-polling-place';

export const DEFAULT_FAMOUS_NAMES_VOTES = vote(
  electionFamousNames2021Fixtures.readElection().contests,
  {
    mayor: 'sherlock-holmes',
    controller: 'winston-churchill',
    attorney: 'john-snow',
    'public-works-director': 'benjamin-franklin',
    'chief-of-police': 'natalie-portman',
    'parks-and-recreation-director': 'charles-darwin',
    'board-of-alderman': [
      'helen-keller',
      'steve-jobs',
      'nikola-tesla',
      'vincent-van-gogh',
    ],
    'city-council': [
      'marie-curie',
      'indiana-jones',
      'mona-lisa',
      'jackie-chan',
    ],
  }
);

export const DEFAULT_ELECTION_GENERAL_BALLOT_STYLE_ID =
  electionGeneralDefinition.election.ballotStyles[0].id;
export const DEFAULT_ELECTION_GENERAL_PRECINCT_ID: PrecinctId =
  electionGeneralDefinition.election.precincts[0].id;

export const DEFAULT_ELECTION_GENERAL_VOTES = vote(
  electionGeneralDefinition.election.contests,
  {
    president: ['barchi-hallaren'],
    senator: ['weiford'],
    'representative-district-6': ['plunkard'],
    governor: ['franz'],
    'lieutenant-governor': ['norberg'],
    'secretary-of-state': ['shamsi'],
    'state-senator-district-31': ['shiplett'],
    'state-assembly-district-54': ['solis'],
    'county-commissioners': [
      'argent',
      'witherspoonsmithson',
      'bainbridge',
      'hennessey',
    ],
    'county-registrar-of-wills': ['ramachandrani'],
    'city-mayor': ['white'],
    'city-council': ['eagle', 'rupp', 'shry'],
    'judicial-robert-demergue': ['judicial-robert-demergue-option-yes'],
    'judicial-elmer-hull': ['judicial-elmer-hull-option-yes'],
    'question-a': ['question-a-option-yes'],
    'question-b': ['question-b-option-yes'],
    'question-c': ['question-c-option-yes'],
    'proposition-1': ['proposition-1-option-yes'],
    'measure-101': ['measure-101-option-yes'],
    '102': ['measure-102-option-yes'],
  }
);
