import { useState } from 'react';
import { Button } from './button';
import { Loading } from './loading';
import { Modal } from './modal';
import { useSystemCallApi } from './system_call_api';

/**
 * Button that reboots into the BIOS setup.
 */
export function RebootToBiosButton(): JSX.Element {
  const [isRebooting, setIsRebooting] = useState(false);

  const api = useSystemCallApi();
  const rebootToBiosMutation = api.rebootToBios.useMutation();

  function reboot() {
    setIsRebooting(true);
    rebootToBiosMutation.mutate();
  }

  if (isRebooting) {
    return <Modal content={<Loading>Rebooting</Loading>} />;
  }
  return <Button onPress={reboot}>Reboot to BIOS</Button>;
}
