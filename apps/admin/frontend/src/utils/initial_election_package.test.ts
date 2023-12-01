import { zipFile } from '@votingworks/test-utils';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { readInitialAdminElectionPackageFromFile } from './initial_election_package';

test('readInitialAdminElectionPackageFromFile happy path', async () => {
  const { electionDefinition, systemSettings } =
    electionTwoPartyPrimaryFixtures;
  const pkg = await zipFile({
    'election.json': electionDefinition.electionData,
    'systemSettings.json': systemSettings.asText(),
  });
  const file = new File([pkg], 'filepath.zip');

  const electionPackage = (
    await readInitialAdminElectionPackageFromFile(file)
  ).unsafeUnwrap();

  const electionObj = JSON.parse(electionPackage.electionString);
  expect(electionObj.title).toEqual('Example Primary Election');
  const systemSettingsObj = JSON.parse(electionPackage.systemSettingsString);
  expect(systemSettingsObj).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('readInitialAdminElectionPackageFromFile invalid zip', async () => {
  const { systemSettings } = electionTwoPartyPrimaryFixtures;
  const pkg = await zipFile({
    'systemSettings.json': systemSettings.asText(),
  });
  const file = new File([pkg], 'filepath.zip');
  const result = await readInitialAdminElectionPackageFromFile(file);
  expect(result.err()).toEqual({
    type: 'invalidZip',
    message: "Error: Zip object does not have a file called 'election.json'",
  });
});
