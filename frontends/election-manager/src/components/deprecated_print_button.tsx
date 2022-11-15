import React, { useContext, useState, useEffect, useCallback } from 'react';

import {
  Button,
  StyledButtonProps,
  Modal,
  useCancelablePromise,
  useMountedState,
} from '@votingworks/ui';
import { Loading } from './loading';
import { PrintOptions } from '../config/types';
import { AppContext } from '../contexts/app_context';
import { PrintableArea } from './printable_area';
import { PrinterNotConnectedModal } from './printer_not_connected_modal';

interface ConfirmModal {
  content: React.ReactNode;
  confirmButtonLabel?: string;
}

interface DeprecatedPrintButtonProps extends StyledButtonProps {
  title?: string;
  afterPrint?: () => void;
  afterPrintError?: (errorMessage: string) => void;
  copies?: number;
  sides: PrintOptions['sides'];
  confirmModal?: ConfirmModal;
  printTarget?: JSX.Element;
  printTargetTestId?: string;
}

export function DeprecatedPrintButton({
  title,
  afterPrint,
  afterPrintError,
  children,
  copies,
  sides,
  confirmModal,
  printTarget,
  printTargetTestId,
  ...rest
}: React.PropsWithChildren<DeprecatedPrintButtonProps>): JSX.Element {
  const isMounted = useMountedState();
  const makeCancelable = useCancelablePromise();
  const { printer } = useContext(AppContext);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showPrintingError, setShowPrintingError] = useState(false);
  const [shouldRenderPrintTarget, setShouldRenderPrintTarget] = useState(false);

  const print = useCallback(async () => {
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

    setShouldRenderPrintTarget(false);
    afterPrint?.();
  }, [
    afterPrint,
    afterPrintError,
    copies,
    isMounted,
    makeCancelable,
    printer,
    sides,
    title,
  ]);

  useEffect(() => {
    if (shouldRenderPrintTarget) {
      void print();
    }
  }, [shouldRenderPrintTarget, print]);

  const startPrint = useCallback(async () => {
    if (printTarget) {
      setShouldRenderPrintTarget(true);
    } else {
      await print();
    }
  }, [print, printTarget]);

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
      <Button onPress={confirmModal ? initConfirmModal : startPrint} {...rest}>
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
        <PrinterNotConnectedModal onClose={donePrintingError} />
      )}
      {printTarget && shouldRenderPrintTarget && (
        <PrintableArea data-testid={printTargetTestId}>
          {printTarget}
        </PrintableArea>
      )}
    </React.Fragment>
  );
}
