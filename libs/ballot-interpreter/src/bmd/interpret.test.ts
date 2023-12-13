import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { assert, err, typedAs } from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import { sliceElectionHash } from '@votingworks/ballot-encoder';
import { InterpretError, interpret } from './interpret';

test.each([
  [
    'front, back',
    electionFamousNames2021Fixtures.machineMarkedBallotPage1,
    electionFamousNames2021Fixtures.machineMarkedBallotPage2,
  ],
  [
    'back, front',
    electionFamousNames2021Fixtures.machineMarkedBallotPage2,
    electionFamousNames2021Fixtures.machineMarkedBallotPage1,
  ],
])('happy path: %s', async (name, front, back) => {
  const card: SheetOf<ImageData> = [
    await front.asImageData(),
    await back.asImageData(),
  ];
  const result = await interpret(
    electionFamousNames2021Fixtures.electionDefinition,
    card
  );
  const { ballot, summaryBallotImage, blankPageImage } = result.unsafeUnwrap();
  expect(ballot).toMatchSnapshot();

  // don't use Jest `toEqual` matcher because it tries to pretty print the
  // ImageData objects, which is slow and causes the test to time out
  if (name === 'front, back') {
    assert(summaryBallotImage === card[0]);
    assert(blankPageImage === card[1]);
  } else {
    assert(summaryBallotImage === card[1]);
    assert(blankPageImage === card[0]);
  }
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
  expect(result).toEqual(
    err(
      typedAs<InterpretError>({
        type: 'votes-not-found',
        source: [{ type: 'blank-page' }, { type: 'blank-page' }],
      })
    )
  );
});

test('multiple QR codes', async () => {
  const card: SheetOf<ImageData> = [
    await electionFamousNames2021Fixtures.machineMarkedBallotPage1.asImageData(),
    await electionFamousNames2021Fixtures.machineMarkedBallotPage1.asImageData(),
  ];
  const result = await interpret(
    electionFamousNames2021Fixtures.electionDefinition,
    card
  );
  expect(result).toEqual(
    err(
      typedAs<InterpretError>({
        type: 'multiple-qr-codes',
        source: expect.anything(),
      })
    )
  );
});

test('mismatched election', async () => {
  const card: SheetOf<ImageData> = [
    await electionFamousNames2021Fixtures.machineMarkedBallotPage1.asImageData(),
    await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData(),
  ];
  const result = await interpret(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
    card
  );
  expect(result).toEqual(
    err(
      typedAs<InterpretError>({
        type: 'mismatched-election',
        expectedElectionHash: sliceElectionHash(
          electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
            .electionHash
        ),
        actualElectionHash: sliceElectionHash(
          electionFamousNames2021Fixtures.electionDefinition.electionHash
        ),
      })
    )
  );
});
