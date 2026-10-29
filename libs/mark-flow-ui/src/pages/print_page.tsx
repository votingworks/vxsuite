import { useEffect } from 'react';

import {
  H1,
  Main,
  Screen,
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
  useEffect(() => {
    print();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
