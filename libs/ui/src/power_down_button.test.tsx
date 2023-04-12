import React from 'react';
import userEvent from '@testing-library/user-event';
import { fakeKiosk } from '@votingworks/test-utils';
import { Logger, LogSource } from '@votingworks/logging';
import { render, screen, waitFor } from '../test/react_testing_library';

import { PowerDownButton } from './power_down_button';

beforeEach(() => {
  window.kiosk = fakeKiosk();
});

test('renders as expected.', async () => {
  render(
    <PowerDownButton
      logger={new Logger(LogSource.VxAdminFrontend)}
      userRole="poll_worker"
    />
  );

  userEvent.click(screen.getByText('Power Down'));
  await screen.findByText(/Powering Down/);
  await waitFor(() => expect(window.kiosk!.powerDown).toHaveBeenCalledTimes(1));
});
