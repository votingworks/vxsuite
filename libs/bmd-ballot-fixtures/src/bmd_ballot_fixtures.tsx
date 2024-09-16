import React from 'react';
import { renderToPdf } from '@votingworks/printing';
import tmp from 'tmp';
import {
  ElectionDefinition,
  VotesDict,
  BallotStyleId,
  PrecinctId,
  vote,
} from '@votingworks/types';
import { BmdPaperBallot, BmdPaperBallotProps } from '@votingworks/ui';
import { Buffer } from 'node:buffer';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { assertDefined, iter } from '@votingworks/basics';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';

export async function renderBmdBallotFixture(
  props: Partial<BmdPaperBallotProps> & {
    electionDefinition: ElectionDefinition;
    rotateImage?: boolean;
    frontPageOnly?: boolean;
  }
): Promise<Buffer> {
  // Set some default props that can be overridden by the caller
  const {
    electionDefinition: { election },
    rotateImage = false,
    frontPageOnly = false,
  } = props;
  const ballotStyle = election.ballotStyles[0];
  const precinctId = ballotStyle.precincts[0];
  const votes: VotesDict = {};
  const ballot = (
    <React.Fragment>
      <BmdPaperBallot
        isLiveMode={false}
        generateBallotId={() => '1'}
        machineType="mark"
        ballotStyleId={ballotStyle.id}
        precinctId={precinctId}
        votes={votes}
        {...props}
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
  pdfData: Buffer
): Promise<string> {
  const first = assertDefined(
    await iter(pdfToImages(pdfData, { scale: 200 / 72 })).first()
  );
  const file = tmp.fileSync({ postfix: '.png' });
  await writeImageData(file.name, first.page);
  return file.name;
}

export const DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID: BallotStyleId = '1';
export const DEFAULT_FAMOUS_NAMES_PRECINCT_ID: PrecinctId = '23';

export const DEFAULT_FAMOUS_NAMES_VOTES = vote(
  electionFamousNames2021Fixtures.election.contests,
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
