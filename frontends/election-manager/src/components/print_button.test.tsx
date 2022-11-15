import React from 'react';
import { waitFor, screen, within, render } from '@testing-library/react';
import { advancePromises, fakeKiosk } from '@votingworks/test-utils';

import userEvent from '@testing-library/user-event';
import { PrintButton } from './print_button';
import { renderInAppContext } from '../../test/render_in_app_context';

beforeEach(() => {
  jest.useFakeTimers();
});

test('happy path flow', async () => {
  window.kiosk = fakeKiosk();
  const mockPrint = jest.fn();
  renderInAppContext(<PrintButton print={mockPrint}>Print</PrintButton>, {
    hasPrinterAttached: true,
  });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Print' }));
  within(screen.getByRole('alertdialog')).getByText('Printing');
  expect(mockPrint).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(3000);
  await waitFor(() => {
    expect(screen.queryByText('Printing')).not.toBeInTheDocument();
  });
  delete window.kiosk;
});

test('does not expect a printer attached in browser mode', async () => {
  const mockPrint = jest.fn();
  renderInAppContext(<PrintButton print={mockPrint}>Print</PrintButton>, {
    hasPrinterAttached: false,
  });
  userEvent.click(screen.getByRole('button', { name: 'Print' }));
  await waitFor(() => {
    expect(mockPrint).toHaveBeenCalled();
  });
});

test('has option to not show the default progress modal', async () => {
  const mockPrint = jest.fn();
  render(
    <PrintButton print={mockPrint} useDefaultProgressModal={false}>
      Print
    </PrintButton>
  );
  userEvent.click(screen.getByRole('button', { name: 'Print' }));
  expect(mockPrint).toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();

  // to prevent test warnings for state updates after teardown
  await advancePromises();
});

test('shows printer not connected warning', () => {
  window.kiosk = fakeKiosk();
  const mockPrint = jest.fn();
  renderInAppContext(
    <PrintButton print={mockPrint} useDefaultProgressModal={false}>
      Print
    </PrintButton>,
    { hasPrinterAttached: false }
  );
  userEvent.click(screen.getByRole('button', { name: 'Print' }));
  const modal = screen.getByRole('alertdialog');
  within(modal).getByText('The printer is not connected.');
  expect(mockPrint).not.toHaveBeenCalled();
  expect(
    within(modal).queryByRole('button', { name: 'Continue' })
  ).toBeDisabled();
  userEvent.click(within(modal).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  delete window.kiosk;
});

// The path in which you connect a printer and select "Continue" from the
// PrinterNotConnectedModal is covered in app.test.tsx
