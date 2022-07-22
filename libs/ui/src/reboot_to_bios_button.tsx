import { LogEventId, Logger } from '@votingworks/logging';
import { assert } from '@votingworks/utils';
import React, { useState } from 'react';
import { Button } from './button';
import { Loading } from './loading';
import { Modal } from './modal';

interface Props {
  logger: Logger;
}

/**
 * Button that reboots into the BIOS setup.
 */

// eslint-disable-next-line vx/gts-identifiers
export function RebootToBiosButton({ logger }: Props): JSX.Element {
  const [isRebooting, setIsRebooting] = useState(false);
  async function reboot() {
    assert(window.kiosk);
    await logger.log(LogEventId.RebootMachine, 'superadmin', {
      message: 'User trigged a reboot of the machine to BIOS screen…',
    });
    setIsRebooting(true);
    // eslint-disable-next-line vx/gts-identifiers
    await window.kiosk.rebootToBios();
  }

  if (isRebooting) {
    return <Modal content={<Loading>Rebooting…</Loading>} />;
  }
  return <Button onPress={reboot}>Reboot to BIOS</Button>;
}
