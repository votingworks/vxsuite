import { useState } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import type { Voter } from '@votingworks/pollbook-backend';
import {
  Button,
  FullScreenIconWrapper,
  FullScreenMessage,
  H1,
  Icons,
} from '@votingworks/ui';
import { VoterSearchScreen } from './voter_search_screen';
import { VoterConfirmScreen } from './voter_confirm_screen';
import { NoNavScreen } from './nav_screen';
import { Column } from './layout';
import { checkInVoter, getDeviceStatuses, registerVoter } from './api';
import { AddVoterScreen } from './add_voter_screen';

type CheckInFlowState =
  | { step: 'search' }
  | { step: 'confirm'; voter: Voter }
  | { step: 'voter-registration' }
  | { step: 'printing-checkin'; voter: Voter }
  | { step: 'success-checkin'; voter: Voter }
  | { step: 'printing-registration' }
  | { step: 'error-registration'; interval: NodeJS.Timeout }
  | { step: 'success-registration'; voter: Voter };

export function PollWorkerScreen(): JSX.Element | null {
  const [flowState, setFlowState] = useState<CheckInFlowState>({
    step: 'search',
  });
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const checkInVoterMutation = checkInVoter.useMutation();
  const registerVoterMutation = registerVoter.useMutation();

  if (!getDeviceStatusesQuery.isSuccess) {
    return null;
  }

  const { printer } = getDeviceStatusesQuery.data;
  if (!printer.connected) {
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
          onAddNewVoter={() => setFlowState({ step: 'voter-registration' })}
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
                  setFlowState({
                    step: 'success-checkin',
                    voter: flowState.voter,
                  }),
              }
            );
            setFlowState({ step: 'printing-checkin', voter: flowState.voter });
          }}
        />
      );

    case 'printing-checkin':
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

    case 'success-checkin':
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

    case 'printing-registration':
      return (
        <NoNavScreen>
          <Column style={{ justifyContent: 'center', flex: 1 }}>
            <FullScreenMessage
              title="Printing registration receipt…"
              image={
                <FullScreenIconWrapper>
                  <Icons.Loading />
                </FullScreenIconWrapper>
              }
            />
          </Column>
        </NoNavScreen>
      );

    case 'success-registration':
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
                registered
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

    case 'error-registration':
      return (
        <NoNavScreen>
          <Column style={{ justifyContent: 'center', flex: 1 }}>
            <FullScreenMessage
              title={null}
              image={
                <FullScreenIconWrapper>
                  <Icons.Danger />
                </FullScreenIconWrapper>
              }
            >
              <H1>Error registering voter.</H1>
              <p> Please try again.</p>
              <Button
                onPress={() => {
                  setFlowState({ step: 'search' });
                  clearInterval(flowState.interval);
                }}
                rightIcon="Next"
                variant="primary"
              >
                Back
              </Button>
            </FullScreenMessage>
          </Column>
        </NoNavScreen>
      );

    case 'voter-registration':
      return (
        <AddVoterScreen
          onCancel={() => setFlowState({ step: 'search' })}
          onSubmit={(registration) => {
            registerVoterMutation.mutate(
              { registrationData: registration },
              {
                onSuccess: (voter) => {
                  if (!voter) {
                    const interval = setInterval(() => {
                      setFlowState({ step: 'search' });
                    }, 5000);
                    setFlowState({ step: 'error-registration', interval });
                    return;
                  }
                  setFlowState({
                    step: 'success-registration',
                    voter,
                  });
                },
              }
            );
            setFlowState({ step: 'printing-registration' });
          }}
        />
      );

    default:
      throwIllegalValue(flowState);
  }
}
