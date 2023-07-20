import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleFixtures,
  systemSettings,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { zipFile } from '@votingworks/test-utils';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { renderInAppContext } from '../../test/render_in_app_context';
import { screen } from '../../test/react_testing_library';

import { ApiMock, createApiMock } from '../../test/helpers/api_mock';
import { UnconfiguredScreen } from './unconfigured_screen';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('renders a button to load setup package', async () => {
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
  });

  await screen.findByText('Select Existing Setup Package Zip File');
});

test('handles an uploaded file', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;

  apiMock.expectConfigure(electionDefinition.electionData);
  apiMock.expectSetSystemSettings(systemSettings.asText());

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
  await userEvent.upload(zipInput, file);

  await screen.findByText('Loading');
  // election_manager (the parent component) handles advancing to the next screen so we
  // just need to test that loading is false and we rerender without the loading screen
  await screen.findByLabelText('Select Existing Setup Package Zip File');
});

test('uploads default system settings if loading only an election.json file', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;

  apiMock.expectConfigure(electionDefinition.electionData);
  apiMock.expectSetSystemSettings(JSON.stringify(DEFAULT_SYSTEM_SETTINGS));

  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    electionDefinition: 'NONE',
  });

  const file = new File([electionDefinition.electionData], 'election.json');
  const fileInput = await screen.findByLabelText(
    'Select Existing Election Definition File'
  );
  await userEvent.upload(fileInput, file);

  await screen.findByText('Loading');
  // election_manager (the parent component) handles advancing to the next screen so we
  // just need to test that loading is false and we rerender without the loading screen
  await screen.findByLabelText('Select Existing Election Definition File');
});

test('uploads default system settings if loading the default election', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  apiMock.expectConfigure(electionDefinition.electionData);
  apiMock.expectSetSystemSettings(JSON.stringify(DEFAULT_SYSTEM_SETTINGS));

  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    electionDefinition: 'NONE',
  });

  const loadDemoButton = await screen.findByText(
    'Load Demo Election Definition'
  );
  await userEvent.click(loadDemoButton);

  // election_manager (the parent component) handles advancing to the next screen so we
  // just need to test that loading is false and we rerender without the loading screen
  await screen.findByLabelText('Select Existing Election Definition File');
});
