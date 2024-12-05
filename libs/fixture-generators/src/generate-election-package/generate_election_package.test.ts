import { electionPrimaryPrecinctSplitsFixtures } from '@votingworks/fixtures';
import { readElectionPackageFromBuffer } from '@votingworks/backend';
import { assert } from '@votingworks/basics';
import { Election, mergeUiStrings } from '@votingworks/types';
import {
  BallotLanguageConfig,
  GoogleCloudTranslatorWithoutCache,
  LanguageCode,
  MinimalGoogleCloudTranslationClient,
} from '@votingworks/design-backend';
import { Renderer, createPlaywrightRenderer } from '@votingworks/hmpb';
import {
  generateElectionDefinitionForHmpbs,
  getAllStringsForElection,
} from './generate_election_package';

jest.setTimeout(120_000);

const multiLanguageBallotLangConfigs = Object.values(LanguageCode).map(
  (l): BallotLanguageConfig => ({ languages: [l] })
);

function mockCloudTranslatedText(
  englishText: string,
  languageCode: string
): string {
  return `${englishText} (in ${languageCode})`;
}

class MockGoogleCloudTranslationClient
  implements MinimalGoogleCloudTranslationClient
{
  // eslint-disable-next-line vx/gts-no-public-class-fields
  translateText = jest.fn(
    (input: {
      contents: string[];
      targetLanguageCode: string;
    }): Promise<
      [
        { translations: Array<{ translatedText: string }> },
        undefined,
        undefined,
      ]
    > =>
      Promise.resolve([
        {
          translations: input.contents.map((text) => ({
            translatedText: mockCloudTranslatedText(
              text,
              input.targetLanguageCode
            ),
          })),
        },
        undefined,
        undefined,
      ])
  );
}

// const englishBallotLangConfigs = [{ languages: [LanguageCode.ENGLISH] }];

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

    const translator = new GoogleCloudTranslatorWithoutCache({
      translationClient: mockTranslationClient,
      priorElectionPackage: electionPackage,
    });

    const [newAppStrings, newHmpbStrings, newElectionStrings] =
      await getAllStringsForElection(
        baseElection,
        translator,
        multiLanguageBallotLangConfigs
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
    const electionDefinition = await generateElectionDefinitionForHmpbs(
      renderer,
      electionWithBallotStrings
    );
    expect(electionDefinition.ballotHash).toEqual(
      electionPackage.electionDefinition.ballotHash
    );
  });
});
