import type {
  Voter,
  VoterRegistrationRequest,
} from '@votingworks/pollbook-backend';
import { useCallback, useState } from 'react';
import {
  Button,
  ButtonBar,
  FullScreenIconWrapper,
  FullScreenMessage,
  H1,
  Icons,
  MainHeader,
} from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/basics';
import { getDeviceStatuses, registerVoter } from './api';
import { AddVoterScreen } from './add_voter_screen';
import { AUTOMATIC_FLOW_STATE_RESET_DELAY_MS } from './globals';
import { ElectionManagerNavScreen, NoNavScreen } from './nav_screen';
import { Column } from './layout';
import { VoterName } from './shared_components';

type RegistrationFlowState =
  | { step: 'register' }
  | { step: 'printing'; registrationData: VoterRegistrationRequest }
  | { step: 'success'; voter: Voter };

export function VoterRegistrationScreen(): JSX.Element | null {
  const registerVoterMutation = registerVoter.useMutation();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const [flowState, setFlowState] = useState<RegistrationFlowState>({
    step: 'register',
  });
  const [timeoutIdForFlowStateReset, setTimeoutIdForFlowStateReset] =
    useState<ReturnType<typeof setTimeout>>();
  const resetFlowState = useCallback(() => {
    clearTimeout(timeoutIdForFlowStateReset);
    setFlowState({ step: 'register' });
  }, [timeoutIdForFlowStateReset]);

  if (!getDeviceStatusesQuery.isSuccess) {
    return null;
  }

  const { printer } = getDeviceStatusesQuery.data;
  if (!printer.connected) {
    return (
      <ElectionManagerNavScreen>
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
      </ElectionManagerNavScreen>
    );
  }

  switch (flowState.step) {
    case 'register':
      return (
        <AddVoterScreen
          onSubmit={(registrationData) => {
            setFlowState({ step: 'printing', registrationData });
            registerVoterMutation.mutate(
              { registrationData },
              {
                onSuccess: (voter) => {
                  setFlowState({ step: 'success', voter });
                  setTimeoutIdForFlowStateReset(
                    setTimeout(
                      resetFlowState,
                      AUTOMATIC_FLOW_STATE_RESET_DELAY_MS
                    )
                  );
                },
              }
            );
          }}
        />
      );

    case 'printing':
      return (
        <NoNavScreen>
          <MainHeader>
            <H1>Voter Registration</H1>
          </MainHeader>
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
          <MainHeader>
            <H1>Voter Added</H1>
          </MainHeader>
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
                <VoterName voter={flowState.voter} /> has been added
              </H1>
              <p>Give the voter their receipt.</p>
            </FullScreenMessage>
          </Column>
          <ButtonBar>
            <Button icon="X" onPress={resetFlowState}>
              Close
            </Button>
          </ButtonBar>
        </NoNavScreen>
      );

    default:
      throwIllegalValue(flowState);
  }
}
