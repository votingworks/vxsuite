import { LogEventId, Logger } from '@votingworks/logging';
import { useState } from 'react';
import { UserRole } from '@votingworks/types';
import { Button } from './button';
import { Loading } from './loading';
import { Modal } from './modal';
import { useSystemCallApi } from './system_call_api';

interface Props {
  logger: Logger;
  userRole: UserRole;
}

/**
 * Button that powers down the machine.
 */
export function PowerDownButton({ logger, userRole }: Props): JSX.Element {
  const [isPoweringDown, setIsPoweringDown] = useState(false);
  const api = useSystemCallApi();
  const powerDownMutation = api.powerDown.useMutation();

  async function reboot() {
    await logger.log(LogEventId.PowerDown, userRole, {
      message: 'User triggered the machine to power down.',
    });
    setIsPoweringDown(true);
    powerDownMutation.mutate();
  }

  if (isPoweringDown) {
    return <Modal content={<Loading>Powering Down</Loading>} />;
  }
  return <Button onPress={reboot}>Power Down</Button>;
}
