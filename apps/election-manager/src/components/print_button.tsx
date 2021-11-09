import React, { useContext, useState } from 'react';

import { Button, StyledButtonProps } from './button';
import { Modal } from './modal';
import { Loading } from './loading';
import { Prose } from './prose';
import { PrintOptions } from '../config/types';
import { AppContext } from '../contexts/app_context';

interface ConfirmModal {
  content: React.ReactNode;
  confirmButtonLabel?: string;
}

interface PrintButtonProps extends StyledButtonProps {
  title?: string;
  afterPrint?: () => void;
  copies?: number;
  sides: PrintOptions['sides'];
  confirmModal?: ConfirmModal;
}

export function PrintButton({
  title,
  afterPrint,
  children,
  copies,
  sides,
  confirmModal,
  ...rest
}: React.PropsWithChildren<PrintButtonProps>): JSX.Element {
  const { printer } = useContext(AppContext);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showPrintingError, setShowPrintingError] = useState(false);

  async function print() {
    if (window.kiosk) {
      const printers = await window.kiosk.getPrinterInfo();
      if (!printers.some((p) => p.connected)) {
        setShowPrintingError(true);
        return;
      }
    }

    setIsPrinting(true);
    setTimeout(() => {
      setIsPrinting(false);
    }, 3000);
    const documentTitle = document.title;
    if (title) {
      document.title = title;
    }
    await printer.print({ sides, copies });
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
              <Button onPress={cancelPrint}>Cancel</Button>
              <Button onPress={confirmPrint} primary>
                {confirmModal?.confirmButtonLabel ?? 'Print'}
              </Button>
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
          actions={
            <React.Fragment>
              <Button onPress={donePrintingError}>OK</Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}
