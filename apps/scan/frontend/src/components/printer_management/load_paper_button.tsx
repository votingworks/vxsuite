import React, { useState } from 'react';
import {
  Button,
  Loading,
  Modal,
  P,
  useQueryChangeListener,
} from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  getPrinterStatus,
  printTestPage,
  setHasPaperBeenLoaded,
} from '../../api';

function LoadPaperModal({ onClose }: { onClose: () => void }): JSX.Element {
  const printerStatusQuery = getPrinterStatus.useQuery();
  const printerStatus = printerStatusQuery.data;
  assert(printerStatus);
  assert(printerStatus.scheme === 'hardware-v4');

  const setHasPaperBeenLoadedMutation = setHasPaperBeenLoaded.useMutation();
  const printTestPageMutation = printTestPage.useMutation();
  const [hasRemovedPlaten, setHasRemovedPlaten] = useState(
    printerStatus.state === 'cover-open'
  );

  function onExitEarly() {
    onClose();
  }

  function onFinish() {
    setHasPaperBeenLoadedMutation.mutate({ hasPaperBeenLoaded: true });
    onClose();
  }

  useQueryChangeListener(printerStatusQuery, {
    onChange: (newPrinterStatus) => {
      assert(newPrinterStatus.scheme === 'hardware-v4');
      if (newPrinterStatus.state === 'cover-open') {
        setHasRemovedPlaten(true);
      }
    },
  });

  // it's possible but unlikely that a hardware error arises during this flow
  if (printerStatus.state === 'error') {
    return (
      <Modal
        title="Printer Error"
        content={
          <P>
            The printer has experienced an error. Please see the diagnostics
            page.
          </P>
        }
        actions={<Button onPress={onExitEarly}>Close</Button>}
      />
    );
  }

  // user has not yet opened the printer to insert a new roll
  if (!hasRemovedPlaten) {
    return (
      <Modal
        title="Open Printer"
        content={<P>Press the lever on the printer cover to remove it.</P>}
        actions={<Button onPress={onExitEarly}>Cancel</Button>}
      />
    );
  }

  // user is loading the roll, but has not advanced the paper yet
  if (printTestPageMutation.status === 'idle') {
    switch (printerStatus.state) {
      case 'cover-open':
        return (
          <Modal
            title="Load Paper"
            content={
              <P>
                Slide a new roll of paper into the printer cover. Reattach the
                printer cover with the paper pulled through the printer.
              </P>
            }
            actions={<Button onPress={onExitEarly}>Cancel</Button>}
          />
        );
      case 'no-paper':
        return (
          <Modal
            title="No Paper Detected"
            content={
              <P>
                There is no paper detected by the printer. Did you load it
                correctly? Try reopening the printer and reloading the paper.
              </P>
            }
            actions={<Button onPress={onExitEarly}>Cancel</Button>}
          />
        );

      case 'idle':
        return (
          <Modal
            title="Paper Loaded"
            content={
              <React.Fragment>
                <P>
                  To ensure the paper is correctly loaded, the printer will now
                  print a test page.
                </P>
                <P />
              </React.Fragment>
            }
            actions={
              <Button
                variant="primary"
                onPress={() => printTestPageMutation.mutate()}
              >
                Continue
              </Button>
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
    return (
      <Modal
        title="Printer Error"
        content={
          <P>
            The printer has experienced an error while printing. Please see the
            diagnostics page.
          </P>
        }
        actions={<Button onPress={onExitEarly}>Close</Button>}
      />
    );
  }

  return (
    <Modal
      title="Test Report Printed"
      content={
        <P>
          Inspect the test report to confirm it printed legibly. If it did not,
          press cancel and try again.
        </P>
      }
      actions={
        <React.Fragment>
          <Button variant="primary" onPress={onFinish}>
            Finish
          </Button>
          <Button onPress={onExitEarly}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}

export function LoadPaperButton({
  text,
  isPrimary,
}: {
  text: string;
  isPrimary: boolean;
}): JSX.Element {
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
        {text}
      </Button>
      {isLoadPaperModalOpen && (
        <LoadPaperModal onClose={() => setIsLoadPaperModalOpen(false)} />
      )}
    </React.Fragment>
  );
}
