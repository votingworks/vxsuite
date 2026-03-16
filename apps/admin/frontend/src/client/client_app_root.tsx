import {
  InvalidCardScreen,
  RemoveCardScreen,
  SetupCardReaderPage,
  UnlockMachineScreen,
} from '@votingworks/ui';
import { isSystemAdministratorAuth } from '@votingworks/utils';
import { checkPin, getAuthStatus, getMachineConfig } from './api';
import { AppContext } from '../contexts/app_context';
import { MachineLockedScreen } from '../screens/machine_locked_screen';
import { ClientMainScreen } from './screens/client_main_screen';

export function ClientAppRoot(): JSX.Element | null {
  const authStatusQuery = getAuthStatus.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const checkPinMutation = checkPin.useMutation();

  if (!authStatusQuery.isSuccess || !getMachineConfigQuery.isSuccess) {
    return null;
  }

  const auth = authStatusQuery.data;
  const machineConfig = getMachineConfigQuery.data;

  const hasCardReaderAttached = !(
    auth.status === 'logged_out' && auth.reason === 'no_card_reader'
  );
  if (!hasCardReaderAttached) {
    return <SetupCardReaderPage />;
  }

  if (auth.status === 'checking_pin') {
    return (
      <UnlockMachineScreen
        auth={auth}
        checkPin={
          /* istanbul ignore next - tested via host app @preserve */
          async (pin) => {
            try {
              await checkPinMutation.mutateAsync({ pin });
            } catch {
              // Handled by default query client error handling
            }
          }
        }
      />
    );
  }

  if (auth.status === 'logged_out') {
    if (
      auth.reason === 'machine_locked' ||
      auth.reason === 'machine_locked_by_session_expiry'
    ) {
      return (
        <AppContext.Provider
          value={{
            auth,
            machineConfig,
            isOfficialResults: false,
            usbDrives: [],
          }}
        >
          <MachineLockedScreen />
        </AppContext.Provider>
      );
    }
    return (
      <InvalidCardScreen
        reasonAndContext={auth}
        recommendedAction="Use a system administrator card."
        cardInsertionDirection="right"
      />
    );
  }

  if (auth.status === 'remove_card') {
    return (
      <RemoveCardScreen productName="VxAdmin" cardInsertionDirection="right" />
    );
  }

  if (isSystemAdministratorAuth(auth)) {
    return <ClientMainScreen machineConfig={machineConfig} />;
  }

  return (
    <InvalidCardScreen
      reasonAndContext={{ reason: 'wrong_election' }}
      recommendedAction="Use a system administrator card."
      cardInsertionDirection="right"
    />
  );
}
