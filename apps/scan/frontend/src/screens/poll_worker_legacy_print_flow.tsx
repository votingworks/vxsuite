import {
  Button,
  CenteredLargeProse,
  H1,
  LoadingAnimation,
  P,
} from '@votingworks/ui';
import pluralize from 'pluralize';
import { PollsTransitionType } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import { getPollsReportTitle } from '@votingworks/utils';
import { PollWorkerFlowScreen } from '../components/layout';
import { printFullReport } from '../api';

function getHeaderText(pollsTransitionType: PollsTransitionType): string {
  switch (pollsTransitionType) {
    case 'close_polls':
      return 'Polls are closed.';
    case 'open_polls':
      return 'Polls are open.';
    case 'resume_voting':
      return 'Voting resumed.';
    case 'pause_voting':
      return 'Voting paused.';
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(pollsTransitionType);
  }
}

export function PollWorkerLegacyPrintFlow({
  pollsTransitionType,
  isReprint,
}: {
  pollsTransitionType: PollsTransitionType;
  isReprint: boolean;
}): JSX.Element {
  const printFullReportMutation = printFullReport.useMutation();

  if (!printFullReportMutation.isSuccess) {
    return (
      <PollWorkerFlowScreen>
        <LoadingAnimation />
        <CenteredLargeProse>
          <H1>Printing Report…</H1>
        </CenteredLargeProse>
      </PollWorkerFlowScreen>
    );
  }

  const numPages = printFullReportMutation.data;

  return (
    <PollWorkerFlowScreen>
      <CenteredLargeProse>
        {!isReprint && <H1>{getHeaderText(pollsTransitionType)}</H1>}
        <P>
          Insert{' '}
          {numPages
            ? `${numPages} ${pluralize('sheet', numPages)} of paper`
            : 'paper'}{' '}
          into the printer to print the report.
        </P>
        <P>
          Remove the poll worker card once you have printed all necessary
          reports.
        </P>
        <P>
          <Button onPress={print}>
            Print Additional
            {getPollsReportTitle(pollsTransitionType)}
          </Button>
        </P>
      </CenteredLargeProse>
    </PollWorkerFlowScreen>
  );
}
