import { useState } from 'react';
import { Button, ButtonProps } from './button';
import { Loading } from './loading';
import { Modal } from './modal';
import { useSystemCallApi } from './system_call_api';

export type PowerDownButtonProps = Omit<ButtonProps, 'onPress'>;

/**
 * Button that powers down the machine.
 */
export function PowerDownButton(props: PowerDownButtonProps): JSX.Element {
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
  return (
    <Button {...props} onPress={reboot}>
      Power Down
    </Button>
  );
}
