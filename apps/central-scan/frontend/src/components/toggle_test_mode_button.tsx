import { Button, Modal, P, SegmentedButton } from '@votingworks/ui';
import React, { useState } from 'react';
import { iter } from '@votingworks/basics';
import { getStatus, getTestMode, setTestMode } from '../api';

/**
 * Presents a button to toggle between test & live modes with a confirmation.
 */
export function ToggleTestModeButton(): JSX.Element | null {
  const statusQuery = getStatus.useQuery();

  const testModeQuery = getTestMode.useQuery();
  const isTestMode = testModeQuery.data ?? false;

  const setTestModeMutation = setTestMode.useMutation();

  const [flowState, setFlowState] = useState<'none' | 'confirmation'>('none');
  function resetFlowState() {
    setFlowState('none');
  }

  function toggleTestMode() {
    setTestModeMutation.mutate(
      { testMode: !isTestMode },
      {
        onSuccess: () => {
          setFlowState('none');
        },
      }
    );
  }

  // because these are polled at the top level of the app, they will
  // always be success and this is here for type checking purposes
  if (!statusQuery.isSuccess || !testModeQuery.isSuccess) {
    return null;
  }

  const status = statusQuery.data;
  const { batches, canUnconfigure } = status;

  const ballotCount = iter(batches)
    .map((b) => b.count)
    .sum();

  return (
    <React.Fragment>
      <SegmentedButton
        disabled={setTestModeMutation.isLoading || !canUnconfigure}
        label="Ballot Mode"
        hideLabel
        onChange={() => {
          if (!isTestMode && ballotCount > 0) {
            setFlowState('confirmation');
          } else {
            toggleTestMode();
          }
        }}
        options={[
          { id: 'test', label: 'Test Ballot Mode' },
          { id: 'official', label: 'Official Ballot Mode' },
        ]}
        selectedOptionId={isTestMode ? 'test' : 'official'}
      />
      {flowState === 'confirmation' && (
        <Modal
          title="Switch to Test Mode"
          content={
            <P>Switching to test mode will clear all scanned ballot data.</P>
          }
          actions={
            <React.Fragment>
              <Button
                data-testid="confirm-toggle"
                variant="primary"
                onPress={toggleTestMode}
                disabled={setTestModeMutation.isLoading}
              >
                Switch to Test Mode
              </Button>
              <Button
                onPress={resetFlowState}
                disabled={setTestModeMutation.isLoading}
              >
                Cancel
              </Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}
