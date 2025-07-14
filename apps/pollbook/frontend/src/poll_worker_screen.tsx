import { useCallback, useState } from 'react';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import type {
  VoterCheckInError,
  VoterSearchParams,
} from '@votingworks/pollbook-backend';
import {
  Button,
  ButtonBar,
  FullScreenIconWrapper,
  FullScreenMessage,
  H1,
  Icons,
  MainHeader,
  P,
} from '@votingworks/ui';
import { Redirect, Route, Switch } from 'react-router-dom';
import {
  createEmptySearchParams,
  VoterSearchScreen,
} from './voter_search_screen';
import { VoterConfirmScreen } from './voter_confirm_screen';
import { NavScreen, NoNavScreen, pollWorkerRoutes } from './nav_screen';
import { Column, Row } from './layout';
import {
  checkInVoter,
  getDeviceStatuses,
  getIsAbsenteeMode,
  getVoter,
  getPollbookConfigurationInformation,
  getElection,
} from './api';
import { AbsenteeModeCallout, VoterName } from './shared_components';
import { AUTOMATIC_FLOW_STATE_RESET_DELAY_MS } from './globals';

type CheckInFlowState =
  | { step: 'search'; search: VoterSearchParams }
  | { step: 'confirm'; voterId: string; search: VoterSearchParams }
  | { step: 'printing' }
  | { step: 'success'; voterId: string }
  | { step: 'error'; errorType: VoterCheckInError };

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
    search: createEmptySearchParams(false),
  });
  const [timeoutIdForFlowStateReset, setTimeoutIdForFlowStateReset] =
    useState<ReturnType<typeof setTimeout>>();
  const checkInVoterMutation = checkInVoter.useMutation();
  const getIsAbsenteeModeQuery = getIsAbsenteeMode.useQuery();
  const getElectionQuery = getElection.useQuery();
  const getPollbookConfigurationInformationQuery =
    getPollbookConfigurationInformation.useQuery();

  const resetFlowState = useCallback(() => {
    clearTimeout(timeoutIdForFlowStateReset);
    setFlowState({
      step: 'search',
      search: createEmptySearchParams(false),
    });
  }, [timeoutIdForFlowStateReset]);

  const setSearch = useCallback((search: VoterSearchParams) => {
    setFlowState({ step: 'search', search });
  }, []);

  const onSelect = useCallback(
    (voterId: string) => {
      if (flowState.step !== 'search') {
        /* istanbul ignore next - @preserve */
        return;
      }

      setFlowState({
        step: 'confirm',
        voterId,
        search: flowState.search,
      });
    },
    [flowState]
  );

  if (
    !getIsAbsenteeModeQuery.isSuccess ||
    !getElectionQuery.isSuccess ||
    !getPollbookConfigurationInformationQuery.isSuccess
  ) {
    return null;
  }

  const isAbsenteeMode = getIsAbsenteeModeQuery.data;
  const election = assertDefined(getElectionQuery.data.unsafeUnwrap());
  const configuredPrecinctId = assertDefined(
    getPollbookConfigurationInformationQuery.data.configuredPrecinctId
  );

  switch (flowState.step) {
    case 'search':
      return (
        <VoterSearchScreen
          search={flowState.search}
          setSearch={setSearch}
          isAbsenteeMode={isAbsenteeMode}
          onSelect={onSelect}
          election={election}
          configuredPrecinctId={configuredPrecinctId}
        />
      );

    case 'confirm':
      return (
        <VoterConfirmScreen
          voterId={flowState.voterId}
          isAbsenteeMode={isAbsenteeMode}
          configuredPrecinctId={configuredPrecinctId}
          election={election}
          onCancel={() =>
            setFlowState({
              step: 'search',
              // Change the search query to match what is displayed in the user-editable inputs.
              // This prevents confusion stemming from search params not actually being
              // displayed to the user.
              search: {
                ...createEmptySearchParams(false),
                firstName: flowState.search.firstName,
                lastName: flowState.search.lastName,
              },
            })
          }
          onConfirm={(identificationMethod) => {
            setFlowState({ step: 'printing' });
            checkInVoterMutation.mutate(
              { voterId: flowState.voterId, identificationMethod },
              {
                onSuccess: (result) => {
                  if (result.isOk()) {
                    setFlowState({
                      step: 'success',
                      voterId: flowState.voterId,
                    });
                    setTimeoutIdForFlowStateReset(
                      setTimeout(
                        resetFlowState,
                        AUTOMATIC_FLOW_STATE_RESET_DELAY_MS
                      )
                    );
                  } else {
                    setFlowState({ step: 'error', errorType: result.err() });
                  }
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
          onClose={resetFlowState}
        />
      );

    case 'error': {
      let errorMessage = '';
      switch (flowState.errorType) {
        case 'already_checked_in':
          errorMessage = 'Voter Already Checked In';
          break;
        default:
          /* istanbul ignore next - @preserve */
          throwIllegalValue(flowState.errorType);
      }
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
              title={errorMessage}
              image={
                <FullScreenIconWrapper>
                  <Icons.Danger color="danger" />
                </FullScreenIconWrapper>
              }
            />
          </Column>
          <ButtonBar>
            <Button onPress={resetFlowState}>Close</Button>
          </ButtonBar>
        </NoNavScreen>
      );
    }
    default:
      /* istanbul ignore next - @preserve */
      throwIllegalValue(flowState);
  }
}

export function PollWorkerScreen(): JSX.Element | null {
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const getPollbookConfigurationInformationQuery =
    getPollbookConfigurationInformation.useQuery();

  if (
    !getDeviceStatusesQuery.isSuccess ||
    !getPollbookConfigurationInformationQuery.isSuccess
  ) {
    return null;
  }

  const { printer } = getDeviceStatusesQuery.data;

  const { configuredPrecinctId } =
    getPollbookConfigurationInformationQuery.data;
  if (!printer.connected) {
    return (
      <NavScreen>
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
      </NavScreen>
    );
  }

  if (!configuredPrecinctId) {
    return (
      <NavScreen>
        <Column>
          <FullScreenMessage
            title="No Precinct Selected"
            image={
              <FullScreenIconWrapper>
                <Icons.Disabled />
              </FullScreenIconWrapper>
            }
          >
            <P>Insert an election manager card to select a precinct.</P>
          </FullScreenMessage>
        </Column>
      </NavScreen>
    );
  }

  return (
    <Switch>
      <Route
        path={pollWorkerRoutes.checkIn.path}
        component={VoterCheckInScreen}
      />
      <Redirect to={pollWorkerRoutes.checkIn.path} />
    </Switch>
  );
}
