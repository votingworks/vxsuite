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
      title={`Switch to ${isTestMode ? 'Official' : 'Test'} Mode`}
      content={
        <P>
          Switching to {isTestMode ? 'official' : 'test'} mode will reset the
          ballots printed count.
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
          >{`Switch to ${isTestMode ? 'Official' : 'Test'} Mode`}</Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}
