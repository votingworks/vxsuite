import React, { useContext, useState, useCallback } from 'react';

import {
  Button,
  StyledButtonProps,
  Modal,
  useCancelablePromise,
  useMountedState,
} from '@votingworks/ui';
import { assert } from '@votingworks/utils';
import { Loading } from './loading';
import { AppContext } from '../contexts/app_context';

function noop(): void {
  // do nothing
}

interface NewPrintButtonProps extends StyledButtonProps {
  print: () => Promise<void>;
  title?: string;
  showSimplePrintingModal?: boolean;
  afterPrint?: () => void;
  afterPrintError?: (errorMessage: string) => void;
}

export function NewPrintButton({
  print,
  title,
  showSimplePrintingModal = true,
  afterPrint,
  afterPrintError,
  children,
  ...rest
}: React.PropsWithChildren<NewPrintButtonProps>): JSX.Element {
  const isMounted = useMountedState();
  const makeCancelable = useCancelablePromise();
  const { hasPrinterAttached } = useContext(AppContext);
  const [isPrinting, setIsPrinting] = useState(false);

  const needsPrinter = window.kiosk && !hasPrinterAttached;

  const handlePrint = useCallback(async () => {
    setIsPrinting(true);
    setTimeout(() => {
      if (!isMounted()) return;
      setIsPrinting(false);
    }, 3000);
    const documentTitle = document.title;
    if (title) {
      document.title = title;
    }
    try {
      await makeCancelable(print());
    } catch (error) {
      assert(error instanceof Error);
      afterPrintError?.(error.message);
    } finally {
      if (title) {
        document.title = documentTitle;
      }
    }

    afterPrint?.();
  }, [afterPrint, afterPrintError, isMounted, makeCancelable, print, title]);

  return (
    <React.Fragment>
      {needsPrinter ? (
        <Button onPress={noop} disabled>
          No Printer Connected
        </Button>
      ) : (
        <Button onPress={handlePrint} {...rest}>
          {children}
        </Button>
      )}
      {isPrinting && showSimplePrintingModal && (
        <Modal centerContent content={<Loading>Printing</Loading>} />
      )}
    </React.Fragment>
  );
}
