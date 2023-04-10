import { assert, fail } from '@votingworks/basics';
import { Interpreter } from '.';
import * as choctaw2020LegalSize from '../../test/fixtures/choctaw-county-2020-general-election';
import * as oaklawn from '../../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { buildInterpreterWithFixtures } from '../../test/helpers/fixtures_to_templates';

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

  expect(interpreter['markScoreVoteThreshold']).toEqual(0.99);
});

/**
 * Because this image has a cropped contest, it should not correspond to the
 * template. The cropped contest has a correspondence error of ~0.09, which is
 * higher than the maximum default correspondence error of 0.05.
 *
 * @see {@link findBallotLayoutCorrespondence}
 */
// TODO Skipping for now, since we're relying on an outdated election fixture
// that includes an either-neither contest
test.skip('rejects an incorrect-but-plausible contest layout', async () => {
  const fixtures = choctaw2020LegalSize;
  const { interpreter, templates } = await buildInterpreterWithFixtures({
    electionDefinition: fixtures.electionDefinition,
    fixtures: [fixtures.district5BlankPage1, fixtures.district5BlankPage2],
    useFixtureMetadata: false,
    testMode: true,
  });
  const p2 = templates[1];

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
