import React, { useCallback, useContext, useMemo } from 'react';
import styled from 'styled-components';
import { assert } from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';

import { Text } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';
import { computeFullElectionTally } from '../lib/votecounting';
import { ElectionManagerTallyReport } from './election_manager_tally_report';
import { PrintableArea } from './printable_area';
import { PrintButton } from './print_button';

const ButtonAnnotation = styled(Text)`
  &&& {
    margin-top: 0.5rem;
    margin-bottom: 1rem;
  }
`;

export function ZeroReportPrintButton(): JSX.Element {
  const { currentUserSession, electionDefinition, logger } =
    useContext(AppContext);

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

  const logZeroReportPrintSuccess = useCallback(() => {
    void logger.log(LogEventId.TallyReportPrinted, currentUserType, {
      disposition: 'success',
      message: `User printed ${zeroReportTitle}`,
      tallyReportTitle: zeroReportTitle,
    });
  }, [currentUserType, logger]);

  const logZeroReportPrintError = useCallback(
    (errorMessage: string) => {
      void logger.log(LogEventId.TallyReportPrinted, currentUserType, {
        disposition: 'failure',
        errorMessage,
        message: `Error printing ${zeroReportTitle}: ${errorMessage}`,
        result: 'User shown error.',
        tallyReportTitle: zeroReportTitle,
      });
    },
    [currentUserType, logger]
  );

  return (
    <React.Fragment>
      <PrintButton
        afterPrint={logZeroReportPrintSuccess}
        afterPrintError={logZeroReportPrintError}
        sides="one-sided"
      >
        {/* Intentionally diverging from our typical title case button text to sentence case for clarity */}
        Print the pre-election Unofficial Full Election Tally Report
      </PrintButton>
      <ButtonAnnotation small>
        This report is referred to as the “Zero Report”.
      </ButtonAnnotation>
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
