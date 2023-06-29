import { LogEventId, Logger } from '@votingworks/logging';
import { assert } from '@votingworks/basics';
import { useState } from 'react';
import { UserRole } from '@votingworks/types';
import { Button } from './button';
import { Loading } from './loading';
import { Modal } from './modal';

interface Props {
  logger: Logger;
  userRole: UserRole;
}

/**
 * Button that powers down the machine.
 */
export function PowerDownButton({ logger, userRole }: Props): JSX.Element {
  const [isPoweringDown, setIsPoweringDown] = useState(false);
  async function reboot() {
    assert(window.kiosk);
    await logger.log(LogEventId.PowerDown, userRole, {
      message: 'User triggered the machine to power down.',
    });
    setIsPoweringDown(true);
    await window.kiosk.powerDown();
  }

  if (isPoweringDown) {
    return <Modal content={<Loading>Powering Down</Loading>} />;
  }
  return <Button onPress={reboot}>Power Down</Button>;
}
