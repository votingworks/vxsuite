import { useState } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import type {
  Voter,
  VoterRegistrationRequest,
} from '@votingworks/pollbook-backend';
import {
  Button,
  ButtonBar,
  FullScreenIconWrapper,
  FullScreenMessage,
  H1,
  Icons,
  MainHeader,
} from '@votingworks/ui';
import { Redirect, Route, Switch } from 'react-router-dom';
import { VoterSearchScreen } from './voter_search_screen';
import { VoterConfirmScreen } from './voter_confirm_screen';
import {
  NoNavScreen,
  PollWorkerNavScreen,
  pollWorkerRoutes,
} from './nav_screen';
import { Column, Row } from './layout';
import {
  checkInVoter,
  getDeviceStatuses,
  getIsAbsenteeMode,
  getVoter,
  registerVoter,
} from './api';
import { AddVoterScreen } from './add_voter_screen';
import { AbsenteeModeCallout, VoterName } from './shared_components';

type CheckInFlowState =
  | { step: 'search' }
  | { step: 'confirm'; voterId: string }
  | { step: 'printing' }
  | { step: 'success'; voterId: string };

export function VoterCheckInSuccessScreen({
  voterId,
  isAbsenteeMode,
  onClose,
}: {
  voterId: string;
  isAbsenteeMode: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const getVoterQuery = getVoter.useQuery(voterId);
  if (!getVoterQuery.isSuccess) {
    return null;
  }

  const voter = getVoterQuery.data;

  return (
    <NoNavScreen>
      <MainHeader>
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>Voter Checked In</H1>
          {isAbsenteeMode && <AbsenteeModeCallout />}
        </Row>
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
            <VoterName voter={voter} /> is checked in
          </H1>
          {!isAbsenteeMode && <p>Give the voter their receipt.</p>}
        </FullScreenMessage>
      </Column>
      <ButtonBar>
        <Button icon="X" onPress={onClose}>
          Close
        </Button>
      </ButtonBar>
    </NoNavScreen>
  );
}

export function VoterCheckInScreen(): JSX.Element | null {
  const [flowState, setFlowState] = useState<CheckInFlowState>({
    step: 'search',
  });
  const checkInVoterMutation = checkInVoter.useMutation();
  const getIsAbsenteeModeQuery = getIsAbsenteeMode.useQuery();

  if (!getIsAbsenteeModeQuery.isSuccess) {
    return null;
  }

  const isAbsenteeMode = getIsAbsenteeModeQuery.data;

  switch (flowState.step) {
    case 'search':
      return (
        <VoterSearchScreen
          isAbsenteeMode={isAbsenteeMode}
          onSelect={(voterId) => setFlowState({ step: 'confirm', voterId })}
        />
      );

    case 'confirm':
      return (
        <VoterConfirmScreen
          voterId={flowState.voterId}
          isAbsenteeMode={isAbsenteeMode}
          onCancel={() => setFlowState({ step: 'search' })}
          onConfirm={(identificationMethod) => {
            setFlowState({ step: 'printing' });
            checkInVoterMutation.mutate(
              { voterId: flowState.voterId, identificationMethod },
              {
                onSuccess: () =>
                  setFlowState({
                    step: 'success',
                    voterId: flowState.voterId,
                  }),
              }
            );
          }}
        />
      );

    case 'printing':
      return (
        <NoNavScreen>
          <MainHeader>
            <Row style={{ justifyContent: 'space-between' }}>
              <H1>Check In Voter</H1>
              {isAbsenteeMode && <AbsenteeModeCallout />}
            </Row>
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
        <VoterCheckInSuccessScreen
          voterId={flowState.voterId}
          isAbsenteeMode={isAbsenteeMode}
          onClose={() => setFlowState({ step: 'search' })}
        />
      );

    default:
      throwIllegalValue(flowState);
  }
}

type RegistrationFlowState =
  | { step: 'register' }
  | { step: 'printing'; registrationData: VoterRegistrationRequest }
  | { step: 'success'; voter: Voter };

function VoterRegistrationScreen(): JSX.Element {
  const registerVoterMutation = registerVoter.useMutation();
  const [flowState, setFlowState] = useState<RegistrationFlowState>({
    step: 'register',
  });

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
            <H1>Add Voter</H1>
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
            <Button icon="X" onPress={() => setFlowState({ step: 'register' })}>
              Close
            </Button>
          </ButtonBar>
        </NoNavScreen>
      );

    default:
      throwIllegalValue(flowState);
  }
}

export function PollWorkerScreen(): JSX.Element | null {
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();

  if (!getDeviceStatusesQuery.isSuccess) {
    return null;
  }

  const { printer } = getDeviceStatusesQuery.data;
  if (!printer.connected) {
    return (
      <PollWorkerNavScreen>
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
      </PollWorkerNavScreen>
    );
  }

  return (
    <Switch>
      <Route
        path={pollWorkerRoutes.checkIn.path}
        component={VoterCheckInScreen}
      />
      <Route
        path={pollWorkerRoutes.addVoter.path}
        component={VoterRegistrationScreen}
      />
      <Redirect to={pollWorkerRoutes.checkIn.path} />
    </Switch>
  );
}
