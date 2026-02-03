import { Button } from './button';
import { Main } from './main';
import { Screen } from './screen';
import {
  SignedHashValidationApiClient,
  SignedHashValidationButton,
} from './signed_hash_validation_button';
import { P } from './typography';
import { UnconfigureMachineButton } from './unconfigure_machine_button';

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
