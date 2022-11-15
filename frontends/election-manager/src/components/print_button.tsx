import React, { useContext, useState, useCallback } from 'react';

import {
  Button,
  StyledButtonProps,
  Modal,
  useCancelablePromise,
  Prose,
} from '@votingworks/ui';
import { sleep } from '@votingworks/utils';
import { Loading } from './loading';
import { AppContext } from '../contexts/app_context';

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
      content={
        isNotConnected ? (
          <Prose>
            <h2>The printer is not connected.</h2>
            <p>Please connect the printer.</p>
          </Prose>
        ) : (
          <Prose>
            <h2>The printer is now connected.</h2>
            <p>You may continue printing.</p>
          </Prose>
        )
      }
      actions={
        <React.Fragment>
          <Button primary onPress={onContinue} disabled={isNotConnected}>
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
  const makeCancelable = useCancelablePromise();
  const { hasPrinterAttached } = useContext(AppContext);
  const [isShowingConnectPrinterModal, setIsShowingConnectPrinterModal] =
    useState(false);
  const [isShowingDefaultProgressModal, setIsShowingDefaultProgressModal] =
    useState(false);

  const needsPrinter = Boolean(window.kiosk) && !hasPrinterAttached;

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
      await makeCancelable(sleep(DEFAULT_PROGRESS_MODAL_DELAY_SECONDS * 1000));
      setIsShowingDefaultProgressModal(false);
    }
  }, [makeCancelable, print, useDefaultProgressModal]);

  return (
    <React.Fragment>
      <Button
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
