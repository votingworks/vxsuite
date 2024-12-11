import { electionPrimaryPrecinctSplitsFixtures } from '@votingworks/fixtures';
import {
  MockGoogleCloudTranslationClient,
  readElectionPackageFromBuffer,
  getAllStringsForElectionPackage,
} from '@votingworks/backend';
import { assert } from '@votingworks/basics';
import {
  Election,
  mergeUiStrings,
  getBallotLanguageConfigs,
} from '@votingworks/types';
import {
  Renderer,
  createElectionDefinitionForDefaultHmpbTemplate,
  createPlaywrightRenderer,
} from '@votingworks/hmpb';
import { GoogleCloudTranslatorWithElectionCache } from './translator_with_election_cache';

jest.setTimeout(120_000);

let renderer: Renderer;
beforeAll(async () => {
  renderer = await createPlaywrightRenderer();
});

afterAll(async () => {
  await renderer.cleanup();
});

describe('fixtures are up to date - run `pnpm generate-election-packages` if this test fails', () => {
  test('electionPrimaryPrecinctSplitsFixtures', async () => {
    const mockTranslationClient = new MockGoogleCloudTranslationClient();

    const baseElection =
      electionPrimaryPrecinctSplitsFixtures.baseElection_DEPRECATED.election;
    const electionFileContents =
      electionPrimaryPrecinctSplitsFixtures.electionPackageExport.asBuffer();
    const result = await readElectionPackageFromBuffer(electionFileContents);
    assert(result.isOk());
    const { electionPackage } = result.ok();

    const translator = new GoogleCloudTranslatorWithElectionCache({
      translationClient: mockTranslationClient,
      priorElectionPackage: electionPackage,
    });

    const [newAppStrings, newHmpbStrings, newElectionStrings] =
      await getAllStringsForElectionPackage(
        baseElection,
        translator,
        getBallotLanguageConfigs(true)
      );
    const newCombinedStrings = mergeUiStrings(
      newAppStrings,
      newHmpbStrings,
      newElectionStrings
    );

    // Check that the strings have not changed.
    assert(electionPackage.uiStrings);
    expect(newCombinedStrings).toMatchObject(electionPackage.uiStrings);

    const ballotStrings = mergeUiStrings(newElectionStrings, newHmpbStrings);
    const electionWithBallotStrings: Election = {
      ...baseElection,
      ballotStrings,
    };

    // Check that the generated election's ballot hash has not changed.
    const electionDefinition =
      await createElectionDefinitionForDefaultHmpbTemplate(
        renderer,
        electionWithBallotStrings,
        'vxf'
      );
    expect(electionDefinition.ballotHash).toEqual(
      electionPackage.electionDefinition.ballotHash
    );
  });
});
