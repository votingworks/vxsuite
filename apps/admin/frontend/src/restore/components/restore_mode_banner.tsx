import React, { useState } from 'react';
import styled from 'styled-components';
import { Button, H2, Modal, Screen, useSystemCallApi } from '@votingworks/ui';

const ScreenWrapper = styled(Screen)`
  > :last-child {
    flex: 1;
    min-height: 0;
  }
`;

const Banner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  padding: 0.5rem 1rem;
  background: ${(p) => p.theme.colors.warning};
  color: ${(p) => p.theme.colors.onWarning};

  h2 {
    margin: 0;
    color: inherit;
  }
`;

function ExitRestoreModeButton(): JSX.Element {
  const [isConfirming, setIsConfirming] = useState(false);
  const rebootMutation = useSystemCallApi().reboot.useMutation();
  const isRestarting = rebootMutation.isLoading || rebootMutation.isSuccess;

  function closeModal() {
    setIsConfirming(false);
  }

  return (
    <React.Fragment>
      <Button
        icon="Cancel"
        variant="inverseNeutral"
        onPress={() => setIsConfirming(true)}
        style={{ padding: '0.25rem 0.75rem' }}
      >
        Exit Restore Mode
      </Button>
      {isConfirming && (
        <Modal
          title="Exit Restore Mode"
          content="VxAdmin will restart normally."
          actions={
            <React.Fragment>
              <Button
                variant="primary"
                onPress={() => rebootMutation.mutate()}
                disabled={isRestarting}
              >
                Restart
              </Button>
              <Button onPress={closeModal} disabled={isRestarting}>
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={closeModal}
        />
      )}
    </React.Fragment>
  );
}

function RestoreModeBanner(): JSX.Element {
  return (
    <Banner>
      <H2>Restore Mode</H2>
      <ExitRestoreModeButton />
    </Banner>
  );
}

export function ScreenWithBanner({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <ScreenWrapper>
      <RestoreModeBanner />
      {children}
    </ScreenWrapper>
  );
}
