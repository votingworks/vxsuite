import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { screen, within } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { SettingsScreenProps, SettingsScreen } from './settings_screen';
import { ApiMock, createApiMock } from '../../test/api';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetTestMode(false);
  apiMock.setStatus();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(
  props: Partial<SettingsScreenProps> = {},
  history = createMemoryHistory()
) {
  return renderInAppContext(
    <SettingsScreen canUnconfigure={false} {...props} />,
    { apiMock, history }
  );
}

test('Unconfigure Machine button is disabled when canUnconfigure is falsy', () => {
  renderScreen({
    canUnconfigure: false,
  });

  expect(screen.getButton('Unconfigure Machine')).toBeDisabled();
});

test('clicking "Unconfigure Machine" calls backend', async () => {
  const history = createMemoryHistory({ initialEntries: ['/admin'] });
  renderScreen({ canUnconfigure: true }, history);

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

  vi.useRealTimers();
});
