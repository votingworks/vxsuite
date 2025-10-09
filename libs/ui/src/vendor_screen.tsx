import { Button } from './button';
import { Main } from './main';
import { Screen } from './screen';
import { P } from './typography';
import { UnconfigureMachineButton } from './unconfigure_machine_button';

interface Props {
  logOut?: () => void;
  rebootToVendorMenu: () => Promise<void>;
  unconfigureMachine: () => Promise<void>;
  isMachineConfigured: boolean;
}

export function VendorScreen({
  logOut,
  rebootToVendorMenu,
  unconfigureMachine,
  isMachineConfigured,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <P>
          <Button onPress={rebootToVendorMenu} variant="primary">
            Reboot to Vendor Menu
          </Button>
        </P>
        <P>
          <UnconfigureMachineButton
            unconfigureMachine={unconfigureMachine}
            isMachineConfigured={isMachineConfigured}
          />
        </P>
        {logOut ? (
          <P>
            <Button onPress={logOut}>Lock Machine</Button>
          </P>
        ) : (
          <P>Remove the card to leave this screen.</P>
        )}
      </Main>
    </Screen>
  );
}
