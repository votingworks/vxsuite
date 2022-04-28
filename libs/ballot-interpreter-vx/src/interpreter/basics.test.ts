import { assert, fail } from '@votingworks/utils';
import { Interpreter } from '.';
import * as choctaw2020LegalSize from '../../test/fixtures/choctaw-county-2020-general-election';
import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';

jest.setTimeout(10000);

test('can interpret a template that is not in the same mode as the interpreter', async () => {
  const fixtures = oaklawn;
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({ electionDefinition, testMode: true });

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
  const { electionDefinition } = fixtures;
  const interpreter = new Interpreter({
    electionDefinition: {
      ...electionDefinition,
      election: {
        ...electionDefinition.election,
        markThresholds: {
          definite: 0.99,
          marginal: 0.98,
        },
      },
    },
  });

  // eslint-disable-next-line dot-notation
  expect(interpreter['markScoreVoteThreshold']).toEqual(0.99);
});

/**
 * Because this image has a cropped contest, it should not correspond to the
 * template. The cropped contest has a correspondence error of ~0.09, which is
 * higher than the maximum default correspondence error of 0.05.
 *
 * @see {@link findBallotLayoutCorrespondence}
 */
test('rejects an incorrect-but-plausible contest layout', async () => {
  const fixtures = choctaw2020LegalSize;
  const interpreter = new Interpreter({
    electionDefinition: fixtures.electionDefinition,
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
      await fixtures.p2EvenContestBoxFoldGaps.imageData(),
      p2.ballotPageLayout.metadata
    );
    fail('expected interpretation to fail');
  } catch (error) {
    assert(error instanceof Error);
    expect(error.message).toMatch(
      'ballot and template contest shapes do not correspond'
    );
  }
});
