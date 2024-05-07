import React from 'react';

import { BallotContext } from '../../src/contexts/ballot_context';
import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../../src/config/globals';

export const MOCK_PRINT_PAGE_TEST_ID = 'MockPrintPage';

export function MockPrintPage(): JSX.Element {
  const { resetBallot, updateTally } = React.useContext(BallotContext);

  // Simulate tally update and ballot reset after printing:
  React.useEffect(() => {
    updateTally();

    window.setTimeout(
      () => resetBallot(true),
      BALLOT_PRINTING_TIMEOUT_SECONDS * 1000
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div data-testid={MOCK_PRINT_PAGE_TEST_ID} />;
}
