import React from 'react';
import { Buffer } from 'buffer';

import * as api from '../../src/api';

export const MOCK_PRINT_PAGE_TEST_ID = 'MockPrintPage';
export const MOCK_BALLOT_PDF_DATA = Buffer.from(new Uint8Array([2, 1, 1]));

export function MockPrintPage(): JSX.Element {
  const printBallot = api.printBallot.useMutation().mutate;

  // Simulate printing PDF data via the backend API:
  React.useEffect(() => {
    window.setTimeout(() => printBallot({ pdfData: MOCK_BALLOT_PDF_DATA }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div data-testid={MOCK_PRINT_PAGE_TEST_ID} />;
}
