import { useState } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import type { Voter } from '@votingworks/pollbook-backend';
import {
  Button,
  FullScreenIconWrapper,
  FullScreenMessage,
  H1,
  Icons,
  MainContent,
} from '@votingworks/ui';
import { VoterSearchScreen } from './voter_search_screen';
import { VoterConfirmScreen } from './voter_confirm_screen';
import { NoNavScreen } from './nav_screen';
import { Column } from './layout';
import { checkInVoter, getPrinterStatus } from './api';

type CheckInFlowState =
  | { step: 'search' }
  | { step: 'confirm'; voter: Voter }
  | { step: 'printing'; voter: Voter }
  | { step: 'success'; voter: Voter };

export function PollWorkerScreen(): JSX.Element | null {
  const [flowState, setFlowState] = useState<CheckInFlowState>({
    step: 'search',
  });
  const getPrinterStatusQuery = getPrinterStatus.useQuery({
    refetchInterval: 1000,
  });
  const checkInVoterMutation = checkInVoter.useMutation();

  if (!getPrinterStatusQuery.isSuccess) {
    return null;
  }

  if (!getPrinterStatusQuery.data.connected) {
    return (
      <NoNavScreen>
        <Column style={{ justifyContent: 'center', flex: 1 }}>
          <FullScreenMessage
            image={
              <FullScreenIconWrapper>
                <Icons.Danger />
              </FullScreenIconWrapper>
            }
            title="No Printer Detected"
          >
            <p>Connect printer to continue.</p>
          </FullScreenMessage>
        </Column>
      </NoNavScreen>
    );
  }

  switch (flowState.step) {
    case 'search':
      return (
        <VoterSearchScreen
          onSelect={(voter) => setFlowState({ step: 'confirm', voter })}
        />
      );

    case 'confirm':
      return (
        <VoterConfirmScreen
          voter={flowState.voter}
          onCancel={() => setFlowState({ step: 'search' })}
          onConfirm={(identificationMethod) => {
            checkInVoterMutation.mutate(
              { voterId: flowState.voter.voterId, identificationMethod },
              {
                onSuccess: () =>
                  // TODO check mutation result and show error message if necessary
                  setFlowState({ step: 'success', voter: flowState.voter }),
              }
            );
            setFlowState({ step: 'printing', voter: flowState.voter });
          }}
        />
      );

    case 'printing':
      return (
        <NoNavScreen>
          <Column style={{ justifyContent: 'center', flex: 1 }}>
            <FullScreenMessage
              title="Printing voter receipt…"
              image={
                <FullScreenIconWrapper>
                  <Icons.Loading />
                </FullScreenIconWrapper>
              }
            />
          </Column>
        </NoNavScreen>
      );

    case 'success':
      return (
        <NoNavScreen>
          <Column style={{ justifyContent: 'center', flex: 1 }}>
            <FullScreenMessage
              title={null}
              image={
                <FullScreenIconWrapper>
                  <Icons.Done color="primary" />
                </FullScreenIconWrapper>
              }
            >
              <H1>
                {flowState.voter.firstName} {flowState.voter.lastName} is
                checked in
              </H1>
              <p>Give the voter their receipt.</p>
              <Button
                onPress={() => setFlowState({ step: 'search' })}
                rightIcon="Next"
                variant="primary"
              >
                Search for Next Voter
              </Button>
            </FullScreenMessage>
          </Column>
        </NoNavScreen>
      );

    default:
      throwIllegalValue(flowState);
  }
}
