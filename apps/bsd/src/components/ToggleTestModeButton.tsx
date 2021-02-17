import React, { useCallback, useRef, useState } from 'react'
import Button from './Button'
import Modal from './Modal'
import Prose from './Prose'

export interface Props {
  isTestMode: boolean
  isTogglingTestMode: boolean
  toggleTestMode(): void
}

/**
 * Presents a button to toggle between test & live modes with a confirmation.
 */
const ToggleTestModeButton: React.FC<Props> = ({
  isTestMode,
  isTogglingTestMode,
  toggleTestMode,
}) => {
  const [isConfirming, setIsConfirming] = useState(isTogglingTestMode)
  const defaultButtonRef = useRef<HTMLButtonElement>(null)

  const toggleIsConfirming = useCallback(() => {
    /* istanbul ignore else - just catches the case of clicking the overlay when toggling */
    if (!isTogglingTestMode) {
      setIsConfirming((prev) => !prev)
    }
  }, [isTogglingTestMode, setIsConfirming])

  const focusDefaultButton = useCallback(() => {
    defaultButtonRef.current?.focus()
  }, [])

  return (
    <React.Fragment>
      <Button
        onPress={toggleIsConfirming}
        disabled={isTogglingTestMode || isConfirming}
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
                <Button onPress={toggleIsConfirming}>Cancel</Button>
                <Button ref={defaultButtonRef} primary onPress={toggleTestMode}>
                  {isTestMode ? 'Toggle to Live Mode' : 'Toggle to Test Mode'}
                </Button>
              </React.Fragment>
            )
          }
          onOverlayClick={toggleIsConfirming}
          onAfterOpen={focusDefaultButton}
        />
      )}
    </React.Fragment>
  )
}

export default ToggleTestModeButton
