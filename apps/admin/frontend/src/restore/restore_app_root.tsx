import {
  InvalidCardScreen,
  RemoveCardScreen,
  SetupCardReaderPage,
  UnlockMachineScreen,
} from '@votingworks/ui';
import { checkPin, getAuthStatus, getMachineConfig } from './api.js';
import { ScreenWithBanner } from './components/restore_mode_banner.js';
import { RestoreScreen } from './screens/restore_screen.js';
import { MachineLockedScreen } from '../screens/machine_locked_screen.js';

export function RestoreAppRoot(): JSX.Element | null {
  const authStatusQuery = getAuthStatus.usePollingQuery();
  const machineConfigQuery = getMachineConfig.useQuery();
  const checkPinMutation = checkPin.useMutation();

  if (!authStatusQuery.isSuccess || !machineConfigQuery.isSuccess) {
    return null;
  }

  const auth = authStatusQuery.data;
  const machineConfig = machineConfigQuery.data;

  if (auth.status === 'logged_out' && auth.reason === 'no_card_reader') {
    return (
      <ScreenWithBanner>
        <SetupCardReaderPage />
      </ScreenWithBanner>
    );
  }

  if (auth.status === 'checking_pin') {
    return (
      <ScreenWithBanner>
        <UnlockMachineScreen
          auth={auth}
          checkPin={
            // @coverage-exclude
            async (pin) => {
              try {
                await checkPinMutation.mutateAsync({ pin });
              } catch {
                // Handled by default query client error handling
              }
            }
          }
        />
      </ScreenWithBanner>
    );
  }

  if (auth.status === 'remove_card') {
    return (
      <ScreenWithBanner>
        <RemoveCardScreen
          productName="VxAdmin"
          cardInsertionDirection="right"
        />
      </ScreenWithBanner>
    );
  }

  if (auth.status === 'logged_out') {
    if (
      auth.reason === 'machine_locked' ||
      auth.reason === 'machine_locked_by_session_expiry'
    ) {
      return (
        <ScreenWithBanner>
          <MachineLockedScreen machineConfig={machineConfig} />
        </ScreenWithBanner>
      );
    }
    return (
      <ScreenWithBanner>
        <InvalidCardScreen
          reasonAndContext={auth}
          recommendedAction="Use a system administrator card."
          cardInsertionDirection="right"
        />
      </ScreenWithBanner>
    );
  }

  return <RestoreScreen machineConfig={machineConfig} />;
}
