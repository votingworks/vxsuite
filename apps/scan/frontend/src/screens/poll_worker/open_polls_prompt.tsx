import { Button, CenteredLargeProse, P } from "@votingworks/ui";
import { PollWorkerFlowScreen } from "../../components/layout";
import { PollsTransitionType } from "@votingworks/types";


export function PollWorkerOpenPollsPrompt({
  pollsTransitionType,
  printerAvailable,
  onConfirm,
}: {
  pollsTransitionType: PollsTransitionType;
  printerAvailable: boolean;
  onConfirm: () => void;
  
}): JSX.Element {
  return (
    <PollWorkerFlowScreen>
      <CenteredLargeProse>
        <P>
          {pollsTransitionType === 'open_polls'
            ? 'Do you want to open the polls?'
            : 'Do you want to resume voting?'}
        </P>
        <P>
          <Button
            variant="primary"
            onPress={transitionPolls}
            value={pollsTransitionType}
            disabled={needsToAttachPrinterToTransitionPolls}
          >
            {pollsTransitionType === 'open_polls'
              ? 'Yes, Open the Polls'
              : 'Yes, Resume Voting'}
          </Button>{' '}
          <Button onPress={showAllPollWorkerActions}>No</Button>
        </P>
        {needsToAttachPrinterToTransitionPolls && (
          <P>Attach printer to continue.</P>
        )}
      </CenteredLargeProse>
    </Screen>
  );
}