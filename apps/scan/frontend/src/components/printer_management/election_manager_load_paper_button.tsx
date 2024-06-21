import React, { useState } from 'react';
import {
  Button,
  Loading,
  Modal,
  P,
  useQueryChangeListener,
} from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { getPrinterStatus, printTestPage } from '../../api';

function ElectionManagerLoadPaperModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element {
  const printerStatusQuery = getPrinterStatus.useQuery();
  const printerStatus = printerStatusQuery.data;
  assert(printerStatus);
  assert(printerStatus.scheme === 'hardware-v4');

  const printTestPageMutation = printTestPage.useMutation();
  const [hasRemovedPaperRollHolder, setHasRemovedPaperRollHolder] = useState(
    printerStatus.state === 'cover-open'
  );

  // advance the user flow when we detect the printer was opened
  useQueryChangeListener(printerStatusQuery, {
    onChange: (newPrinterStatus) => {
      assert(newPrinterStatus.scheme === 'hardware-v4');
      if (newPrinterStatus.state === 'cover-open') {
        setHasRemovedPaperRollHolder(true);
      }
    },
  });

  function restartFlow() {
    setHasRemovedPaperRollHolder(false);
    printTestPageMutation.reset();
  }

  // user is loading the roll and has not yet printed a test page
  if (printTestPageMutation.status === 'idle') {
    // user has not yet removed the paper roll holder
    if (!hasRemovedPaperRollHolder) {
      // we shouldn't need to handle errors in this initial state, because the
      // modal shouldn't be open-able if the printer is in an error state
      return (
        <Modal
          title="Remove Paper Roll Holder"
          content={
            <P>
              Open the access door to reveal the printer. Press the green lever
              on the paper roll holder to separate it from the printer.
            </P>
          }
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    }

    // user has removed the paper roll holder, we guide them through reloading the paper
    switch (printerStatus.state) {
      case 'error':
        return (
          <Modal
            title="Printer Error"
            content={<P>The printer has encountered an unexpected error.</P>}
            actions={<Button onPress={onClose}>Close</Button>}
          />
        );
      case 'cover-open':
        return (
          <Modal
            title="Load New Paper Roll"
            content={
              <P>
                Slide a new roll of paper onto the roll holder. Unroll enough
                paper to pull it over the tear bar and toward you. Holding the
                end of the paper with your thumbs, push the roll holder back
                onto the printer so it clicks into place.
              </P>
            }
            actions={<Button onPress={onClose}>Cancel</Button>}
          />
        );
      case 'no-paper':
        return (
          <Modal
            title="No Paper Detected"
            content={
              <P>
                The paper roll holder was reattached but no paper is detected.
                It may not be loaded correctly. Try to remove the roll holder
                and load the paper again.
              </P>
            }
            actions={<Button onPress={onClose}>Cancel</Button>}
          />
        );

      case 'idle':
        return (
          <Modal
            title="Paper Loaded"
            content={
              <P>
                Paper is now loaded. To ensure the paper is correctly loaded,
                the printer will print a test page.
              </P>
            }
            actions={
              <React.Fragment>
                <Button
                  variant="primary"
                  onPress={() => printTestPageMutation.mutate()}
                >
                  Continue
                </Button>
                <Button onPress={onClose}>Cancel</Button>
              </React.Fragment>
            }
          />
        );
      /* istanbul ignore next */
      default:
        throwIllegalValue(printerStatus, 'state');
    }
  }

  if (printTestPageMutation.status === 'loading') {
    return <Modal content={<Loading>Printing</Loading>} />;
  }

  assert(printTestPageMutation.status === 'success');
  const printResult = printTestPageMutation.data;

  if (printResult.isErr()) {
    const errorStatus = printResult.err();

    if (errorStatus.state === 'no-paper') {
      return (
        <Modal
          title="Print Failed"
          content={
            <P>
              The print stopped because paper is no longer detected in the
              printer. The paper may be misaligned. Try reloading the paper
              roll.
            </P>
          }
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={restartFlow}>
                Retry
              </Button>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    }

    return (
      <Modal
        title="Printer Error"
        content={
          <P>The printer has encountered an unexpected error while printing.</P>
        }
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  return (
    <Modal
      title="Test Page Printed"
      content={
        <P>
          Remove and inspect the test page to confirm it printed legibly. If it
          did not, press retry to reload the paper.
        </P>
      }
      actions={
        <React.Fragment>
          <Button variant="primary" onPress={onClose}>
            Close
          </Button>
          <Button onPress={restartFlow}>Retry</Button>
        </React.Fragment>
      }
    />
  );
}

export interface ElectionManagerLoadPaperButtonProps {
  isPrimary: boolean;
}

export function ElectionManagerLoadPaperButton({
  isPrimary,
}: ElectionManagerLoadPaperButtonProps): JSX.Element {
  const printerStatusQuery = getPrinterStatus.useQuery();
  const [isLoadPaperModalOpen, setIsLoadPaperModalOpen] = useState(false);

  const enabled =
    printerStatusQuery.isSuccess &&
    printerStatusQuery.data.scheme === 'hardware-v4' &&
    printerStatusQuery.data.state !== 'error';

  return (
    <React.Fragment>
      <Button
        variant={isPrimary ? 'primary' : undefined}
        onPress={() => setIsLoadPaperModalOpen(true)}
        disabled={!enabled}
      >
        Load Paper
      </Button>
      {isLoadPaperModalOpen && (
        <ElectionManagerLoadPaperModal
          onClose={() => setIsLoadPaperModalOpen(false)}
        />
      )}
    </React.Fragment>
  );
}
