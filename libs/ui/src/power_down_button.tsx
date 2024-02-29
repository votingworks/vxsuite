import { useState } from 'react';
import { Button } from './button';
import { Loading } from './loading';
import { Modal } from './modal';
import { useSystemCallApi } from './system_call_api';

/**
 * Button that powers down the machine.
 */
export function PowerDownButton(): JSX.Element {
  const [isPoweringDown, setIsPoweringDown] = useState(false);
  const api = useSystemCallApi();
  const powerDownMutation = api.powerDown.useMutation();

  function reboot() {
    setIsPoweringDown(true);
    powerDownMutation.mutate();
  }

  if (isPoweringDown) {
    return <Modal content={<Loading>Powering Down</Loading>} />;
  }
  return <Button onPress={reboot}>Power Down</Button>;
}
