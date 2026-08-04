import { Button, Icons, Modal, P, SegmentedButton } from '@votingworks/ui';
import React, { useState } from 'react';
import {
  getTestMode,
  setTestMode,
  getBallotPrintCounts,
  hasTestBallots,
} from '../api.js';

/**
 * Presents a button to toggle between test & official modes with a confirmation.
 */
export function ToggleTestModeButton(): JSX.Element | null {
  const testModeQuery = getTestMode.useQuery();
  const ballotPrintCountsQuery = getBallotPrintCounts.useQuery();
  const hasTestBallotsQuery = hasTestBallots.useQuery();
  const setTestModeMutation = setTestMode.useMutation();

  const [flowState, setFlowState] = useState<'none' | 'confirmation'>('none');

  const disabled =
    testModeQuery.isLoading ||
    ballotPrintCountsQuery.isLoading ||
    hasTestBallotsQuery.isLoading ||
    setTestModeMutation.isLoading;
  const isTestMode = testModeQuery.data ?? false;
  const isTestModeAvailable = hasTestBallotsQuery.data ?? false;

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

  const ballotPrintCounts = ballotPrintCountsQuery.data ?? [];
  const totalPrintCount = ballotPrintCounts.reduce(
    (sum, count) => sum + count.totalCount,
    0
  );

  return (
    <React.Fragment>
      <P>
        <SegmentedButton
          disabled={disabled || !isTestModeAvailable}
          label="Ballot Mode"
          hideLabel
          onChange={() => {
            if (totalPrintCount > 0) {
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
      </P>
      {hasTestBallotsQuery.isSuccess && !isTestModeAvailable && (
        <P>
          <Icons.Info /> Election package does not contain test ballots required
          for test mode.
        </P>
      )}
      {flowState === 'confirmation' && (
        <Modal
          title={
            isTestMode
              ? 'Switch to Official Ballot Mode'
              : 'Switch to Test Ballot Mode'
          }
          content={
            isTestMode ? (
              <P>
                Switching to official ballot mode will reset all test ballot
                print counts to zero.
              </P>
            ) : (
              <P>
                Switching to test ballot mode will reset all official ballot
                print counts to zero.
              </P>
            )
          }
          actions={
            <React.Fragment>
              <Button
                variant="primary"
                onPress={toggleTestMode}
                disabled={disabled}
              >
                {isTestMode
                  ? 'Switch to Official Ballot Mode'
                  : 'Switch to Test Ballot Mode'}
              </Button>
              <Button
                onPress={() => setFlowState('none')}
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
