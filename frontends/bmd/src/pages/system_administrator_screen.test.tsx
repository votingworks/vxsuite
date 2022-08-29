import React from 'react';
import { fakeLogger } from '@votingworks/logging';
import { screen } from '@testing-library/react';
import { usbstick } from '@votingworks/utils';

import { render } from '../../test/test_utils';
import { SystemAdministratorScreen } from './system_administrator_screen';

test('SystemAdministratorScreen renders expected contents', () => {
  const logger = fakeLogger();
  const unconfigureMachine = jest.fn();
  render(
    <SystemAdministratorScreen
      logger={logger}
      unconfigureMachine={unconfigureMachine}
      isMachineConfigured
      usbDriveStatus={usbstick.UsbDriveStatus.absent}
    />
  );

  // These buttons are further tested in libs/ui
  screen.getByRole('button', { name: 'Reboot from USB' });
  screen.getByRole('button', { name: 'Reboot to BIOS' });
  screen.getByRole('button', { name: 'Unconfigure Machine' });
});
