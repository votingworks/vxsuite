import { useCallback, useEffect } from 'react';

import {
  H1,
  Main,
  Screen,
  useLock,
  PrintingBallotImage,
  appStrings,
  Font,
  ReadOnLoad,
} from '@votingworks/ui';

export const printingMessageTimeoutSeconds = 5;

export interface PrintPageProps {
  print: () => void;
}

export function PrintPage({ print }: PrintPageProps): JSX.Element {
  const printLock = useLock();

  const printBallot = useCallback(() => {
    /* istanbul ignore if - @preserve */
    if (!printLock.lock()) return;
    print();
  }, [print, printLock]);

  useEffect(() => {
    void printBallot();
  }, [printBallot]);

  return (
    <Screen>
      <Main centerChild padded>
        <Font align="center">
          <PrintingBallotImage />
          <ReadOnLoad>
            <H1>{appStrings.titleBmdPrintScreen()}</H1>
          </ReadOnLoad>
        </Font>
      </Main>
    </Screen>
  );
}
