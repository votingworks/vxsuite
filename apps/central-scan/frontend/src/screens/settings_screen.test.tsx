import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { MIN_TIME_TO_UNCONFIGURE_MACHINE_MS } from '@votingworks/ui';
import { screen, within } from '../../test/react_testing_library.js';
import { renderInAppContext } from '../../test/render_in_app_context.js';
import { type SettingsScreenProps, SettingsScreen } from './settings_screen.js';
import { type ApiMock, createApiMock } from '../../test/api.js';

// The famous names fixture defines a 'central-scanning' absentee polling place.
const electionWithPollingPlaces =
  electionFamousNames2021Fixtures.readElectionDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetTestMode(false);
  apiMock.setStatus();
  apiMock.expectGetPollingPlaceId();
  apiMock.expectGetImprintingStatus();
});

afterEach(() => {
  vi.useRealTimers();
  apiMock.assertComplete();
});

function renderScreen(
  props: Partial<SettingsScreenProps> = {},
  history = createMemoryHistory()
) {
  return renderInAppContext(
    <SettingsScreen
      canUnconfigure={false}
      hasScannedBatches={false}
      isBatchOpen={false}
      {...props}
    />,
    { apiMock, history }
  );
}

test('disables election settings when canUnconfigure is falsy', async () => {
  renderScreen({
    canUnconfigure: false,
  });

  expect(screen.getButton('Unconfigure Machine')).toBeDisabled();
  expect(
    await screen.findByRole('option', { name: 'Test Ballot Mode' })
  ).toBeDisabled();
  screen.getByText('You must save CVRs before changing election settings.');
});

test('disables election settings while a batch is open', async () => {
  renderScreen({ canUnconfigure: true, isBatchOpen: true });

  expect(screen.getButton('Unconfigure Machine')).toBeDisabled();
  expect(
    await screen.findByRole('option', { name: 'Test Ballot Mode' })
  ).toBeDisabled();
  screen.getByText(
    'You cannot change election settings while a batch is in progress.'
  );
});

test('shows only the open-batch warning when CVRs are also unsaved', () => {
  renderScreen({ canUnconfigure: false, isBatchOpen: true });

  screen.getByText(
    'You cannot change election settings while a batch is in progress.'
  );
  expect(
    screen.queryByText('You must save CVRs before changing election settings.')
  ).not.toBeInTheDocument();
});

test('clicking "Unconfigure Machine" calls backend', async () => {
  const history = createMemoryHistory({ initialEntries: ['/admin'] });
  renderScreen({ canUnconfigure: true }, history);
  expect(
    await screen.findByRole('option', { name: 'Test Ballot Mode' })
  ).toBeEnabled();
  expect(screen.queryByText(/election settings/)).not.toBeInTheDocument();

  // initial button
  userEvent.click(screen.getButton('Unconfigure Machine'));

  // confirmation
  apiMock.expectUnconfigure({ ignoreBackupRequirement: false });
  apiMock.expectEjectUsbDrive();
  screen.getByRole('heading', { name: 'Unconfigure Machine' });
  userEvent.click(await screen.findButton('Delete All Election Data'));

  // progress message
  await screen.findByText('Unconfiguring Machine');

  // we are redirected to the dashboard
  expect(history.location.pathname).toEqual('/');

  // Without this, UnconfigureMachineButton's delayed close lands after this
  // file's jsdom environment is torn down.
  await vi.waitFor(
    () => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    },
    { timeout: MIN_TIME_TO_UNCONFIGURE_MACHINE_MS * 2 }
  );
});

test('clicking "Update Date and Time" shows modal to set clock', async () => {
  vi.useFakeTimers().setSystemTime(new Date('2020-10-31T00:00:00.000'));

  renderScreen();

  screen.getByRole('heading', { name: 'Settings' });

  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  userEvent.click(screen.getByRole('button', { name: 'Set Date and Time' }));

  // Open modal
  const modal = screen.getByRole('alertdialog');
  within(modal).getByText('Sat, Oct 31, 2020, 12:00 AM AKDT');

  // Change date
  const selectYear = screen.getByTestId('selectYear');
  userEvent.selectOptions(selectYear, '2025');

  // Save date
  apiMock.apiClient.setClock
    .expectCallWith({
      isoDatetime: '2025-10-31T00:00:00.000-08:00',
      ianaZone: 'America/Anchorage',
    })
    .resolves();
  apiMock.expectLogOut();
  userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('shows a polling place picker when the election has polling places', async () => {
  apiMock.expectSetPollingPlaceId({ id: 'central-scanning' });
  renderInAppContext(
    <SettingsScreen
      canUnconfigure={false}
      hasScannedBatches={false}
      isBatchOpen={false}
    />,
    { apiMock, electionDefinition: electionWithPollingPlaces }
  );

  await screen.findByRole('heading', { name: 'Polling Place' });
  userEvent.click(screen.getByLabelText('Select a polling place…'));
  userEvent.click(screen.getByText('Central Scanning'));
  await vi.waitFor(() => apiMock.assertComplete());
});

test('disables the polling place picker after scanning has begun', async () => {
  renderInAppContext(
    <SettingsScreen
      canUnconfigure={false}
      hasScannedBatches
      isBatchOpen={false}
    />,
    { apiMock, electionDefinition: electionWithPollingPlaces }
  );

  await screen.findByRole('heading', { name: 'Polling Place' });
  expect(screen.getByLabelText('Select a polling place…')).toBeDisabled();
  screen.getByText(
    'You cannot change the polling place once ballots have been scanned.'
  );
});

test('imprinting status', async () => {
  renderScreen();

  apiMock.expectGetImprintingStatus({
    isImprinterAttached: true,
    isImprintingEnabled: true,
  });
  await screen.findByText('Imprinter detected');
  await vi.waitFor(() =>
    expect(
      screen.getByRole('option', { name: 'Imprinting Enabled' })
    ).toHaveAttribute('aria-selected', 'true')
  );

  apiMock.expectGetImprintingStatus({
    isImprinterAttached: false,
    isImprintingEnabled: true,
  });
  await screen.findByText(
    'Imprinter not detected. Ballots won’t be imprinted, even if imprinting is enabled below.'
  );

  apiMock.expectSetIsImprintingEnabled(false);
  apiMock.expectGetImprintingStatus({
    isImprinterAttached: true,
    isImprintingEnabled: false,
  });
  userEvent.click(screen.getByRole('option', { name: 'Imprinting Disabled' }));
  await vi.waitFor(() =>
    expect(
      screen.getByRole('option', { name: 'Imprinting Disabled' })
    ).toHaveAttribute('aria-selected', 'true')
  );

  apiMock.expectSetIsImprintingEnabled(true);
  apiMock.expectGetImprintingStatus({
    isImprinterAttached: true,
    isImprintingEnabled: true,
  });
  userEvent.click(screen.getByRole('option', { name: 'Imprinting Enabled' }));
  await vi.waitFor(() =>
    expect(
      screen.getByRole('option', { name: 'Imprinting Enabled' })
    ).toHaveAttribute('aria-selected', 'true')
  );
});

test('disables the imprinting toggle when a batch is open', async () => {
  renderScreen({ isBatchOpen: true });

  expect(
    await screen.findByRole('option', { name: 'Imprinting Enabled' })
  ).toBeDisabled();
  expect(
    await screen.findByRole('option', { name: 'Imprinting Disabled' })
  ).toBeDisabled();
  screen.getByText(
    'You cannot toggle imprinting while a batch is in progress.'
  );
});
