import React, { useContext, useState } from 'react';

import {
  Modal,
  useCancelablePromise,
  useMountedState,
  Prose,
} from '@votingworks/ui';
import { Button, StyledButtonProps } from './button';
import { Loading } from './loading';
import { PrintOptions } from '../config/types';
import { AppContext } from '../contexts/app_context';

interface ConfirmModal {
  content: React.ReactNode;
  confirmButtonLabel?: string;
}

interface PrintButtonProps extends StyledButtonProps {
  title?: string;
  afterPrint?: () => void;
  afterPrintError?: (errorMessage: string) => void;
  copies?: number;
  sides: PrintOptions['sides'];
  confirmModal?: ConfirmModal;
}

export function PrintButton({
  title,
  afterPrint,
  afterPrintError,
  children,
  copies,
  sides,
  confirmModal,
  ...rest
}: React.PropsWithChildren<PrintButtonProps>): JSX.Element {
  const isMounted = useMountedState();
  const makeCancelable = useCancelablePromise();
  const { printer } = useContext(AppContext);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showPrintingError, setShowPrintingError] = useState(false);

  async function print() {
    if (window.kiosk) {
      const printers = await makeCancelable(window.kiosk.getPrinterInfo());
      if (!printers.some((p) => p.connected)) {
        setShowPrintingError(true);
        afterPrintError?.('No printer connected.');
        return;
      }
    }

    setIsPrinting(true);
    setTimeout(() => {
      if (!isMounted()) return;
      setIsPrinting(false);
    }, 3000);
    const documentTitle = document.title;
    if (title) {
      document.title = title;
    }
    await makeCancelable(printer.print({ sides, copies }));
    if (title) {
      document.title = documentTitle;
    }

    afterPrint?.();
  }

  function donePrintingError() {
    setShowPrintingError(false);
  }

  function initConfirmModal() {
    setIsConfirming(true);
  }

  function cancelPrint() {
    setIsConfirming(false);
  }

  async function confirmPrint() {
    setIsConfirming(false);
    await print();
  }

  return (
    <React.Fragment>
      <Button onPress={confirmModal ? initConfirmModal : print} {...rest}>
        {children}
      </Button>
      {isPrinting && (
        <Modal centerContent content={<Loading>Printing</Loading>} />
      )}
      {isConfirming && (
        <Modal
          centerContent
          content={confirmModal?.content}
          actions={
            <React.Fragment>
              <Button primary onPress={confirmPrint}>
                {confirmModal?.confirmButtonLabel ?? 'Print'}
              </Button>
              <Button onPress={cancelPrint}>Cancel</Button>
            </React.Fragment>
          }
        />
      )}
      {showPrintingError && (
        <Modal
          content={
            <Prose>
              <h2>The printer is not connected.</h2>
              <p>Please connect the printer and try again.</p>
            </Prose>
          }
          actions={<Button onPress={donePrintingError}>Okay</Button>}
        />
      )}
    </React.Fragment>
  );
}
