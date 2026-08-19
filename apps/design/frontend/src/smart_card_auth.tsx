import React from 'react';
import {
  FullScreenIconWrapper,
  FullScreenMessage,
  Icons,
  InvalidCardScreen,
  LoadingAnimation,
  Main,
  RemoveCardScreen,
  Screen,
  SetupCardReaderPage,
  UnlockMachineScreen,
} from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/basics';
import { checkPin, getAuthStatus } from './auth_api.js';

function MachineLockedScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <FullScreenMessage
          title="VxDesign Locked"
          image={
            <FullScreenIconWrapper>
              <Icons.Lock />
            </FullScreenIconWrapper>
          }
        >
          Insert a system administrator card to unlock.
        </FullScreenMessage>
      </Main>
    </Screen>
  );
}

/**
 * Gates the app behind VxSuite smart card auth for offline deployments. Hosted
 * deployments authenticate users with Auth0 instead, in which case the backend
 * reports no smart card auth status and this renders the app directly.
 */
export function SmartCardAuthGate({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const getAuthStatusQuery = getAuthStatus.useQuery();
  const checkPinMutation = checkPin.useMutation();

  if (!getAuthStatusQuery.isSuccess) {
    return (
      <Screen>
        <Main centerChild>
          <LoadingAnimation />
        </Main>
      </Screen>
    );
  }

  const authStatus = getAuthStatusQuery.data;
  if (!authStatus) {
    return children;
  }

  switch (authStatus.status) {
    case 'logged_in':
      return children;

    case 'checking_pin':
      return (
        <UnlockMachineScreen
          auth={authStatus}
          checkPin={async (pin) => {
            try {
              await checkPinMutation.mutateAsync({ pin });
            } catch {
              // Handled by default query client error handling
            }
          }}
        />
      );

    case 'remove_card':
      return <RemoveCardScreen productName="VxDesign" />;

    case 'logged_out': {
      switch (authStatus.reason) {
        case 'no_card_reader':
          return <SetupCardReaderPage />;
        case 'machine_locked':
        case 'machine_locked_by_session_expiry':
          return <MachineLockedScreen />;
        default:
          return (
            <InvalidCardScreen
              reasonAndContext={authStatus}
              recommendedAction="Use a system administrator card."
            />
          );
      }
    }

    /* istanbul ignore next - compile-time completeness check */
    default:
      return throwIllegalValue(authStatus);
  }
}
