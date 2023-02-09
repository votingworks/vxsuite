import { Modal } from '@votingworks/ui';
import React, { useCallback, useRef, useState } from 'react';
import { Button } from './button';
import { Prose } from './prose';

export interface Props {
  canUnconfigure: boolean;
  isTestMode: boolean;
  isTogglingTestMode: boolean;
  toggleTestMode(): void;
}

/**
 * Presents a button to toggle between test & live modes with a confirmation.
 */
export function ToggleTestModeButton({
  canUnconfigure,
  isTestMode,
  isTogglingTestMode,
  toggleTestMode,
}: Props): JSX.Element {
  const [isConfirming, setIsConfirming] = useState(isTogglingTestMode);
  const defaultButtonRef = useRef<HTMLButtonElement>(null);

  const toggleIsConfirming = useCallback(() => {
    /* istanbul ignore else - just catches the case of clicking the overlay when toggling */
    if (!isTogglingTestMode) {
      setIsConfirming((prev) => !prev);
    }
  }, [isTogglingTestMode, setIsConfirming]);

  const focusDefaultButton = useCallback(() => {
    defaultButtonRef.current?.focus();
  }, []);

  return (
    <React.Fragment>
      <Button
        onPress={toggleIsConfirming}
        disabled={
          (!canUnconfigure && !isTestMode) || isTogglingTestMode || isConfirming
        }
      >
        {isTogglingTestMode
          ? 'Toggling…'
          : isTestMode
          ? 'Toggle to Live Mode'
          : 'Toggle to Test Mode'}
      </Button>
      {isConfirming && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>
                {isTogglingTestMode
                  ? isTestMode
                    ? 'Toggling to Live Mode'
                    : 'Toggling to Test Mode'
                  : isTestMode
                  ? 'Toggle to Live Mode'
                  : 'Toggle to Test Mode'}
              </h1>
              <p>
                {isTogglingTestMode
                  ? 'Zeroing out scanned ballots and reloading…'
                  : 'Toggling test mode will zero out your scanned ballots. Are you sure?'}
              </p>
            </Prose>
          }
          actions={
            !isTogglingTestMode && (
              <React.Fragment>
                <Button
                  data-testid="confirm-toggle"
                  ref={defaultButtonRef}
                  primary
                  onPress={toggleTestMode}
                >
                  {isTestMode ? 'Toggle to Live Mode' : 'Toggle to Test Mode'}
                </Button>
                <Button onPress={toggleIsConfirming}>Cancel</Button>
              </React.Fragment>
            )
          }
          onOverlayClick={toggleIsConfirming}
          onAfterOpen={focusDefaultButton}
        />
      )}
    </React.Fragment>
  );
}
