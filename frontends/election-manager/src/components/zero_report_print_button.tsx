import React, { useContext, useMemo } from 'react';
import { assert } from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';

import { AppContext } from '../contexts/app_context';
import { computeFullElectionTally } from '../lib/votecounting';
import { ElectionManagerTallyReport } from './election_manager_tally_report';
import { PrintableArea } from './printable_area';
import { PrintButton } from './print_button';

export function ZeroReportPrintButton(): JSX.Element {
  const { currentUserSession, electionDefinition, logger } = useContext(
    AppContext
  );

  // In contexts where this component is rendered, these should always be defined
  assert(currentUserSession);
  assert(electionDefinition);

  const currentUserType = currentUserSession.type;
  const { election } = electionDefinition;

  const emptyFullElectionTally = useMemo(
    () => computeFullElectionTally(election, new Set()),
    [election]
  );

  const zeroReportTitle =
    'Pre-Election Unofficial Full Election Tally Report (Zero Report)';

  function logZeroReportPrintSuccess() {
    void logger.log(LogEventId.TallyReportPrinted, currentUserType, {
      disposition: 'success',
      message: `User printed ${zeroReportTitle}`,
      tallyReportTitle: zeroReportTitle,
    });
  }

  function logZeroReportPrintError(errorMessage: string) {
    void logger.log(LogEventId.TallyReportPrinted, currentUserType, {
      disposition: 'failure',
      errorMessage,
      message: `Error printing ${zeroReportTitle}: ${errorMessage}`,
      result: 'User shown error.',
      tallyReportTitle: zeroReportTitle,
    });
  }

  return (
    <React.Fragment>
      <PrintButton
        afterPrint={logZeroReportPrintSuccess}
        afterPrintError={logZeroReportPrintError}
        sides="one-sided"
      >
        Print {zeroReportTitle}
      </PrintButton>
      <PrintableArea>
        <ElectionManagerTallyReport
          election={election}
          fullElectionExternalTallies={[]}
          fullElectionTally={emptyFullElectionTally}
          isOfficialResults={false}
        />
      </PrintableArea>
    </React.Fragment>
  );
}
