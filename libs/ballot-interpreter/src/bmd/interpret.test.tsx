import { sliceElectionHash } from '@votingworks/ballot-encoder';
import { assert, assertDefined, err, iter } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { pdfToImages } from '@votingworks/image-utils';
import { renderToPdf } from '@votingworks/printing';
import {
  ElectionDefinition,
  SheetOf,
  VotesDict,
  vote,
} from '@votingworks/types';
import { BmdPaperBallot } from '@votingworks/ui';
import { Buffer } from 'buffer';
import { ImageData } from 'canvas';
import { InterpretResult, interpret } from './interpret';

async function renderTestModeBallot(
  electionDefinition: ElectionDefinition,
  precinctId: string,
  ballotStyleId: string,
  votes: VotesDict
): Promise<Buffer> {
  const ballot = (
    <BmdPaperBallot
      electionDefinition={electionDefinition}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      votes={votes}
      isLiveMode={false}
      generateBallotId={() => '1'}
      machineType="mark"
    />
  );

  return renderToPdf({
    document: ballot,
  });
}

async function convertBallotToImages(pdf: Buffer): Promise<SheetOf<ImageData>> {
  const [page1, page2] = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
    .map((page) => page.page)
    .take(2)
    .toArray();

  return [
    assertDefined(page1),
    // if there's only one page, use a blank page for the back
    page2 ??
      (await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData()),
  ];
}

const famousNamesVotes = vote(
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

let famousNamesBmdCard: SheetOf<ImageData>;

beforeAll(async () => {
  famousNamesBmdCard = await convertBallotToImages(
    await renderTestModeBallot(
      electionFamousNames2021Fixtures.electionDefinition,
      '23',
      '1',
      famousNamesVotes
    )
  );
});

test('happy path: front, back', async () => {
  const card = famousNamesBmdCard;
  const result = await interpret(
    electionFamousNames2021Fixtures.electionDefinition,
    card
  );
  const { ballot, summaryBallotImage, blankPageImage } = result.unsafeUnwrap();
  expect(ballot).toMatchSnapshot();

  // don't use Jest `toEqual` matcher because it tries to pretty print the
  // ImageData objects, which is slow and causes the test to time out
  assert(summaryBallotImage === card[0]);
  assert(blankPageImage === card[1]);
});

test('happy path: back, front', async () => {
  const card = famousNamesBmdCard;
  const result = await interpret(
    electionFamousNames2021Fixtures.electionDefinition,
    [card[1], card[0]]
  );
  const { ballot, summaryBallotImage, blankPageImage } = result.unsafeUnwrap();
  expect(ballot).toMatchSnapshot();

  // don't use Jest `toEqual` matcher because it tries to pretty print the
  // ImageData objects, which is slow and causes the test to time out
  assert(summaryBallotImage === card[0]);
  assert(blankPageImage === card[1]);
});

test('votes not found', async () => {
  const card: SheetOf<ImageData> = [
    await sampleBallotImages.blankPage.asImageData(),
    await sampleBallotImages.blankPage.asImageData(),
  ];
  const result = await interpret(
    electionFamousNames2021Fixtures.electionDefinition,
    card
  );
  expect(result).toEqual<InterpretResult>(
    err({
      type: 'votes-not-found',
      source: [{ type: 'blank-page' }, { type: 'blank-page' }],
    })
  );
});

test('multiple QR codes', async () => {
  const card: SheetOf<ImageData> = [
    famousNamesBmdCard[0],
    famousNamesBmdCard[0],
  ];
  const result = await interpret(
    electionFamousNames2021Fixtures.electionDefinition,
    card
  );
  expect(result).toEqual<InterpretResult>(
    err({
      type: 'multiple-qr-codes',
      source: expect.anything(),
    })
  );
});

test('mismatched election', async () => {
  const card = famousNamesBmdCard;
  const result = await interpret(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
    card
  );
  expect(result).toEqual<InterpretResult>(
    err({
      type: 'mismatched-election',
      expectedElectionHash: sliceElectionHash(
        electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
          .electionHash
      ),
      actualElectionHash: sliceElectionHash(
        electionFamousNames2021Fixtures.electionDefinition.electionHash
      ),
    })
  );
});
