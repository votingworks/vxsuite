import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { fakeKiosk } from '@votingworks/test-utils';

import { usbstick } from '@votingworks/utils';

import { Logger, LogSource } from '@votingworks/logging';
import { render } from '../../test/test_utils';

import { SuperAdminScreen } from './superadmin_screen';

const logger = new Logger(LogSource.VxBallotMarkingDeviceService);

it('the right buttons and reset calls quit', () => {
  render(
    <SuperAdminScreen
      usbDriveStatus={usbstick.UsbDriveStatus.absent}
      useEffectToggleLargeDisplay={jest.fn()}
      logger={logger}
    />
  );
  screen.getByText('Reboot from USB');
  screen.getByText('Reset');

  // test without kiosk
  fireEvent.click(screen.getByText('Reset'));

  // test with kiosk
  window.kiosk = fakeKiosk();
  fireEvent.click(screen.getByText('Reset'));

  expect(window.kiosk.quit).toHaveBeenCalledTimes(1);
});
