import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import {
  makeMockGoogleCloudTranslationClient,
  readElectionPackageFromBuffer,
  getAllStringsForElectionPackage,
} from '@votingworks/backend';
import { assert } from '@votingworks/basics';
import {
  Election,
  mergeUiStrings,
  getBallotLanguageConfigs,
  LanguageCode,
} from '@votingworks/types';
import {
  Renderer,
  allBaseBallotProps,
  ballotTemplates,
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  renderMinimalBallotsToCreateElectionDefinition,
} from '@votingworks/hmpb';
import { GoogleCloudTranslatorWithElectionCache } from './translator_with_election_cache';

vi.setConfig({
  testTimeout: 120_000,
});

let renderer: Renderer;
beforeAll(async () => {
  renderer = await createPlaywrightRenderer();
});

afterAll(async () => {
  await renderer.cleanup();
});

const testCases = [
  {
    testName: 'electionPrimaryPrecinctSplitsFixtures',
    fixture: electionPrimaryPrecinctSplitsFixtures,
    isMultiLanguage: true,
  },
  {
    testName: 'electionFamousNames2021',
    fixture: electionFamousNames2021Fixtures,
    isMultiLanguage: false,
  },
];

describe('fixtures are up to date - run `pnpm generate-election-packages` if this test fails', () => {
  for (const { testName, fixture, isMultiLanguage } of testCases) {
    test(`Fixture for ${testName} is up to date`, async () => {
      const mockTranslationClient = makeMockGoogleCloudTranslationClient({
        fn: vi.fn,
      });

      const baseElection = fixture.baseElection_DEPRECATED.readElection();
      const { electionPackage } = (
        await readElectionPackageFromBuffer(fixture.electionPackage.asBuffer())
      ).unsafeUnwrap();

      const translator = new GoogleCloudTranslatorWithElectionCache({
        translationClient: mockTranslationClient,
        priorElectionPackage: electionPackage,
      });

      const [newAppStrings, newHmpbStrings, newElectionStrings] =
        await getAllStringsForElectionPackage(
          baseElection,
          translator,
          hmpbStringsCatalog,
          getBallotLanguageConfigs(
            isMultiLanguage
              ? Object.values(LanguageCode)
              : [LanguageCode.ENGLISH]
          )
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
        await renderMinimalBallotsToCreateElectionDefinition(
          renderer,
          ballotTemplates.VxDefaultBallot,
          allBaseBallotProps(electionWithBallotStrings),
          'vxf'
        );
      expect(electionDefinition.ballotHash).toEqual(
        electionPackage.electionDefinition.ballotHash
      );
    });
  }
});
