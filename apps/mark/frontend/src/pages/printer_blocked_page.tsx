import {
  IPP_PRINTER_STATE_REASON_MESSAGES,
  Icons,
  P,
  appStrings,
} from '@votingworks/ui';
import {
  CenteredCardPageLayout,
  PollWorkerPrompt,
} from '@votingworks/mark-flow-ui';
import type { IppPrinterStateReason } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';

export interface PrinterBlockedPageProps {
  blockingStateReason: IppPrinterStateReason;
  isCardlessVoterAuth?: boolean;
}

export function PrinterBlockedPage({
  blockingStateReason,
  isCardlessVoterAuth,
}: PrinterBlockedPageProps): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Danger color="danger" />}
      title={appStrings.titlePrinterNeedsAttention()}
      voterFacing={Boolean(isCardlessVoterAuth)}
    >
      <P>{appStrings.instructionsAskForHelp()}</P>
      <PollWorkerPrompt>
        {assertDefined(IPP_PRINTER_STATE_REASON_MESSAGES[blockingStateReason])}
      </PollWorkerPrompt>
    </CenteredCardPageLayout>
  );
}
