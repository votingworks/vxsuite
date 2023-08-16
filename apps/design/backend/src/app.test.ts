import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  DEFAULT_SYSTEM_SETTINGS,
  safeParseElectionDefinition,
} from '@votingworks/types';
import JsZip from 'jszip';
import { safeParseSystemSettings } from '@votingworks/utils';
import { testSetupHelpers } from '../test/helpers';

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

test('export setup package', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.electionDefinition;
  const { apiClient } = setupApp();

  const electionId = (
    await apiClient.createElection({
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();

  const { zipContents, electionHash } = await apiClient.exportSetupPackage({
    electionId,
  });
  const zip = await JsZip.loadAsync(zipContents);

  expect(Object.keys(zip.files)).toEqual([
    'election.json',
    'systemSettings.json',
  ]);

  const electionDefinition = safeParseElectionDefinition(
    await zip.file('election.json')!.async('text')
  ).unsafeUnwrap();
  expect(electionHash).toEqual(electionDefinition.electionHash);

  expect(electionDefinition.election).toEqual({
    ...baseElectionDefinition.election,

    // Ballot styles are generated in the app, ignoring the ones in the inputted
    // election definition.
    ballotStyles: electionDefinition.election.ballotStyles,

    // The base election definition should have been extended with grid layouts.
    // The correctness of the grid layouts is tested by libs/ballot-interpreter
    // tests.
    gridLayouts: electionDefinition.election.gridLayouts,
  });

  // We should have a ballot style for each precinct with a unique set of
  // contests (via districts). In this case, all the precincts share the same
  // contests.
  expect(electionDefinition.election.ballotStyles).toMatchInlineSnapshot(`
    [
      {
        "districts": [
          "district-1",
        ],
        "id": "ballot-style-1",
        "precincts": [
          "23",
          "22",
          "21",
          "20",
        ],
      },
    ]
  `);

  const systemSettings = safeParseSystemSettings(
    await zip.file('systemSettings.json')!.async('text')
  ).unsafeUnwrap();
  expect(systemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('export all ballots', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.electionDefinition;
  const { apiClient } = setupApp();

  const electionId = (
    await apiClient.createElection({
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();

  const { zipContents, electionHash } = await apiClient.exportAllBallots({
    electionId,
  });
  const zip = await JsZip.loadAsync(zipContents);

  expect(Object.keys(zip.files)).toEqual(
    baseElectionDefinition.election.precincts.map(
      (precinct) =>
        `ballot-${precinct.name.replaceAll(' ', '_')}-ballot-style-1.pdf`
    )
  );

  for (const file of Object.values(zip.files)) {
    // Ballot appearance is tested by fixtures in libs/hmpb/render-backend.
    expect(await file.async('text')).toContain('%PDF');
  }

  const setupPackageResult = await apiClient.exportSetupPackage({ electionId });
  expect(electionHash).toEqual(setupPackageResult.electionHash);
}, 30_000);
