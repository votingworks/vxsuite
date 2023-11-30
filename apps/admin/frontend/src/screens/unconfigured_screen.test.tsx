import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
  systemSettings,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { suppressingConsoleOutput, zipFile } from '@votingworks/test-utils';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { err } from '@votingworks/basics';
import { renderInAppContext } from '../../test/render_in_app_context';
import { screen } from '../../test/react_testing_library';

import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { UnconfiguredScreen } from './unconfigured_screen';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('handles an uploaded election package zip file', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;

  apiMock.expectConfigure(
    electionDefinition.electionData,
    systemSettings.asText()
  );

  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    electionDefinition: 'NONE',
  });

  const pkg = await zipFile({
    'election.json': electionDefinition.electionData,
    'systemSettings.json': systemSettings.asText(),
  });
  const file = new File([pkg], 'filepath.zip');
  const zipInput = await screen.findByLabelText(
    'Select Existing Setup Package Zip File'
  );
  userEvent.upload(zipInput, file);

  await screen.findByText('Loading');
  // election_manager (the parent component) handles advancing to the next screen so we
  // just need to test that loading is false and we rerender without the loading screen
  await screen.findByLabelText('Select Existing Setup Package Zip File');
});

test('handles an invalid election package zip file', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    electionDefinition: 'NONE',
  });

  const pkgMissingSystemSettings = await zipFile({
    'election.json': electionDefinition.electionData,
  });
  const zipMissingSystemSettings = new File(
    [pkgMissingSystemSettings],
    'filepath.zip'
  );
  const zipInput = await screen.findByLabelText(
    'Select Existing Setup Package Zip File'
  );
  await suppressingConsoleOutput(async () => {
    userEvent.upload(zipInput, zipMissingSystemSettings);
    await screen.findByText('Invalid election package zip file.');
  });
});

test('handles a invalid election definition file', async () => {
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    electionDefinition: 'NONE',
  });

  const pkg = await zipFile({
    'election.json': 'invalid election definition',
    'systemSettings.json': systemSettings.asText(),
  });
  const zip = new File([pkg], 'filepath.zip');
  const zipInput = await screen.findByLabelText(
    'Select Existing Setup Package Zip File'
  );
  apiMock.apiClient.configure
    .expectCallWith({
      electionData: 'invalid election definition',
      systemSettingsData: systemSettings.asText(),
    })
    .resolves(err({ type: 'invalidElection', message: 'Could not parse' }));
  await suppressingConsoleOutput(async () => {
    userEvent.upload(zipInput, zip);
    await screen.findByText('Invalid Election Definition file.');
  });
});

test('handles a invalid system settings file', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    electionDefinition: 'NONE',
  });

  const pkg = await zipFile({
    'election.json': electionDefinition.electionData,
    'systemSettings.json': 'invalid system settings',
  });
  const zip = new File([pkg], 'filepath.zip');
  const zipInput = await screen.findByLabelText(
    'Select Existing Setup Package Zip File'
  );
  apiMock.apiClient.configure
    .expectCallWith({
      electionData: electionDefinition.electionData,
      systemSettingsData: 'invalid system settings',
    })
    .resolves(
      err({ type: 'invalidSystemSettings', message: 'Could not parse' })
    );
  await suppressingConsoleOutput(async () => {
    userEvent.upload(zipInput, zip);
    await screen.findByText('Invalid System Settings file.');
  });
});

test('uploads default system settings if loading only an election.json file', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;

  apiMock.expectConfigure(
    electionDefinition.electionData,
    JSON.stringify(DEFAULT_SYSTEM_SETTINGS)
  );

  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    electionDefinition: 'NONE',
  });

  const file = new File([electionDefinition.electionData], 'election.json');
  const fileInput = await screen.findByLabelText(
    'Select Existing Election Definition File'
  );
  userEvent.upload(fileInput, file);

  await screen.findByText('Loading');
  // election_manager (the parent component) handles advancing to the next screen so we
  // just need to test that loading is false and we rerender without the loading screen
  await screen.findByLabelText('Select Existing Election Definition File');
});

test('uploads default system settings if loading the default election', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  apiMock.expectConfigure(
    electionDefinition.electionData,
    JSON.stringify(DEFAULT_SYSTEM_SETTINGS)
  );

  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    electionDefinition: 'NONE',
  });

  const loadDemoButton = await screen.findByText(
    'Load Demo Election Definition'
  );
  userEvent.click(loadDemoButton);

  // election_manager (the parent component) handles advancing to the next screen so we
  // just need to test that loading is false and we rerender without the loading screen
  await screen.findByLabelText('Select Existing Election Definition File');
});
