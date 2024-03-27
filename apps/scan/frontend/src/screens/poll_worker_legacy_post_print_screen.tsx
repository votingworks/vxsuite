import {
  Button,
  CenteredLargeProse,
  H1,
  LoadingAnimation,
  P,
} from '@votingworks/ui';
import pluralize from 'pluralize';
import { PollsTransitionType } from '@votingworks/types';
import { getPollsReportTitle } from '@votingworks/utils';
import { useState } from 'react';
import { assert } from '@votingworks/basics';
import { Screen, getPostPollsTransitionHeaderText } from './poll_worker_shared';
import { getPrinterStatus, printReport } from '../api';

export function LegacyPostPrintScreen({
  isPostPollsTransition,
  numPages,
  transitionType,
}: {
  isPostPollsTransition: boolean;
  numPages: number;
  transitionType: PollsTransitionType;
}): JSX.Element {
  const [isPrinting, setIsPrinting] = useState(false);
  const printReportMutation = printReport.useMutation();
  const printerStatusQuery = getPrinterStatus.useQuery();

  function reprint() {
    setIsPrinting(true);
    printReportMutation.mutate(undefined, {
      onSuccess: () => setIsPrinting(false),
    });
  }

  // this status should not be possible in production, where the parent
  // component has already run the query, but it's possible in testing
  if (!printerStatusQuery.isSuccess) {
    return (
      <Screen>
        <LoadingAnimation />
        <CenteredLargeProse>
          <H1>Loading…</H1>
        </CenteredLargeProse>
      </Screen>
    );
  }

  const printerStatus = printerStatusQuery.data;
  assert(printerStatus.scheme === 'hardware-v3');

  if (isPrinting) {
    return (
      <Screen>
        <LoadingAnimation />
        <CenteredLargeProse>
          <H1>Printing Report…</H1>
        </CenteredLargeProse>
      </Screen>
    );
  }

  return (
    <Screen>
      <CenteredLargeProse>
        {isPostPollsTransition && (
          <H1>{getPostPollsTransitionHeaderText(transitionType)}</H1>
        )}
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
          <Button onPress={reprint} disabled={!printerStatus.connected}>
            Print Additional {getPollsReportTitle(transitionType)}
          </Button>
        </P>
      </CenteredLargeProse>
    </Screen>
  );
}
