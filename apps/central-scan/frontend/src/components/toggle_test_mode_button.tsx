import { Button, Modal, P } from '@votingworks/ui';
import React, { useCallback, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { setTestMode } from '../api';

export interface Props {
  canUnconfigure: boolean;
  isTestMode: boolean;
}

/**
 * Presents a button to toggle between test & live modes with a confirmation.
 */
export function ToggleTestModeButton({
  canUnconfigure,
  isTestMode,
}: Props): JSX.Element {
  const history = useHistory();
  const setTestModeMutation = setTestMode.useMutation();

  const [flowState, setFlowState] = useState<
    'none' | 'confirmation' | 'toggling'
  >('none');
  function resetFlowState() {
    setFlowState('none');
  }

  function toggleTestMode() {
    setFlowState('toggling');
    setTestModeMutation.mutate(
      { testMode: !isTestMode },
      {
        onSuccess: () => {
          history.replace('/');
        },
      }
    );
  }

  const defaultButtonRef = useRef<Button>(null);
  const focusDefaultButton = useCallback(() => {
    defaultButtonRef.current?.focus();
  }, []);

  return (
    <React.Fragment>
      <Button
        onPress={() => setFlowState('confirmation')}
        disabled={!canUnconfigure}
      >
        {isTestMode
          ? 'Toggle to Official Ballot Mode'
          : 'Toggle to Test Ballot Mode'}
      </Button>
      {flowState === 'confirmation' && (
        <Modal
          title={
            isTestMode
              ? 'Toggle to Official Ballot Mode'
              : 'Toggle to Test Ballot Mode'
          }
          content={
            <P>
              {`Toggling to ${
                isTestMode ? 'Official' : 'Test'
              } Ballot Mode will zero out your scanned ballots. Are you sure?`}
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                data-testid="confirm-toggle"
                ref={defaultButtonRef}
                variant="primary"
                onPress={toggleTestMode}
              >
                {isTestMode
                  ? 'Toggle to Official Ballot Mode'
                  : 'Toggle to Test Ballot Mode'}
              </Button>
              <Button onPress={resetFlowState}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={resetFlowState}
          onAfterOpen={focusDefaultButton}
        />
      )}
      {flowState === 'toggling' && (
        <Modal
          title={
            isTestMode
              ? 'Toggling to Official Ballot Mode'
              : 'Toggling to Test Ballot Mode'
          }
          content={<P>Zeroing out scanned ballots and reloading…</P>}
        />
      )}
    </React.Fragment>
  );
}
