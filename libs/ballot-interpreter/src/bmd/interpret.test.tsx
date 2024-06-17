import { sliceElectionHash } from '@votingworks/ballot-encoder';
import { assert, err } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { SheetOf } from '@votingworks/types';
import { ImageData } from 'canvas';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
} from '../../test/fixtures';
import {
  convertBallotToImages,
  renderTestModeBallot,
} from '../../test/helpers/ballots';
import { InterpretResult, interpret } from './interpret';

let famousNamesBmdCard: SheetOf<ImageData>;

beforeAll(async () => {
  famousNamesBmdCard = await convertBallotToImages(
    await renderTestModeBallot(
      electionFamousNames2021Fixtures.electionDefinition,
      DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
      DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
      DEFAULT_FAMOUS_NAMES_VOTES
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
