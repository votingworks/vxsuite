import { zipFile } from '@votingworks/test-utils';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { readInitialAdminSetupPackageFromFile } from './initial_setup_package';

test('readInitialAdminSetupPackageFromFile happy path', async () => {
  const { electionDefinition, systemSettings } =
    electionTwoPartyPrimaryFixtures;
  const pkg = await zipFile({
    'election.json': electionDefinition.electionData,
    'systemSettings.json': systemSettings.asText(),
  });
  const file = new File([pkg], 'filepath.zip');

  const setupPackage = (
    await readInitialAdminSetupPackageFromFile(file)
  ).unsafeUnwrap();

  const electionObj = JSON.parse(setupPackage.electionString);
  expect(electionObj.title).toEqual('Example Primary Election');
  const systemSettingsObj = JSON.parse(setupPackage.systemSettingsString);
  expect(systemSettingsObj).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('readInitialAdminSetupPackageFromFile invalid zip', async () => {
  const { systemSettings } = electionTwoPartyPrimaryFixtures;
  const pkg = await zipFile({
    'systemSettings.json': systemSettings.asText(),
  });
  const file = new File([pkg], 'filepath.zip');
  const result = await readInitialAdminSetupPackageFromFile(file);
  expect(result.err()).toEqual({
    type: 'invalidZip',
    message: "Error: Zip object does not have a file called 'election.json'",
  });
});
