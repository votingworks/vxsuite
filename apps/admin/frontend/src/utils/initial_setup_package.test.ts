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

  const setupPackage = await readInitialAdminSetupPackageFromFile(file);

  const electionObj = JSON.parse(setupPackage.electionString);
  expect(electionObj.title).toEqual('Example Primary Election');
  const systemSettingsObj = JSON.parse(setupPackage.systemSettingsString);
  expect(systemSettingsObj).toEqual(DEFAULT_SYSTEM_SETTINGS);
});
