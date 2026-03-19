import { useState } from 'react';
import { Button, ButtonProps } from './button.js';
import { Loading } from './loading.js';
import { Modal } from './modal.js';
import { useSystemCallApi } from './system_call_api.js';

export type PowerDownButtonProps = Omit<
  ButtonProps,
  'onPress' | 'value' | 'type'
>;

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
