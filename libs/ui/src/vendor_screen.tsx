import { Button } from './button.js';
import { Main } from './main.js';
import { Screen } from './screen.js';
import {
  SignedHashValidationApiClient,
  SignedHashValidationButton,
} from './signed_hash_validation_button.js';
import { P } from './typography.js';
import { UnconfigureMachineButton } from './unconfigure_machine_button.js';

interface VendorScreenApiClient extends SignedHashValidationApiClient {
  rebootToVendorMenu: () => Promise<void>;
}

interface Props {
  apiClient: VendorScreenApiClient;
  isMachineConfigured: boolean;
  logOut?: () => void;
  unconfigureMachine: () => Promise<void>;
}

export function VendorScreen({
  apiClient,
  isMachineConfigured,
  logOut,
  unconfigureMachine,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <P>
          <Button onPress={apiClient.rebootToVendorMenu} variant="primary">
            Reboot to Vendor Menu
          </Button>
        </P>
        <P>
          <UnconfigureMachineButton
            unconfigureMachine={unconfigureMachine}
            isMachineConfigured={isMachineConfigured}
          />
        </P>
        <P>
          <SignedHashValidationButton apiClient={apiClient} />
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
