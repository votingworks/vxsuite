import { LogEventId, Logger } from '@votingworks/logging';
import { assert } from '@votingworks/basics';
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
export function RebootToBiosButton({ logger }: Props): JSX.Element {
  const [isRebooting, setIsRebooting] = useState(false);
  async function reboot() {
    assert(window.kiosk);
    await logger.log(LogEventId.RebootMachine, 'system_administrator', {
      message: 'User trigged a reboot of the machine to BIOS screen…',
    });
    setIsRebooting(true);
    await window.kiosk.rebootToBios();
  }

  if (isRebooting) {
    return <Modal content={<Loading>Rebooting</Loading>} />;
  }
  return <Button onPress={reboot}>Reboot to BIOS</Button>;
}
