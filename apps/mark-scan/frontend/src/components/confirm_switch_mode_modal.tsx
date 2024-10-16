import { Button, Modal, P } from '@votingworks/ui';
import React from 'react';
import { setTestMode } from '../api';

export interface ConfirmSwitchModeModalProps {
  isTestMode: boolean;
  onClose: VoidFunction;
}

export function ConfirmSwitchModeModal({
  isTestMode,
  onClose,
}: ConfirmSwitchModeModalProps): JSX.Element {
  const setTestModeMutation = setTestMode.useMutation();

  return (
    <Modal
      title={`Switch to ${isTestMode ? 'Official' : 'Test'} Ballot Mode`}
      content={
        <P>
          Switching to {isTestMode ? 'official' : 'test'} ballot mode will reset
          the polls to closed and the ballots printed count to zero.
        </P>
      }
      actions={
        <React.Fragment>
          <Button
            onPress={() => {
              setTestModeMutation.mutate(
                { isTestMode: !isTestMode },
                {
                  onSuccess: onClose,
                }
              );
            }}
            disabled={setTestModeMutation.isLoading}
            variant={isTestMode ? 'primary' : 'danger'}
            icon={isTestMode ? undefined : 'Danger'}
          >{`Switch to ${
            isTestMode ? 'Official' : 'Test'
          } Ballot Mode`}</Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}
