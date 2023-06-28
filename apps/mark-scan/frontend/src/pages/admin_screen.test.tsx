import React from 'react';
import MockDate from 'mockdate';

import {
  asElectionDefinition,
  electionMinimalExhaustiveSampleSinglePrecinctDefinition,
} from '@votingworks/fixtures';
import { fakeKiosk } from '@votingworks/test-utils';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { fakeLogger } from '@votingworks/logging';
import { QueryClientProvider } from '@tanstack/react-query';
import { mockUsbDrive } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import {
  act,
  fireEvent,
  screen,
  within,
} from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { election, defaultPrecinctId } from '../../test/helpers/election';

import { advanceTimers } from '../../test/helpers/timers';

import { AdminScreen, AdminScreenProps } from './admin_screen';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import {
  AriaScreenReader,
  SpeechSynthesisTextToSpeech,
} from '../utils/ScreenReader';
import { RpcApiClientContext, createQueryClient } from '../api';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

MockDate.set('2020-10-31T00:00:00.000Z');

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  window.kiosk = fakeKiosk();
  apiMock = createApiMock();
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(props: Partial<AdminScreenProps> = {}) {
  return render(
    <RpcApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <AdminScreen
          appPrecinct={singlePrecinctSelectionFor(defaultPrecinctId)}
          ballotsPrintedCount={0}
          electionDefinition={asElectionDefinition(election)}
          isLiveMode={false}
          updateAppPrecinct={jest.fn()}
          toggleLiveMode={jest.fn()}
          unconfigure={jest.fn()}
          machineConfig={fakeMachineConfig({
            codeVersion: 'test', // Override default
          })}
          screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
          pollsState="polls_open"
          logger={fakeLogger()}
          usbDrive={mockUsbDrive('mounted')}
          {...props}
        />
      </QueryClientProvider>
    </RpcApiClientContext.Provider>
  );
}

test('renders date and time settings modal', async () => {
  renderScreen();

  advanceTimers();

  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  const startDate = 'Sat, Oct 31, 2020, 12:00 AM UTC';
  screen.getByText(startDate);

  // Open Modal and change date
  fireEvent.click(screen.getByText('Update Date and Time'));

  within(screen.getByTestId('modal')).getByText('Sat, Oct 31, 2020, 12:00 AM');

  const selectYear = screen.getByTestId('selectYear');
  const optionYear =
    within(selectYear).getByText<HTMLOptionElement>('2025').value;
  fireEvent.change(selectYear, { target: { value: optionYear } });

  // Save Date and Timezone
  apiMock.expectLogOut();
  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    fireEvent.click(within(screen.getByTestId('modal')).getByText('Save'));
  });
  expect(window.kiosk?.setClock).toHaveBeenCalledWith({
    isoDatetime: '2025-10-31T00:00:00.000+00:00',
    // eslint-disable-next-line vx/gts-identifiers
    IANAZone: 'UTC',
  });

  // Date is reset to system time after save to kiosk-browser
  screen.getByText(startDate);
});

test('can switch the precinct', () => {
  const updateAppPrecinct = jest.fn();
  renderScreen({ updateAppPrecinct });

  const precinctSelect = screen.getByLabelText('Precinct');
  const allPrecinctsOption =
    within(precinctSelect).getByText<HTMLOptionElement>('All Precincts');
  fireEvent.change(precinctSelect, {
    target: { value: allPrecinctsOption.value },
  });
  expect(updateAppPrecinct).toHaveBeenCalledWith(ALL_PRECINCTS_SELECTION);
});

test('precinct change disabled if polls closed', () => {
  renderScreen({ pollsState: 'polls_closed_final' });

  const precinctSelect = screen.getByLabelText('Precinct');
  expect(precinctSelect).toBeDisabled();
});

test('precinct selection disabled if single precinct election', async () => {
  renderScreen({
    electionDefinition: electionMinimalExhaustiveSampleSinglePrecinctDefinition,
    appPrecinct: singlePrecinctSelectionFor('precinct-1'),
  });

  await screen.findByText('Election Manager Actions');
  expect(screen.getByTestId('selectPrecinct')).toBeDisabled();
  screen.getByText(
    'Precinct cannot be changed because there is only one precinct configured for this election.'
  );
});

test('renders a USB controller button', async () => {
  renderScreen({ usbDrive: mockUsbDrive('absent') });
  await screen.findByText('No USB');

  renderScreen({ usbDrive: mockUsbDrive('mounted') });
  await screen.findByText('Eject USB');
});

test('USB button calls eject', async () => {
  const usbDrive = mockUsbDrive('mounted');

  renderScreen({ usbDrive });
  const ejectButton = await screen.findByText('Eject USB');
  userEvent.click(ejectButton);
  expect(usbDrive.eject).toHaveBeenCalledTimes(1);
});
