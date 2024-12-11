import React, { useState, useCallback } from 'react';

import { Button, StyledButtonProps, Modal, P } from '@votingworks/ui';
import { sleep } from '@votingworks/basics';
import { Loading } from './loading';
import { getPrinterStatus } from '../api';

const DEFAULT_PROGRESS_MODAL_DELAY_SECONDS = 3;

interface PrinterNotConnectedModalProps {
  isNotConnected: boolean;
  onContinue: () => void;
  onClose: () => void;
}

function PrinterNotConnectedModal({
  isNotConnected,
  onContinue,
  onClose,
}: PrinterNotConnectedModalProps): JSX.Element {
  return (
    <Modal
      title={
        isNotConnected
          ? 'The printer is not connected.'
          : 'The printer is now connected.'
      }
      content={
        isNotConnected ? (
          <P>Please connect the printer.</P>
        ) : (
          <P>You may continue printing.</P>
        )
      }
      actions={
        <React.Fragment>
          <Button
            variant="primary"
            onPress={onContinue}
            disabled={isNotConnected}
          >
            Continue
          </Button>
          <Button onPress={onClose}>Close</Button>
        </React.Fragment>
      }
    />
  );
}

interface PrintButtonProps extends StyledButtonProps {
  print: () => Promise<void>;
  useDefaultProgressModal?: boolean;
}

export function PrintButton({
  print,
  useDefaultProgressModal = true,
  children,
  ...rest
}: React.PropsWithChildren<PrintButtonProps>): JSX.Element {
  const printerStatusQuery = getPrinterStatus.useQuery();

  const [isShowingConnectPrinterModal, setIsShowingConnectPrinterModal] =
    useState(false);
  const [isShowingDefaultProgressModal, setIsShowingDefaultProgressModal] =
    useState(false);

  const needsPrinter =
    printerStatusQuery.isSuccess && !printerStatusQuery.data.connected;

  const handlePrint = useCallback(async () => {
    setIsShowingConnectPrinterModal(false);
    if (useDefaultProgressModal) {
      setIsShowingDefaultProgressModal(true);
    }
    await print();

    /* The default progress modal is for cases where we're printing a single
     * document. We don't need to wait until the print is finished to free up
     * the UI. Instead, we wait a set amount of time so the user has feedback
     * that the print has started, and then close the modal.
     */
    if (useDefaultProgressModal) {
      await sleep(DEFAULT_PROGRESS_MODAL_DELAY_SECONDS * 1000);
      setIsShowingDefaultProgressModal(false);
    }
  }, [print, useDefaultProgressModal]);

  return (
    <React.Fragment>
      <Button
        disabled={!printerStatusQuery.isSuccess}
        onPress={
          needsPrinter
            ? () => setIsShowingConnectPrinterModal(true)
            : handlePrint
        }
        {...rest}
      >
        {children}
      </Button>
      {isShowingConnectPrinterModal && (
        <PrinterNotConnectedModal
          isNotConnected={needsPrinter}
          onContinue={handlePrint}
          onClose={() => setIsShowingConnectPrinterModal(false)}
        />
      )}
      {isShowingDefaultProgressModal && (
        <Modal centerContent content={<Loading>Printing</Loading>} />
      )}
    </React.Fragment>
  );
}
