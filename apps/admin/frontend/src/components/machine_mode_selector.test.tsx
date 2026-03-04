import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderInAppContext } from '../../test/render_in_app_context';
import { screen } from '../../test/react_testing_library';
import { MachineModeSelector } from './machine_mode_selector';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('renders with current machine mode selected', () => {
  renderInAppContext(<MachineModeSelector />, {
    apiMock,
    machineMode: 'traditional',
  });

  screen.getByRole('heading', { name: 'Machine Mode' });
  const traditionalButton = screen.getByRole('option', {
    name: 'Traditional',
    selected: true,
  });
  expect(traditionalButton).toBeDefined();
});

test('renders host mode as selected', () => {
  renderInAppContext(<MachineModeSelector />, {
    apiMock,
    machineMode: 'host',
  });

  screen.getByRole('option', { name: 'Host', selected: true });
});

test('calls setMachineMode mutation on selection change', async () => {
  apiMock.expectSetMachineMode('client');
  renderInAppContext(<MachineModeSelector />, {
    apiMock,
    machineMode: 'traditional',
  });

  userEvent.click(screen.getByRole('option', { name: 'Client' }));
  await vi.waitFor(() => apiMock.assertComplete());
});
