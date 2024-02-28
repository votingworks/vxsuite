import { LogEventId, BaseLogger } from '@votingworks/logging';
import { useState } from 'react';
import { Button } from './button';
import { Loading } from './loading';
import { Modal } from './modal';
import { useSystemCallApi } from './system_call_api';

interface Props {
  logger: BaseLogger;
}

/**
 * Button that reboots into the BIOS setup.
 */
export function RebootToBiosButton({ logger }: Props): JSX.Element {
  const [isRebooting, setIsRebooting] = useState(false);

  const api = useSystemCallApi();
  const rebootToBiosMutation = api.rebootToBios.useMutation();

  async function reboot() {
    await logger.log(LogEventId.RebootMachine, 'system_administrator', {
      message: 'User trigged a reboot of the machine to BIOS screen…',
    });
    setIsRebooting(true);
    rebootToBiosMutation.mutate();
  }

  if (isRebooting) {
    return <Modal content={<Loading>Rebooting</Loading>} />;
  }
  return <Button onPress={reboot}>Reboot to BIOS</Button>;
}
