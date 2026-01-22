import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';

import { screen, waitFor, within } from '../test/react_testing_library';
import { newTestContext } from '../test/test_context';
import { ToggleUsbPortsButton } from './toggle_usb_ports_button';

test('ToggleUsbPortsButton interactions', async () => {
  const { mockApiClient, render } = newTestContext({ skipUiStringsApi: true });
  mockApiClient.getUsbPortStatus.mockResolvedValue({
    enabled: true,
  });
  render(<ToggleUsbPortsButton />);

  // Click to disable USB ports but cancel in the confirmation modal
  userEvent.click(screen.getByRole('button', { name: 'Disable USB Ports' }));
  let modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Disable USB Ports' });
  userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  expect(mockApiClient.toggleUsbPorts).not.toHaveBeenCalled();

  // Click to disable USB ports and confirm in the confirmation modal
  userEvent.click(screen.getByRole('button', { name: 'Disable USB Ports' }));
  modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Disable USB Ports' });
  userEvent.click(
    within(modal).getByRole('button', { name: 'Disable USB Ports' })
  );
  mockApiClient.getUsbPortStatus.mockResolvedValue({ enabled: false });
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  expect(mockApiClient.toggleUsbPorts).toHaveBeenCalledTimes(1);
  expect(mockApiClient.toggleUsbPorts).toHaveBeenLastCalledWith({
    action: 'disable',
  });

  // Re-enable USB ports
  userEvent.click(screen.getByRole('button', { name: 'Enable USB Ports' }));
  mockApiClient.getUsbPortStatus.mockResolvedValue({ enabled: true });
  await screen.findByRole('button', { name: 'Disable USB Ports' });
  expect(mockApiClient.toggleUsbPorts).toHaveBeenCalledTimes(2);
  expect(mockApiClient.toggleUsbPorts).toHaveBeenLastCalledWith({
    action: 'enable',
  });
});

test('onlyShowWhenDisabled hides button when USB ports are enabled', async () => {
  const { mockApiClient, render: renderWithContext } = newTestContext({
    skipUiStringsApi: true,
  });
  mockApiClient.getUsbPortStatus.mockResolvedValue({
    enabled: true,
  });
  const { container } = renderWithContext(
    <ToggleUsbPortsButton onlyShowWhenDisabled />
  );

  // Wait for query to resolve
  await waitFor(() =>
    expect(mockApiClient.getUsbPortStatus).toHaveBeenCalled()
  );

  // Button should not be rendered when USB ports are enabled
  expect(
    screen.queryByRole('button', { name: /USB Ports/i })
  ).not.toBeInTheDocument();
  expect(container).toBeEmptyDOMElement();
});

test('onlyShowWhenDisabled shows button when USB ports are disabled', async () => {
  const { mockApiClient, render: renderWithContext } = newTestContext({
    skipUiStringsApi: true,
  });
  mockApiClient.getUsbPortStatus.mockResolvedValue({
    enabled: false,
  });
  renderWithContext(<ToggleUsbPortsButton onlyShowWhenDisabled />);

  // Button should be rendered when USB ports are disabled
  await screen.findByRole('button', { name: 'Enable USB Ports' });
});
