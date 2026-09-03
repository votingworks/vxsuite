import {
  H1,
  H3,
  InfoBar,
  InvalidCardScreen,
  Main,
  RemoveCardScreen,
  Screen,
  SetupCardReaderPage,
  SystemInfo,
  UnlockMachineScreen,
} from '@votingworks/ui';
import type { MachineConfig } from '@votingworks/admin-backend';
import { checkPin, getAuthStatus, getMachineConfig } from './api.js';
import { RestoreScreen } from './screens/restore_screen.js';

function RestoreModeLockedScreen({
  machineConfig,
}: {
  machineConfig: MachineConfig;
}): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <div>
          <H1 align="center">VxAdmin Locked</H1>
          <H3 align="center" style={{ fontWeight: 'normal' }}>
            VxAdmin is in restore mode. Insert a system administrator card to
            unlock.
          </H3>
        </div>
      </Main>
      <InfoBar>
        <SystemInfo
          mode="admin"
          codeVersion={machineConfig.codeVersion}
          machineId={machineConfig.machineId}
        />
      </InfoBar>
    </Screen>
  );
}

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
    return <SetupCardReaderPage />;
  }

  if (auth.status === 'checking_pin') {
    return (
      <UnlockMachineScreen
        auth={auth}
        checkPin={
          // @coverage-exclude: tested via host app
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

  if (auth.status === 'remove_card') {
    return (
      <RemoveCardScreen productName="VxAdmin" cardInsertionDirection="right" />
    );
  }

  if (auth.status === 'logged_out') {
    if (
      auth.reason === 'machine_locked' ||
      auth.reason === 'machine_locked_by_session_expiry'
    ) {
      return <RestoreModeLockedScreen machineConfig={machineConfig} />;
    }
    return (
      <InvalidCardScreen
        reasonAndContext={auth}
        recommendedAction="Use a system administrator card."
        cardInsertionDirection="right"
      />
    );
  }

  return <RestoreScreen machineConfig={machineConfig} />;
}
