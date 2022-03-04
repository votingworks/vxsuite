import { BallotType } from '@votingworks/types';
import { fail } from 'assert';
import * as choctaw2020LegalSize from '../../test/fixtures/choctaw-county-2020-general-election';
import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { Interpreter } from '.';
import { DetectQrCodeResult } from '../types';

jest.setTimeout(10000);

test('custom QR code reader', async () => {
  const fixtures = oaklawn;
  const { election } = fixtures;
  const interpreter = new Interpreter({
    election,
    detectQrCode: async (): Promise<DetectQrCodeResult> => ({
      data: Buffer.from('https://ballot.page?t=_&pr=11&bs=22&p=3-4'),
    }),
  });
  const template = await interpreter.interpretTemplate(
    await fixtures.blankPage1.imageData()
  );

  expect(template.ballotPageLayout.metadata).toEqual({
    locales: { primary: 'en-US' },
    ballotStyleId: '22',
    precinctId: '11',
    isTestMode: false,
    pageNumber: 3,
    electionHash: '',
    ballotType: BallotType.Standard,
  });
});

test('can interpret a template that is not in the same mode as the interpreter', async () => {
  const fixtures = oaklawn;
  const { election } = fixtures;
  const interpreter = new Interpreter({ election, testMode: true });

  expect(
    (
      await interpreter.interpretTemplate(
        await fixtures.blankPage1.imageData(),
        await fixtures.blankPage1.metadata({ isTestMode: false })
      )
    ).ballotPageLayout.metadata.isTestMode
  ).toBe(false);
});

test('takes the mark score vote threshold from the election definition if present', () => {
  const fixtures = oaklawn;
  const { election } = fixtures;
  const interpreter = new Interpreter({
    election: {
      ...election,
      markThresholds: {
        definite: 0.99,
        marginal: 0.98,
      },
    },
  });

  // eslint-disable-next-line dot-notation
  expect(interpreter['markScoreVoteThreshold']).toEqual(0.99);
});

test('rejects an incorrect-but-plausible contest layout', async () => {
  const fixtures = choctaw2020LegalSize;
  const interpreter = new Interpreter({
    election: fixtures.election,
    testMode: true,
  });

  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await fixtures.district5BlankPage1.imageData()
    )
  );
  const p2 = await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await fixtures.district5BlankPage2.imageData()
    )
  );

  try {
    await interpreter.interpretBallot(
      await fixtures.filledInPage2_06.imageData(),
      p2.ballotPageLayout.metadata
    );
    fail('expected interpretation to fail');
  } catch (error) {
    expect(error.message).toMatch(
      'ballot and template contest shapes do not correspond'
    );
  }
});
