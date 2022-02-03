import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import MockDate from 'mockdate';

import userEvent from '@testing-library/user-event';
import { fakeKiosk } from '@votingworks/test-utils';
import { renderInAppContext } from '../../test/render_in_app_context';
import { AdvancedScreen } from './advanced_screen';

describe('Advanced Screen', () => {
  beforeAll(() => {
    MockDate.set('2020-10-31T00:00:00.000Z');
    window.kiosk = fakeKiosk();
  });

  it('shows the current date and time and a button to update it', async () => {
    renderInAppContext(<AdvancedScreen />);
    screen.getByRole('heading', { name: 'Advanced Options' });

    // We just do a simple happy path test here, since the libs/ui/set_clock unit
    // tests cover full behavior
    screen.getByRole('heading', { name: 'Current Date and Time' });
    const startDate = 'Sat, Oct 31, 2020, 12:00 AM UTC';
    screen.getByText(startDate);

    userEvent.click(
      screen.getByRole('button', { name: 'Update Date and Time' })
    );

    // Open modal
    const modal = screen.getByRole('alertdialog');
    within(modal).getByText('Sat, Oct 31, 2020, 12:00 AM');

    // Change date
    const selectYear = screen.getByTestId('selectYear');
    userEvent.selectOptions(selectYear, '2025');

    // Save date
    userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(window.kiosk?.setClock).toHaveBeenCalledWith({
        isoDatetime: '2025-10-31T00:00:00.000+00:00',
        // eslint-disable-next-line vx/gts-identifiers
        IANAZone: 'UTC',
      });
    });

    // Date is reset to system time after save to kiosk-browser
    screen.getByText(startDate);
  });
});
